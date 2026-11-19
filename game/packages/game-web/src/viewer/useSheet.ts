import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { postAction } from '../api.ts';
import { zoomFactor } from '../input.ts';
import { reducedMotion } from '../motion.ts';
import { useGame } from '../store.ts';

/**
 * Лист в руках (этап 4b, решения автора 09.11) — без меню, всё руками:
 * - длинный документ — страницами, как бумага (PG-A): за листом стопка, щелчок по ней или по
 *   загнутому уголку — страница (и ←/→);
 * - документ не переворачивается и не вертится (FL-A): он «живой», как игровая карточка — чуть
 *   наклоняется к курсору, по бумаге скользит блик;
 * - колесо — ближе к точке под курсором (глубоко — крупный план от движка); средняя кнопка — как
 *   было.
 */

/** Зазор между страницами в потоке колонок, px. */
const GAP = 64;
/** Приближение, после которого лист рассматривают «крупным планом». */
export const CLOSEUP_AT = 2.4;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.2;
/** Наклон «живого» листа к курсору, градусы по каждой оси. */
const TILT = 6;

export interface Zoom {
  s: number;
  tx: number;
  ty: number;
}

export function useSheet(
  materialId: string | null,
  refs: {
    zoom: RefObject<HTMLDivElement | null>;
    pages: RefObject<HTMLDivElement | null>;
    flow: RefObject<HTMLDivElement | null>;
  },
) {
  // ── Страницы ──
  const [pageH, setPageH] = useState<number | null>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(0);
  const step = useCallback(() => (refs.pages.current?.clientWidth ?? 0) + GAP, [refs]);

  // Длинный документ — страницами: поток в колонки высотой со страницу.
  useLayoutEffect(() => {
    const flow = refs.flow.current;
    const box = refs.pages.current;
    if (!flow || !box) return;
    const measure = () => {
      const paper = box.closest('.viewer-paper') as HTMLElement | null;
      const view = box.closest('.viewer') as HTMLElement | null;
      if (!paper || !view) return;
      const cs = getComputedStyle(paper);
      const pad = Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom);
      const vs = getComputedStyle(view);
      const room =
        view.clientHeight - Number.parseFloat(vs.paddingTop) - Number.parseFloat(vs.paddingBottom);
      // Страница — не выше экрана и не длиннее листа A4 по ширине.
      const h = Math.floor(Math.min(room, paper.clientWidth * Math.SQRT2) - pad);
      flow.style.columnWidth = '';
      flow.style.height = '';
      // Высота текста — вместе с полями первого и последнего абзаца: они выходят за поток (схлопываются
      // наружу), и без них лист чуть длиннее страницы не делился и вылезал за край экрана.
      const natural = Math.max(flow.scrollHeight, box.scrollHeight);
      setPageH(natural > h + 2 ? h : null);
    };
    measure();
    window.addEventListener('resize', measure);
    // Текст вырос после первого замера (догрузились шрифты, перестроилась разметка) — лист без
    // страниц вылез бы за край экрана и встал не по центру (CI, письмо 01 пакета v3.4): пересчитать.
    // Только пока страниц нет: у страниц высота потока задана, его размер не меняется.
    const again = () => {
      if (!flow.style.height) measure();
    };
    const grew = new ResizeObserver(again);
    grew.observe(flow);
    void document.fonts?.ready.then(again);
    return () => {
      window.removeEventListener('resize', measure);
      grew.disconnect();
    };
  }, [refs]);

  useLayoutEffect(() => {
    const flow = refs.flow.current;
    const box = refs.pages.current;
    if (!flow || !box) return;
    if (pageH === null) {
      setPages(1);
      return;
    }
    flow.style.height = `${pageH}px`;
    flow.style.columnWidth = `${box.clientWidth}px`;
    flow.style.columnGap = `${GAP}px`;
    setPages(Math.max(1, Math.round((flow.scrollWidth + GAP) / step())));
  });

  const goTo = useCallback(
    (p: number) => {
      const n = Math.max(0, Math.min(pages - 1, p));
      setPage(n);
      refs.pages.current?.scrollTo({ left: n * step(), behavior: 'auto' });
    },
    [pages, refs, step],
  );

  /** Страница, на которой сейчас точка (после поиска: подсветка прокрутила поток). */
  const snapToShown = useCallback(() => {
    const box = refs.pages.current;
    if (!box || pages < 2) return;
    goTo(Math.round(box.scrollLeft / step()));
  }, [goTo, pages, refs, step]);

  /** Лист — на странице, где точка потока с экранной координатой x (найденное поиском). */
  const showX = useCallback(
    (x: number) => {
      const flow = refs.flow.current;
      if (!flow || pages < 2) return;
      goTo(Math.floor((x - flow.getBoundingClientRect().left) / step()));
    },
    [goTo, pages, refs, step],
  );

  // Поток сдвинули не мы (Tab, браузер): лист ложится на ближайшую страницу.
  useEffect(() => {
    const box = refs.pages.current;
    if (!box) return;
    const onScroll = () => {
      const n = Math.round(box.scrollLeft / step());
      if (Math.abs(box.scrollLeft - n * step()) > 1) box.scrollLeft = n * step();
      setPage(n);
    };
    box.addEventListener('scroll', onScroll);
    return () => box.removeEventListener('scroll', onScroll);
  }, [refs, step]);

  // ── Живой лист (решение автора 09.11, FL-A + наклон «как карточка») ──
  // Документы не переворачиваются и не вертятся: водишь мышью над листом — он чуть наклоняется
  // к курсору и по бумаге скользит блик, как у игровой карточки. Пока зажата кнопка (выделение),
  // при приближении и при «уменьшить движение» — лист ровный.
  const [tilt, setTilt] = useState({ x: 0, y: 0, gx: 50, gy: 30 });
  const pressed = useRef(false);

  // Ответ движка на действие — один раз на цель; дальше — тот же.
  const answers = useRef(new Map<string, Promise<string>>());

  const ask = useCallback((target: string, value: string): Promise<string> => {
    const key = `${target}|${value}`;
    let got = answers.current.get(key);
    if (!got) {
      got = postAction('ОСМОТР', target, value)
        .then((r) => {
          if (r.released.length) useGame.getState().addReleased(r.released);
          return r.quiet ? '' : r.reply;
        })
        .catch(() => '');
      answers.current.set(key, got);
    }
    return got;
  }, []);

  // ── Приближение ──
  const [zoom, setZoom] = useState<Zoom>({ s: 1, tx: 0, ty: 0 });
  const [closeup, setCloseup] = useState<string | null>(null);

  /** Где приближают — крупный план того, что под курсором (4b-2a). */
  const zoomPoint = useRef<{ x: number; y: number } | null>(null);
  /** `zoom` — сила прокрутки в пикселях (> 0 — отдалить): приближение плавное (TP-C). */
  const onWheel = (clientX: number, clientY: number, zoom: number) => {
    const el = refs.zoom.current;
    if (!el) return;
    zoomPoint.current = { x: clientX, y: clientY };
    setZoom((z) => {
      const s2 = Math.max(1, Math.min(ZOOM_MAX, z.s * zoomFactor(zoom, ZOOM_STEP)));
      if (s2 === 1) return { s: 1, tx: 0, ty: 0 };
      const r = el.getBoundingClientRect();
      // Точка под курсором остаётся под курсором (масштаб от левого верхнего угла листа).
      const ox = r.left - z.tx;
      const oy = r.top - z.ty;
      const lx = (clientX - ox - z.tx) / z.s;
      const ly = (clientY - oy - z.ty) / z.s;
      return { s: s2, tx: clientX - ox - s2 * lx, ty: clientY - oy - s2 * ly };
    });
  };

  const near = zoom.s >= CLOSEUP_AT;
  // Крупный план спрашивает движок о том, что под курсором: у части листа своя цель
  // (`data-osmotr-target`, действие — `data-osmotr-value`, по умолчанию «увеличить»): торец пачки,
  // строка описи пачки (4b-2a). Иначе — весь материал, как раньше.
  const [focus, setFocus] = useState<{ target: string; value: string } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: цель — после каждого шага колеса (zoom)
  useEffect(() => {
    if (!near || !materialId) {
      setFocus(null);
      return;
    }
    const p = zoomPoint.current;
    const part = p
      ? document
          .elementsFromPoint(p.x, p.y)
          .map((e) => e.closest<HTMLElement>('[data-osmotr-target]'))
          .find((e) => e !== null)
      : null;
    const next = part?.dataset.osmotrTarget
      ? { target: part.dataset.osmotrTarget, value: part.dataset.osmotrValue ?? 'увеличить' }
      : { target: materialId, value: 'увеличить' };
    setFocus((cur) => (cur && cur.target === next.target && cur.value === next.value ? cur : next));
  }, [near, zoom, materialId]);
  useEffect(() => {
    if (!focus) {
      setCloseup(null);
      return;
    }
    let live = true;
    void ask(focus.target, focus.value).then((t) => {
      if (live) setCloseup(t || null);
    });
    return () => {
      live = false;
    };
  }, [focus, ask]);

  /** Мышь над листом: край под курсором чуть приподнимается к игроку (до TILT°), блик — там, где курсор; уголок под мышью не уезжает. */
  const onHover = (clientX: number, clientY: number, buttons: number) => {
    pressed.current = buttons !== 0;
    const el = refs.zoom.current;
    if (!el || pressed.current) return;
    if (zoom.s !== 1 || reducedMotion()) {
      setTilt((t) => (t.x || t.y ? { ...t, x: 0, y: 0 } : t));
      return;
    }
    const r = el.getBoundingClientRect();
    const nx = Math.max(-1, Math.min(1, ((clientX - r.left) / r.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((clientY - r.top) / r.height) * 2 - 1));
    setTilt({
      x: ny * TILT,
      y: -nx * TILT,
      gx: Math.round(((nx + 1) / 2) * 100),
      gy: Math.round(((ny + 1) / 2) * 100),
    });
  };
  /** Мышь ушла из окна — лист ложится ровно. */
  const onLeave = () => setTilt((t) => ({ ...t, x: 0, y: 0 }));

  // Лист следит за мышью по всему окну, а не только над просмотрщиком: папка запроса и
  // кнопки лежат поверх — над ними лист помнит, где мышь, и не ложится ровно (правка автора 09.11).
  const hover = useRef(onHover);
  hover.current = onHover;
  useEffect(() => {
    const move = (e: globalThis.PointerEvent) => hover.current(e.clientX, e.clientY, e.buttons);
    const out = () => setTilt((t) => ({ ...t, x: 0, y: 0 }));
    window.addEventListener('pointermove', move);
    document.documentElement.addEventListener('mouseleave', out);
    return () => {
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('mouseleave', out);
    };
  }, []);

  /** Зажатое колесо — сдвинуть приближённый лист (правка автора 10.11). */
  const pan = (dx: number, dy: number) =>
    setZoom((z) => (z.s === 1 ? z : { ...z, tx: z.tx + dx, ty: z.ty + dy }));

  /** Правая кнопка — как было: без приближения (правка автора 10.11; прежде — средняя). */
  const reset = () => {
    setZoom({ s: 1, tx: 0, ty: 0 });
    onLeave();
  };

  return {
    pages,
    page,
    goTo,
    snapToShown,
    showX,
    paged: pageH !== null,
    tilt,
    zoom,
    onWheel,
    pan,
    closeup,
    reset,
  };
}
