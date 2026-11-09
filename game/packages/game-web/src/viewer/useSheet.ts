import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { postAction } from '../api.ts';
import { useGame } from '../store.ts';

/**
 * Лист в руках (этап 4b, решения автора 09.11) — без меню, всё руками:
 * - длинный документ — страницами, как бумага (PG-A): навёл на край листа — стрелка, щелчок —
 *   страница (и ←/→);
 * - перевернуть — тянуть за поле или край листа (ROT-A); по тексту тянут — выделение (SEL-C);
 *   лист только переворачивается и ложится ровно, лицом или оборотом (SHEET-FLAT);
 * - колесо — ближе к точке под курсором; средняя кнопка — как было.
 * Оборот и крупный план спрашивают движок (ОСМОТР | лист | перевернуть / увеличить): на обороте —
 * его ответ (пустой — «Оборот чистый.»), открытое — во «Входящие».
 */

/** Зазор между страницами в потоке колонок, px. */
const GAP = 64;
/** Приближение, после которого лист рассматривают «крупным планом». */
export const CLOSEUP_AT = 2.4;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.2;
const CLICK_PX = 4;

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
      const natural = flow.scrollHeight;
      setPageH(natural > h + 2 ? h : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
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

  // ── Переворот ──
  const [angle, setAngle] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const side: 'front' | 'back' = Math.round(angle / 180) % 2 !== 0 ? 'back' : 'front';
  const moved = useRef(0);
  const [back, setBack] = useState<string | null>(null);
  // Ответ движка на действие — один раз на лист; дальше — тот же (оборот не пропадает).
  const answers = useRef(new Map<string, Promise<string>>());

  const ask = useCallback(
    (value: 'перевернуть' | 'увеличить'): Promise<string> => {
      if (!materialId) return Promise.resolve('');
      let got = answers.current.get(value);
      if (!got) {
        got = postAction('ОСМОТР', materialId, value)
          .then((r) => {
            if (r.released.length) useGame.getState().addReleased(r.released);
            return r.quiet ? '' : r.reply;
          })
          .catch(() => '');
        answers.current.set(value, got);
      }
      return got;
    },
    [materialId],
  );

  useEffect(() => {
    if (side !== 'back' || back !== null) return;
    if (!materialId) {
      setBack('');
      return;
    }
    void ask('перевернуть').then(setBack);
  }, [side, back, ask, materialId]);

  /** Тянуть за поле или край — перевернуть; по тексту — это выделение, не трогаем. */
  const onFlipDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const t = e.target as Element;
    if (t.closest('.viewer-flow')) return;
    const x0 = e.clientX;
    const a0 = angle;
    moved.current = 0;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      moved.current = Math.abs(dx);
      if (moved.current < CLICK_PX) return;
      setFlipping(true);
      setAngle(a0 + dx * 0.6);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setFlipping(false);
      // Лист ложится ровно: лицом или оборотом, как ближе.
      setAngle((a) => Math.round(a / 180) * 180);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  /** Щелчок после протяжки — не щелчок (стрелка страницы не срабатывает). */
  const wasDrag = () => moved.current >= CLICK_PX;

  // ── Приближение ──
  const [zoom, setZoom] = useState<Zoom>({ s: 1, tx: 0, ty: 0 });
  const [closeup, setCloseup] = useState<string | null>(null);

  const onWheel = (clientX: number, clientY: number, deltaY: number) => {
    const el = refs.zoom.current;
    if (!el) return;
    setZoom((z) => {
      const s2 = Math.max(1, Math.min(ZOOM_MAX, z.s * (deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));
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
  useEffect(() => {
    if (!near) {
      setCloseup(null);
      return;
    }
    void ask('увеличить').then((t) => setCloseup(t || null));
  }, [near, ask]);

  /** Средняя кнопка — как было: лицом, без приближения. */
  const reset = () => {
    setZoom({ s: 1, tx: 0, ty: 0 });
    setAngle((a) => Math.round(a / 360) * 360);
  };

  return {
    pages,
    page,
    goTo,
    snapToShown,
    showX,
    paged: pageH !== null,
    angle,
    side,
    flipping,
    back,
    onFlipDown,
    wasDrag,
    zoom,
    onWheel,
    closeup,
    reset,
  };
}
