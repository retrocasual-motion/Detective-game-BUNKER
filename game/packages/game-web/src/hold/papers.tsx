import { type ThreeEvent, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BackSide,
  type CanvasTexture,
  FrontSide,
  type Group,
  type Mesh,
  PlaneGeometry,
  Vector3,
} from 'three';
import { reducedMotion } from '../motion.ts';
import type { Bundle, Sheet } from '../viewer/bundles.ts';
import { SETTLED, useAnimate } from './animate.ts';
import { holdPart, setPartCursor, useSpot } from './Held3D.tsx';
import { Plate, useActive, useTexture } from './shapes.tsx';
import { paintTexture } from './texture.ts';

/**
 * Пачки бумаг из помещений (29) — физическая улика (PH-B, решения автора 10.11): коробка с
 * девятью пачками, пачку берут в руки и крутят. Сверху — верхний лист; по краям — торец:
 * бумага, а где есть, слои картона (выступают чуть шире листов, темнее); снизу — картонная
 * подложка с ярлыком бюро. Пачку листают прямо в руках (LF-A): листы переворачиваются через
 * левый край и ложатся вплотную слева, как в книге. Размеры — как в жизни (A4), толщина по числу
 * листов чуть преувеличена, чтобы торец читался.
 */

const PAPER = '#ece7da';
const SHEET = '#f4f1e8';
const CARD = '#8c6f4c';
const BASE = '#7a6248';
const INK = '#2b2925';
const BOX = '#8a7656';

/** Лист A4 в единицах сцены. */
const W = 2.1;
const H = 2.97;
const CARD_T = 0.014;
const BASE_T = 0.03;

/**
 * Толщина пачки по числу листов — преувеличена, чтобы торец читался, но не слишком: у толстой
 * пачки (96 л.) высокий верх в перспективе «уводил» лист при перевороте (правка автора 10.11).
 */
export const stackDepth = (sheets: number) => 0.02 + sheets * 0.0032;

/** Где лежит слой картона «перед листом n» (1 — сверху), по оси толщины (верх — +d/2). */
const layerZ = (n: number, sheets: number, d: number) => d / 2 - ((n - 1) / sheets) * d;

/** Код дела в тексте («A-24»). */
const CODE = /A-\d+/;

// ── Лица листов: рисуются один раз и живут в общем кэше (переворот — без задержки). ──

/** Листы пачек рисуются в 0,6 полного разрешения: их много, а видеокарте грузить быстрее. */
const FACE_SCALE = 0.6;
const FACE_CACHE = 24;
/** Единиц текстуры в единице сцены (texture.ts). */
const PX = 680;
const faces = new Map<string, CanvasTexture>();

const faceKey = (s: Sheet, slip: string | null) =>
  `${s.cover ?? '-'}|${s.faceDown ? 1 : 0}|${slip ?? ''}|${s.text}`;

/** Лицо листа: текст, обложка папки (картон с наклейкой) или оборот (лежит текстом вниз). */
function faceTexture(s: Sheet, slip: string | null = null): CanvasTexture {
  const key = faceKey(s, slip);
  const hit = faces.get(key);
  if (hit) {
    faces.delete(key);
    faces.set(key, hit);
    return hit;
  }
  const len = (y: number) => 0.5 + ((y * 7) % 30) / 100;
  const tex =
    s.cover !== null
      ? paintTexture(
          W,
          H,
          CARD,
          ({ ctx, w, h, text }) => {
            if (!s.cover) return;
            ctx.fillStyle = '#f1ead6';
            ctx.fillRect(w * 0.3, h * 0.12, w * 0.4, h * 0.1);
            ctx.fillStyle = INK;
            text(s.cover, w * 0.36, h * 0.135, w * 0.3, '700 120px system-ui, sans-serif', 130);
          },
          FACE_SCALE,
        )
      : paintTexture(
          W,
          H,
          SHEET,
          ({ ctx, w, h, text }) => {
            if (s.faceDown) {
              // Оборот: пусто; сквозь бумагу просвечивают строки (зеркально) и пятно штампа.
              ctx.fillStyle = 'rgb(0 0 0 / 6%)';
              for (let y = h * 0.14; y < h * 0.86; y += 46)
                ctx.fillRect(w * (0.91 - len(y)), y, w * len(y), 9);
              ctx.fillStyle = 'rgb(40 70 150 / 14%)';
              ctx.beginPath();
              ctx.arc(w * 0.16, h * 0.1, w * 0.07, 0, Math.PI * 2);
              ctx.fill();
              return;
            }
            ctx.fillStyle = INK;
            let y = text(s.text, w * 0.09, h * 0.12, w * 0.82, '64px Georgia, serif', 80);
            // Ниже — строки листа, мелко (с руки не прочесть).
            ctx.fillStyle = 'rgb(0 0 0 / 16%)';
            for (y += 40; y < h * 0.9; y += 46) ctx.fillRect(w * 0.09, y, w * len(y), 10);
          },
          FACE_SCALE,
        );
  if (slip) {
    // Ярлык бюро — на самом листе: переворачивается вместе с ним (правка автора 10.11).
    const ctx = (tex.image as HTMLCanvasElement).getContext('2d');
    if (ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(FACE_SCALE, FACE_SCALE);
      ctx.translate(0.06 * PX, 0.035 * PX);
      ctx.rotate(0.04);
      ctx.fillStyle = '#efe6cc';
      ctx.fillRect(0, 0, 1.1 * PX, 0.3 * PX);
      ctx.fillStyle = INK;
      ctx.font = '600 56px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(slip, 0.06 * PX, 0.066 * PX, 1.0 * PX);
      ctx.restore();
      tex.needsUpdate = true;
    }
  }
  faces.set(key, tex);
  while (faces.size > FACE_CACHE) {
    const [old, t] = faces.entries().next().value as [string, CanvasTexture];
    faces.delete(old);
    t.dispose();
  }
  return tex;
}

function useFace(s: Sheet, slip: string | null = null) {
  const key = faceKey(s, slip);
  // biome-ignore lint/correctness/useExhaustiveDependencies: лицо меняется только с ключом листа
  return useMemo(() => faceTexture(s, slip), [key]);
}

/** Верхний лист пачки, пока её не листали: текст превью (материал 29); у П-09 сверху — обложка. */
const topOf = (b: Bundle): Sheet => ({
  text: b.top,
  faceDown: false,
  cover: b.layers.includes(1) ? (CODE.exec(b.top)?.[0] ?? '') : null,
});

/** Лист, о котором ещё ничего не известно (опись не пришла): чистые строки. */
const BLANK: Sheet = { text: '', faceDown: false, cover: null };

const slipOf = (b: Bundle) => `${b.id} · ${b.room} · ${b.sheets} л.`;

/** Протянуть мышью столько, px, — край вытащен до конца. */
const PULL_PX = 160;
/** Выступ картона за край листа: в покое — на волосок, при наведении — средне (правка автора 10.11). */
const OUT_REST = 0.012;
const OUT_HOVER = 0.045;
/** Плавность: как выезжает папка запроса (~0,3 с). */
const SMOOTH = 9;

const ease = (dt: number) => (reducedMotion() ? 1 : 1 - Math.exp(-dt * SMOOTH));

/**
 * Слой картона в пачке (RD-A, решения автора 10.11). Ловится легко: вокруг края — невидимая
 * зона захвата (шире и толще самого картона), и уже когда пачку чуть повернули (сверху и снизу
 * её вращают, как обычно). Навели — край плавно выдвигается (средне, не резко) и курсор «рука».
 * Потянуть — картон выезжает за мышью; отпустили раньше половины — плавно вернулся; дальше —
 * вытащен. С клавиатуры — невидимая кнопка края.
 */
function CardLayer({ n, z, onPull }: { n: number; z: number; onPull: () => void }) {
  const [hover, setHover] = useState(false);
  const slide = useRef({ now: 0, to: 0, dragging: false });
  const out = useRef(OUT_REST);
  const body = useRef<Mesh>(null);
  const group = useRef<Group>(null);
  const anchor = useRef<Group>(null);
  useSpot(anchor, {
    id: `layer-${n}`,
    label: 'Вытащить картон из пачки',
    testId: `stack-layer-${n}`,
    onClick: onPull,
  });
  useEffect(() => () => setPartCursor(''), []);
  useAnimate((dt) => {
    const k = ease(dt);
    const outTo = hover ? OUT_HOVER : OUT_REST;
    out.current += (outTo - out.current) * k;
    body.current?.scale.set((W + 2 * out.current) / W, (H + 2 * out.current) / H, 1);
    const sl = slide.current;
    sl.now = sl.dragging ? sl.to : sl.now + (sl.to - sl.now) * k;
    if (group.current) group.current.position.x = sl.now * W * 0.9;
    return Math.abs(outTo - out.current) + Math.abs(sl.to - sl.now) > SETTLED;
  });
  // Пачку видно сбоку: луч мыши не вдоль её толщины; и зона захвата — ближе всего к мыши.
  const reach = (e: ThreeEvent<PointerEvent>) => {
    if (e.intersections[0]?.object !== e.object) return false;
    const axis = e.object.getWorldDirection(new Vector3());
    // Сбоку — уже при повороте на 15–20° (правка автора 10.11); прямо сверху — нет.
    return Math.abs(axis.dot(e.ray.direction)) < 0.975;
  };
  const down = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || !reach(e)) return;
    e.stopPropagation();
    holdPart();
    setPartCursor('grabbing');
    const x0 = e.clientX;
    const y0 = e.clientY;
    const sl = slide.current;
    sl.dragging = true;
    const move = (ev: PointerEvent) => {
      sl.to = Math.min(1, Math.hypot(ev.clientX - x0, ev.clientY - y0) / PULL_PX);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setPartCursor('');
      sl.dragging = false;
      if (sl.to >= 0.5) {
        sl.to = 1;
        onPull();
      } else sl.to = 0;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <group position={[0, 0, z]}>
      <group ref={group}>
        <mesh ref={body}>
          <boxGeometry args={[W, H, CARD_T]} />
          <meshStandardMaterial color={CARD} roughness={0.95} />
        </mesh>
        {/* Зона захвата: шире края и толще картона, невидима. */}
        <mesh
          onPointerDown={down}
          onPointerMove={(e) => {
            const on = reach(e);
            if (on !== hover) {
              setHover(on);
              setPartCursor(on ? 'pointer' : '');
            }
          }}
          onPointerOut={() => {
            if (!hover) return;
            setHover(false);
            setPartCursor('');
          }}
        >
          <boxGeometry args={[W + 0.2, H + 0.2, 0.09]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      {/* Кнопка края — у правого торца, видна, когда торец смотрит на игрока. */}
      <group ref={anchor} position={[W / 2 + OUT_HOVER, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
    </group>
  );
}

/** Сколько длится переворот листа, мс. */
const FLIP_MS = 520;

interface Flip {
  /** 1 — вперёд (справа налево), −1 — назад. */
  dir: 1 | -1;
  at: number;
  sheet: Sheet;
  slip: string | null;
  /** Высота верха правой и левой стопки, между которыми лист летит. */
  zRight: number;
  zLeft: number;
}

/**
 * Лист, который перекладывают (правки автора 10.11: «живой», не доска; без прыжков): лист гнётся —
 * поднимается от корешка, свободный край отстаёт и догоняет; лицом — его текст, оборотом —
 * чистая бумага. Корешок — левый край пачки; лист плавно опускается с высоты одной стопки на
 * высоту другой и ложится вплотную слева.
 */
function Flying({ flip, onDone }: { flip: Flip; onDone: () => void }) {
  const geo = useMemo(() => new PlaneGeometry(W, H, 28, 1), []);
  const base = useMemo(() => Float32Array.from(geo.getAttribute('position').array), [geo]);
  const face = useFace(flip.sheet, flip.slip);
  const group = useRef<Group>(null);
  const done = useRef(false);
  useEffect(() => () => geo.dispose(), [geo]);
  useAnimate(() => {
    if (done.current) return false;
    const t = reducedMotion() ? 1 : Math.min(1, (performance.now() - flip.at) / FLIP_MS);
    const e = (1 - Math.cos(Math.PI * t)) / 2;
    const p = flip.dir === 1 ? e : 1 - e;
    // Угол у корешка и изгиб: свободный край отстаёт сильнее всего посреди переворота.
    const phi = Math.PI * p;
    const k = (1.1 * Math.sin(Math.PI * p)) / W;
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const u = (base[i * 3] ?? 0) + W / 2;
      const y = base[i * 3 + 1] ?? 0;
      // Лист — дуга: угол вдоль листа a(s) = phi − k·s; координаты — интеграл от корешка.
      const x = k < 1e-4 ? u * Math.cos(phi) : (Math.sin(phi) - Math.sin(phi - k * u)) / k;
      const zz = k < 1e-4 ? u * Math.sin(phi) : (Math.cos(phi - k * u) - Math.cos(phi)) / k;
      pos.setXYZ(i, -W / 2 + x, y, zz);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    // Корешок — с высоты одной стопки на высоту другой: лист не падает в конце.
    if (group.current) group.current.position.z = flip.zRight + (flip.zLeft - flip.zRight) * p;
    if (t >= 1) {
      done.current = true;
      onDone();
    }
    return !done.current;
  });
  return (
    <group ref={group} position={[0, 0, flip.zRight]}>
      <mesh geometry={geo}>
        <meshStandardMaterial map={face} roughness={0.9} side={FrontSide} />
      </mesh>
      <mesh geometry={geo}>
        <meshStandardMaterial color={SHEET} roughness={0.9} side={BackSide} />
      </mesh>
    </group>
  );
}

/**
 * Пачка целиком (PH-B, LF-A): бумага, слои картона, подложка. Щелчок по верхнему листу — он
 * переворачивается через левый край и ложится вплотную слева, лицом вниз, как в книге; щелчок
 * по левой стопке — вернуть лист. Пачка не прыгает и не съезжает: она на месте и того же
 * размера, листы ложатся слева от неё; пока лист в полёте, его нет ни в одной стопке. Обложку папки
 * листают, как лист; папку берут за край. Листы текстом вниз — щелчок переворачивает их.
 */
export function PaperStack({
  bundle: b,
  sheets,
  page,
  onNext,
  onPrev,
  onPull,
  onTurnOver,
}: {
  bundle: Bundle;
  /** Листы по описи — когда опись пришла (до того известен только верхний). */
  sheets: Sheet[] | null;
  /** Сколько листов уже переложено в левую стопку. */
  page: number;
  onNext: () => void;
  onPrev: () => void;
  /** Взяли папку: слой картона (обложку), что лежит перед листом n. */
  onPull: (n: number) => void;
  /** Перевернуть листы, что лежат текстом вниз. */
  onTurnOver: () => void;
}) {
  const sheetAt = (i: number): Sheet => (i === 0 ? topOf(b) : (sheets?.[i] ?? BLANK));
  const slipAt = (i: number) => (i === 0 ? slipOf(b) : null);
  const [flip, setFlip] = useState<Flip | null>(null);
  const d0 = stackDepth(b.sheets);
  // Обе стопки лежат на одной плоскости (низ исходной пачки): правая убывает, левая растёт.
  const floor = -d0 / 2;
  // Пока лист в полёте, его нет ни в одной стопке.
  const leftCount = flip?.dir === 1 ? page - 1 : page;
  const rightFirst = flip?.dir === -1 ? page + 1 : page;
  const rest = b.sheets - rightFirst;
  const dR = stackDepth(rest);
  const dL = leftCount > 0 ? stackDepth(leftCount) : 0;
  const top = sheetAt(rightFirst);
  const face = useFace(top, slipAt(rightFirst));
  const topN = rightFirst + 1;
  const base = useTexture(
    () =>
      paintTexture(W + 0.08, H + 0.08, BASE, ({ ctx, w, h, text }) => {
        ctx.fillStyle = '#efe6cc';
        ctx.fillRect(w * 0.25, h * 0.4, w * 0.5, h * 0.14);
        ctx.fillStyle = INK;
        text(`${b.id}`, w * 0.3, h * 0.42, w * 0.4, '700 90px system-ui, sans-serif', 100);
        text(b.room, w * 0.3, h * 0.47, w * 0.4, '50px system-ui, sans-serif', 60);
      }),
    [b.id, b.room],
  );
  // Что делает щелчок по верхнему листу: листает — и обложку папки тоже (правка автора 10.11: у
  // П-09 сверху обложка, щелчки вынимали папки одну за другой); папку берут только за край.
  const act = top.faceDown ? onTurnOver : onNext;
  const label = top.faceDown ? 'Перевернуть листы' : 'Перелистнуть лист';
  // Щелчки во время переворота — в очередь: лист доигрывает, потом следующий (правка автора
  // 10.11: перелистывание не прерывается). На обложке и листах текстом вниз очередь стоп.
  const queued = useRef(0);
  const flying = flip !== null;
  const plain = top.cover === null && !top.faceDown;
  const now = useRef({ act, flying, plain });
  now.current = { act, flying, plain };
  const leaf = useActive('leaf', label, 'stack-leaf', () => {
    if (now.current.flying) {
      if (now.current.plain) queued.current = Math.min(queued.current + 1, 5);
      return;
    }
    now.current.act();
  });
  const back = useActive('back', 'Вернуть лист', 'stack-back', () => {
    if (!now.current.flying) onPrev();
  });
  useEffect(() => {
    if (flying || queued.current === 0) return;
    if (!plain) {
      queued.current = 0;
      return;
    }
    queued.current--;
    now.current.act();
  }, [flying, plain]);
  // Новый шаг — лист в полёт: вперёд — тот, что был сверху; назад — тот, что вернули.
  const last = useRef(page);
  // biome-ignore lint/correctness/useExhaustiveDependencies: шаг листания — только по page
  useEffect(() => {
    const was = last.current;
    last.current = page;
    // «Уменьшить движение»: лист ложится сразу, без полёта — и щелчок сразу после смены номера
    // не попадает в переворот (на обложке он бы пропал).
    if (page === was || reducedMotion()) return;
    const dir = page > was ? 1 : -1;
    const i = dir === 1 ? page - 1 : page;
    const restNow = b.sheets - page;
    setFlip({
      dir,
      at: performance.now(),
      sheet: sheetAt(i),
      slip: slipAt(i),
      zRight: floor + stackDepth(dir === 1 ? restNow + 1 : restNow) + 0.004,
      zLeft: floor + stackDepth(dir === 1 ? page : page + 1) + 0.004,
    });
  }, [page]);
  // Следующий лист рисуется заранее, пока смотрят на этот, — переворот без задержки.
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!sheets) return;
    const id = setTimeout(() => gl.initTexture(faceTexture(sheets[page + 1] ?? BLANK)), 60);
    return () => clearTimeout(id);
  }, [sheets, page, gl]);
  // Пачка не двигается: лист открывается влево, как обложка книги (правка автора 10.11).
  return (
    <group scale={0.78}>
      <group>
        {/* Пачка справа: что осталось. */}
        {rest > 0 && (
          <mesh position={[0, 0, floor + dR / 2]}>
            <boxGeometry args={[W, H, dR]} />
            <meshStandardMaterial color={PAPER} roughness={0.95} />
          </mesh>
        )}
        {b.layers
          .filter((n) => n >= topN)
          .map((n) => (
            <CardLayer
              key={n}
              n={n}
              z={floor + dR / 2 + layerZ(n - rightFirst, rest, dR)}
              onPull={() => onPull(n)}
            />
          ))}
        {/* Подложка снизу — картон с ярлыком бюро. */}
        <mesh position={[0, 0, floor - BASE_T / 2]}>
          <boxGeometry args={[W + 0.08, H + 0.08, BASE_T]} />
          <meshStandardMaterial color={BASE} roughness={0.95} />
        </mesh>
        <Plate w={W + 0.08} h={H + 0.08} z={floor - BASE_T - 0.001} back map={base} />
        {rest > 0 && (
          <group position={[0, 0, floor + dR + 0.001]} ref={leaf.anchor}>
            <mesh {...leaf.handlers}>
              <planeGeometry args={[W, H]} />
              <meshStandardMaterial
                map={face}
                roughness={0.9}
                emissive="#ffffff"
                emissiveIntensity={leaf.hover ? 0.06 : 0}
              />
            </mesh>
          </group>
        )}
        {/* Слева, вплотную — переложенные листы, лицом вниз; щелчок — вернуть верхний. */}
        {leftCount > 0 && (
          <group position={[-W, 0, floor + dL / 2]}>
            <mesh {...back.handlers}>
              <boxGeometry args={[W, H, dL]} />
              <meshStandardMaterial
                color={SHEET}
                roughness={0.95}
                emissive="#ffffff"
                emissiveIntensity={back.hover ? 0.06 : 0}
              />
            </mesh>
            <group position={[0, 0, dL / 2 + 0.001]} ref={back.anchor} />
          </group>
        )}
        {flip && (
          <Flying
            key={flip.at}
            flip={flip}
            onDone={() => setFlip((f) => (f && f.at === flip.at ? null : f))}
          />
        )}
      </group>
    </group>
  );
}

/**
 * Коробка — архивный короб для изъятого (BX-A, решение автора 10.11): как в жизни (короб для
 * документов ~38×30×25 см, конверты из крафта с расширением ~229×324 мм стоят на ребре по
 * порядку, как в картотеке; на верхнем крае каждого — бумажный ярлык с номером пачки). Размеры
 * ниже — в единицах сцены: 1 см ≈ 0,08.
 */
const BOX_W = 3.04;
const BOX_D = 2.4;
const BOX_H = 2.0;
const WALL = 0.05;
const ENV_W = 2.6;
const ENV_H = 1.83;
/** Толщина конверта: сам конверт и пачка в нём (листы чуть толще, чтобы П-01 читалась). */
const envDepth = (sheets: number) => 0.035 + sheets * 0.0011;
const KRAFT = '#b48d5f';
/** Ярлыки по верхнему краю — вразбивку (слева, по центру, справа), чтобы читались все. */
const TAB_X = [-0.8, 0, 0.8];
const TAB: [number, number] = [0.86, 0.3];
/** Насколько конверт приподнимается при наведении и куда уходит, когда его вынули. */
const LIFT_HOVER = 0.1;
const LIFT_OUT = 1.6;

/**
 * Заслонка наведения: стенки короба и сами конверты не пропускают мышь к тому, что за ними
 * (правка автора 10.11: вёл мышью по передней стенке — конверты за ней поднимались).
 */
const stop = (e: ThreeEvent<PointerEvent>) => e.stopPropagation();
const BLOCK = { onPointerOver: stop, onPointerMove: stop };

/**
 * Коробка с пачками (BX-A, решение автора 10.11): открытый архивный короб, наклонён к игроку;
 * внутри девять крафтовых конвертов стоят на ребре, как папки в картотеке, у каждого на верхнем
 * крае — ярлык «П-05 · Медкабинет». Навели — конверт чуть приподнимается; щелчок — конверт
 * выходит вверх, пачка из него — в руках. Опустевший конверт (все папки вынуты) остаётся тонким.
 */
export function PapersBox({ bundles, onPick }: { bundles: Bundle[]; onPick: (b: Bundle) => void }) {
  const front = useTexture(
    () =>
      paintTexture(BOX_W, BOX_H, BOX, ({ ctx, w, h, text }) => {
        ctx.fillStyle = '#efe6cc';
        ctx.fillRect(w * 0.32, h * 0.3, w * 0.36, h * 0.26);
        ctx.fillStyle = INK;
        text('Изъято · 29', w * 0.35, h * 0.33, w * 0.3, '700 64px system-ui, sans-serif', 72);
        text('Бумаги из помещений', w * 0.35, h * 0.43, w * 0.3, '40px system-ui, sans-serif', 46);
        // Ручка-прорезь, как у архивного короба.
        ctx.fillStyle = '#3b3024';
        ctx.beginPath();
        ctx.roundRect(w * 0.4, h * 0.1, w * 0.2, h * 0.08, h * 0.04);
        ctx.fill();
      }),
    [],
  );
  // Конверты — от задней стенки к передней, с равными промежутками.
  const gap = (BOX_D - 2 * WALL - 0.3) / Math.max(1, bundles.length - 1);
  return (
    <group rotation={[0.62, 0, 0]} position={[0, -0.1, 0]} scale={0.6}>
      {/* Дно и стенки короба. */}
      <mesh position={[0, -BOX_H / 2 + WALL / 2, 0]} {...BLOCK}>
        <boxGeometry args={[BOX_W, WALL, BOX_D]} />
        <meshStandardMaterial color={BOX} roughness={0.95} />
      </mesh>
      {[
        [0, -BOX_D / 2 + WALL / 2, BOX_W, WALL],
        [-BOX_W / 2 + WALL / 2, 0, WALL, BOX_D],
        [BOX_W / 2 - WALL / 2, 0, WALL, BOX_D],
      ].map(([x, z, w, d]) => (
        <mesh key={`${x}:${z}`} position={[x as number, 0, z as number]} {...BLOCK}>
          <boxGeometry args={[w as number, BOX_H, d as number]} />
          <meshStandardMaterial color={BOX} roughness={0.95} />
        </mesh>
      ))}
      <group position={[0, 0, BOX_D / 2 - WALL / 2]} {...BLOCK}>
        <mesh>
          <boxGeometry args={[BOX_W, BOX_H, WALL]} />
          <meshStandardMaterial color={BOX} roughness={0.95} />
        </mesh>
        <Plate w={BOX_W} h={BOX_H} z={WALL / 2 + 0.002} map={front} />
      </group>
      {bundles.map((b, k) => (
        <group
          key={b.id}
          position={[0, -BOX_H / 2 + WALL + ENV_H / 2, -BOX_D / 2 + WALL + 0.15 + k * gap]}
          // Стоят не по линейке: каждый чуть наклонён назад.
          rotation={[-0.06 - (k % 2) * 0.03, 0, 0]}
        >
          <EnvelopeFile bundle={b} tabX={TAB_X[k % TAB_X.length] ?? 0} onPick={() => onPick(b)} />
        </group>
      ))}
    </group>
  );
}

function EnvelopeFile({
  bundle: b,
  tabX,
  onPick,
}: {
  bundle: Bundle;
  tabX: number;
  onPick: () => void;
}) {
  const empty = b.sheets === 0;
  const d = envDepth(b.sheets);
  const lift = useRef<Group>(null);
  const out = useRef(false);
  const y = useRef(0);
  const pick = useActive(
    `stack-${b.id}`,
    empty ? `Конверт ${b.id} пуст` : `Взять пачку ${b.id}`,
    `stack-${b.id}`,
    () => {
      if (empty || out.current) return;
      out.current = true;
      if (reducedMotion()) onPick();
    },
    true,
  );
  useAnimate((dt) => {
    const to = out.current ? LIFT_OUT : pick.hover && !empty ? LIFT_HOVER : 0;
    y.current += (to - y.current) * ease(dt);
    if (lift.current) lift.current.position.y = y.current;
    // Вынули до конца — пачка в руках (один раз).
    if (out.current && y.current > LIFT_OUT * 0.85 && !reducedMotion()) {
      out.current = false;
      y.current = 0;
      onPick();
      return true;
    }
    return out.current || Math.abs(to - y.current) > SETTLED;
  });
  const face = useTexture(
    () =>
      paintTexture(ENV_W, ENV_H, KRAFT, ({ ctx, w, h, text }) => {
        // Бланк вещдока у верхнего края: номер, помещение, листов; ниже — графы передачи.
        ctx.fillStyle = '#efe6cc';
        ctx.fillRect(w * 0.06, h * 0.06, w * 0.88, h * 0.3);
        ctx.fillStyle = INK;
        text(slipOf(b), w * 0.09, h * 0.09, w * 0.82, '600 64px system-ui, sans-serif', 72);
        text('Изъято · дело 29', w * 0.09, h * 0.22, w * 0.82, '40px system-ui, sans-serif', 46);
        ctx.strokeStyle = 'rgba(43,41,37,0.35)';
        ctx.lineWidth = 3;
        for (let r = 0; r < 4; r++) {
          const yy = h * (0.5 + r * 0.1);
          ctx.beginPath();
          ctx.moveTo(w * 0.08, yy);
          ctx.lineTo(w * 0.92, yy);
          ctx.stroke();
        }
      }),
    [b.id, b.room, b.sheets],
  );
  const tab = useTexture(
    () =>
      paintTexture(TAB[0], TAB[1], '#efe6cc', ({ ctx, w, h, text }) => {
        ctx.fillStyle = INK;
        text(b.id, w * 0.08, h * 0.12, w * 0.84, '700 70px system-ui, sans-serif', 78);
        text(
          empty ? 'пуст' : b.room,
          w * 0.08,
          h * 0.56,
          w * 0.84,
          '34px system-ui, sans-serif',
          40,
        );
      }),
    [b.id, b.room, empty],
  );
  const glow = pick.hover && !empty ? 0.04 : 0;
  const tabY = ENV_H / 2 + TAB[1] / 2 - 0.04;
  return (
    <group>
      {/* Конверт берут только за ярлык (правка автора 10.11): зона наведения — на месте ярлыка,
          неподвижная и с запасом на подъём, чтобы конверт не дрожал под мышью. */}
      <group position={[tabX, tabY, d / 2 + 0.01]} ref={pick.anchor}>
        {/* Запас на подъём — только у поднятого: в покое зона не наезжает на ярлык сзади. */}
        <mesh
          position={[0, pick.hover ? LIFT_HOVER / 2 : 0, 0]}
          scale={[1, pick.hover ? 1 : TAB[1] / (TAB[1] + LIFT_HOVER), 1]}
          {...pick.handlers}
        >
          <planeGeometry args={[TAB[0], TAB[1] + LIFT_HOVER]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      <group ref={lift}>
        <mesh {...BLOCK}>
          <boxGeometry args={[ENV_W, ENV_H, d]} />
          <meshStandardMaterial
            color={KRAFT}
            roughness={0.95}
            emissive="#ffffff"
            emissiveIntensity={glow}
          />
        </mesh>
        <mesh position={[0, 0, d / 2 + 0.002]} {...BLOCK}>
          <planeGeometry args={[ENV_W, ENV_H]} />
          <meshStandardMaterial
            map={face}
            roughness={0.95}
            emissive="#ffffff"
            emissiveIntensity={glow}
          />
        </mesh>
        {/* Ярлык на верхнем крае — его видно поверх соседних конвертов. */}
        <group position={[tabX, tabY, d / 2 + 0.004]}>
          <mesh>
            <planeGeometry args={[TAB[0], TAB[1]]} />
            <meshStandardMaterial
              map={tab}
              roughness={0.9}
              emissive="#ffffff"
              emissiveIntensity={glow}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/**
 * Папка, вытащенная из пачки (RD-A): картонная обложка скоросшивателя, на ней — наклейка с кодом
 * дела. Щелчок по обложке — открыть: листы папки (обложка, фото, копия бланка).
 */
export function Folder({ code, onOpen }: { code: string | null; onOpen: () => void }) {
  const cover = useFace({ text: '', faceDown: false, cover: code ?? '' });
  const open = useActive('folder', 'Открыть папку', 'folder-open', onOpen);
  return (
    <group scale={0.78} rotation={[0.12, -0.25, 0]}>
      <mesh>
        <boxGeometry args={[W, H, 0.03]} />
        <meshStandardMaterial color={CARD} roughness={0.95} />
      </mesh>
      <group position={[0, 0, 0.016]} ref={open.anchor}>
        <mesh {...open.handlers}>
          <planeGeometry args={[W, H]} />
          <meshStandardMaterial
            map={cover}
            roughness={0.95}
            emissive="#ffffff"
            emissiveIntensity={open.hover ? 0.05 : 0}
          />
        </mesh>
      </group>
    </group>
  );
}
