import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DoubleSide, type Group, type Mesh, Vector3 } from 'three';
import { reducedMotion } from '../motion.ts';
import type { Bundle, Sheet } from '../viewer/bundles.ts';
import { holdPart, setPartCursor, useSpot } from './Held3D.tsx';
import { Plate, useActive, useTexture } from './shapes.tsx';
import { paintTexture } from './texture.ts';

/**
 * Пачки бумаг из помещений (29) — физическая улика (PH-B, решения автора 10.11): коробка с
 * девятью пачками, пачку берут в руки и крутят. Сверху — верхний лист; по краям — торец:
 * бумага, а где есть, слои картона (выступают чуть шире листов, темнее); снизу — картонная
 * подложка с ярлыком бюро. Пачку листают прямо в руках (LF-A): листы перекладываются в стопку
 * слева. Размеры — как в жизни (A4), толщина по числу листов чуть преувеличена, чтобы торец читался.
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

/** Толщина пачки по числу листов. */
export const stackDepth = (sheets: number) => 0.02 + sheets * 0.0045;

/** Где лежит слой картона «перед листом n» (1 — сверху), по оси толщины (верх — +d/2). */
const layerZ = (n: number, sheets: number, d: number) => d / 2 - ((n - 1) / sheets) * d;

/** Код дела в тексте («A-24»). */
const CODE = /A-\d+/;

/** Лицо листа: текст, обложка папки (картон с наклейкой) или оборот (лежит текстом вниз). */
function useFace(top: Sheet) {
  return useTexture(
    () =>
      top.cover !== null
        ? paintTexture(W, H, CARD, ({ ctx, w, h, text }) => {
            if (!top.cover) return;
            ctx.fillStyle = '#f1ead6';
            ctx.fillRect(w * 0.3, h * 0.12, w * 0.4, h * 0.1);
            ctx.fillStyle = INK;
            text(top.cover, w * 0.36, h * 0.135, w * 0.3, '700 120px system-ui, sans-serif', 130);
          })
        : paintTexture(W, H, SHEET, ({ ctx, w, h, text }) => {
            const len = (y: number) => 0.5 + ((y * 7) % 30) / 100;
            if (top.faceDown) {
              // Оборот: пусто; сквозь бумагу просвечивают строки (зеркально) и пятно штампа в углу.
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
            let y = text(top.text, w * 0.09, h * 0.12, w * 0.82, '64px Georgia, serif', 80);
            // Ниже — строки листа, мелко (с руки не прочесть).
            ctx.fillStyle = 'rgb(0 0 0 / 16%)';
            for (y += 40; y < h * 0.9; y += 46) ctx.fillRect(w * 0.09, y, w * len(y), 10);
          }),
    [top.text, top.cover, top.faceDown],
  );
}

/** Верхний лист пачки, пока её не листали: текст превью (материал 29); у П-09 сверху — обложка. */
const topOf = (b: Bundle): Sheet => ({
  text: b.top,
  faceDown: false,
  cover: b.layers.includes(1) ? (CODE.exec(b.top)?.[0] ?? '') : null,
});

function useSlip(label: string) {
  return useTexture(
    () =>
      paintTexture(1.1, 0.3, '#efe6cc', ({ ctx, w, h, text }) => {
        ctx.fillStyle = INK;
        text(label, w * 0.06, h * 0.22, w * 0.9, '600 56px system-ui, sans-serif', 64);
      }),
    [label],
  );
}

/** Протянуть мышью столько, px, — край вытащен до конца. */
const PULL_PX = 160;
/** Выступ картона за край листа: в покое — на волосок, при наведении — средне (правка автора 10.11). */
const OUT_REST = 0.012;
const OUT_HOVER = 0.045;
/** Плавность: как выезжает папка ходатайства (~0,3 с). */
const SMOOTH = 9;

const ease = (dt: number) => (reducedMotion() ? 1 : 1 - Math.exp(-dt * SMOOTH));

/**
 * Слой картона в пачке (RD-A, решения автора 10.11). Ловится легко: вокруг края — невидимая
 * зона захвата (шире и толще самого картона), и только когда на пачку смотрят сбоку (сверху и
 * снизу пачку вращают, как обычно). Навели — край плавно выдвигается (средне, не резко) и курсор
 * «рука». Потянуть — картон выезжает за мышью; отпустили раньше половины — плавно вернулся;
 * дальше — вытащен. С клавиатуры — невидимая кнопка края.
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
  useFrame((_, dt) => {
    const k = ease(dt);
    out.current += ((hover ? OUT_HOVER : OUT_REST) - out.current) * k;
    body.current?.scale.set((W + 2 * out.current) / W, (H + 2 * out.current) / H, 1);
    const sl = slide.current;
    sl.now = sl.dragging ? sl.to : sl.now + (sl.to - sl.now) * k;
    if (group.current) group.current.position.x = sl.now * W * 0.9;
  });
  // Пачку видно сбоку: луч мыши почти поперёк её толщины; и зона захвата — ближе всего к мыши.
  const reach = (e: ThreeEvent<PointerEvent>) => {
    if (e.intersections[0]?.object !== e.object) return false;
    const axis = e.object.getWorldDirection(new Vector3());
    return Math.abs(axis.dot(e.ray.direction)) < 0.8;
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

/** Лист, который перекладывают: перелетает с пачки в отложенную стопку (или обратно). */
function Flying({
  from,
  to,
  z,
  dir,
  at,
}: {
  from: number;
  to: number;
  z: number;
  dir: 1 | -1;
  at: number;
}) {
  const pivot = useRef<Group>(null);
  const [done, setDone] = useState(false);
  useFrame(() => {
    if (done || !pivot.current) return;
    const t = Math.min(1, (performance.now() - at) / 220);
    const e = (1 - Math.cos(Math.PI * t)) / 2;
    pivot.current.rotation.y = -Math.PI * (dir === 1 ? e : 1 - e);
    if (t >= 1) setDone(true);
  });
  if (done || reducedMotion()) return null;
  // Ось — посередине между стопками; лист переворачивается через неё.
  const mid = (from + to) / 2;
  const right = Math.max(from, to);
  return (
    <group ref={pivot} position={[mid, 0, z]}>
      <mesh position={[right - mid, 0, 0]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color={SHEET} roughness={0.9} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/** Задержка до «зажал — листы бегут», мс, и шаг листания, мс. */
const RIFFLE_AFTER = 320;
const RIFFLE_EVERY = 80;

/**
 * Пачка целиком (PH-B, LF-A): бумага, слои картона, подложка. Щелчок по верхнему листу —
 * переложить его в стопку слева (лицом вниз), зажать — листы бегут; щелчок по левой стопке —
 * вернуть лист. Обложка папки сверху — щелчок берёт папку; листы текстом вниз — щелчок
 * переворачивает их.
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
  /** Листы по описи — когда пачку начали листать (до того известен только верхний). */
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
  const left = sheets ? page : 0;
  const rest = b.sheets - left;
  const dR = stackDepth(rest);
  const dL = left ? stackDepth(left) : 0;
  const spread = left > 0;
  const xR = spread ? W / 2 + 0.12 : 0;
  const xL = -(W / 2 + 0.12);
  const topN = left + 1;
  const top: Sheet = (sheets ? sheets[left] : null) ?? topOf(b);
  const face = useFace(top);
  const slip = useSlip(`${b.id} · ${b.room} · ${b.sheets} л.`);
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
  // Что делает щелчок по верхнему листу.
  const act = top.cover !== null ? () => onPull(topN) : top.faceDown ? onTurnOver : onNext;
  const label =
    top.cover !== null ? 'Взять папку' : top.faceDown ? 'Перевернуть листы' : 'Перелистнуть лист';
  const riffled = useRef(false);
  const leaf = useActive('leaf', label, 'stack-leaf', () => {
    if (riffled.current) riffled.current = false;
    else act();
  });
  const back = useActive('back', 'Вернуть лист', 'stack-back', onPrev);
  // Зажал на листе и не двигал — листы бегут, пока держишь (до обложки или листов текстом вниз).
  const next = useRef(onNext);
  next.current = onNext;
  const canRiffle = useRef(true);
  canRiffle.current = top.cover === null && !top.faceDown && rest > 0 && sheets !== null;
  const press = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    let run: ReturnType<typeof setInterval> | null = null;
    const start = setTimeout(() => {
      if (moved || !canRiffle.current) return;
      holdPart();
      riffled.current = true;
      run = setInterval(() => {
        if (canRiffle.current) next.current();
        else if (run) clearInterval(run);
      }, RIFFLE_EVERY);
    }, RIFFLE_AFTER);
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 6) moved = true;
    };
    const up = () => {
      clearTimeout(start);
      if (run) clearInterval(run);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  // Перелёт листа при каждом шаге.
  const last = useRef(left);
  const [fly, setFly] = useState<{ dir: 1 | -1; at: number } | null>(null);
  useEffect(() => {
    if (left !== last.current) setFly({ dir: left > last.current ? 1 : -1, at: performance.now() });
    last.current = left;
  }, [left]);
  return (
    <group scale={spread ? 0.6 : 0.78}>
      {/* Пачка справа: что осталось. */}
      <group position={[xR, 0, 0]}>
        {rest > 0 && (
          <mesh>
            <boxGeometry args={[W, H, dR]} />
            <meshStandardMaterial color={PAPER} roughness={0.95} />
          </mesh>
        )}
        {b.layers
          .filter((n) => n > topN)
          .map((n) => (
            <CardLayer key={n} n={n} z={layerZ(n - left, rest, dR)} onPull={() => onPull(n)} />
          ))}
        {/* Подложка снизу — картон с ярлыком бюро. */}
        <mesh position={[0, 0, -dR / 2 - BASE_T / 2]}>
          <boxGeometry args={[W + 0.08, H + 0.08, BASE_T]} />
          <meshStandardMaterial color={BASE} roughness={0.95} />
        </mesh>
        <Plate w={W + 0.08} h={H + 0.08} z={-dR / 2 - BASE_T - 0.001} back map={base} />
        {rest > 0 && (
          <group position={[0, 0, dR / 2 + 0.001]} ref={leaf.anchor}>
            <mesh {...leaf.handlers} onPointerDown={press}>
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
        {left === 0 && (
          <group position={[-W / 2 + 0.6, H / 2 - 0.2, dR / 2 + 0.004]} rotation={[0, 0, 0.04]}>
            <Plate w={1.1} h={0.3} z={0} map={slip} />
          </group>
        )}
      </group>
      {/* Слева — переложенные листы, лицом вниз; щелчок — вернуть верхний. */}
      {spread && (
        <group position={[xL, 0, -dR / 2 + dL / 2]}>
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
      {fly && (
        <Flying
          key={fly.at}
          from={fly.dir === 1 ? xR : xL}
          to={fly.dir === 1 ? xL : xR}
          z={dR / 2 + 0.02}
          dir={fly.dir}
          at={fly.at}
        />
      )}
    </group>
  );
}

const COLS = 3;
const CELL: [number, number] = [0.92, 1.24];
const SMALL = 0.36;

/** Коробка с девятью пачками (вид сверху, чуть наклонена); щелчок по пачке — взять её. */
export function PapersBox({ bundles, onPick }: { bundles: Bundle[]; onPick: (b: Bundle) => void }) {
  const rows = Math.ceil(bundles.length / COLS);
  const tray: [number, number] = [COLS * CELL[0] + 0.2, rows * CELL[1] + 0.2];
  return (
    <group rotation={[-0.42, 0, 0]} scale={0.62}>
      {/* Дно и бортики коробки. */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[tray[0], tray[1], 0.06]} />
        <meshStandardMaterial color={BOX} roughness={0.95} />
      </mesh>
      {[
        [0, tray[1] / 2, tray[0], 0.06],
        [0, -tray[1] / 2, tray[0], 0.06],
        [tray[0] / 2, 0, 0.06, tray[1]],
        [-tray[0] / 2, 0, 0.06, tray[1]],
      ].map(([x, y, w, h]) => (
        <mesh key={`${x}:${y}`} position={[x as number, y as number, 0.2]}>
          <boxGeometry args={[w as number, h as number, 0.5]} />
          <meshStandardMaterial color={BOX} roughness={0.95} />
        </mesh>
      ))}
      {bundles.map((b, k) => (
        <group
          key={b.id}
          position={[
            ((k % COLS) - (COLS - 1) / 2) * CELL[0],
            ((rows - 1) / 2 - Math.floor(k / COLS)) * CELL[1],
            0,
          ]}
        >
          <SmallStack bundle={b} onPick={() => onPick(b)} />
        </group>
      ))}
    </group>
  );
}

function SmallStack({ bundle: b, onPick }: { bundle: Bundle; onPick: () => void }) {
  const d = stackDepth(b.sheets) * SMALL * 1.4;
  const face = useFace(topOf(b));
  const slip = useSlip(b.id);
  const pick = useActive(`stack-${b.id}`, `Взять пачку ${b.id}`, `stack-${b.id}`, onPick);
  const size = useMemo(() => [W * SMALL, H * SMALL] as const, []);
  return (
    <group position={[0, 0, d / 2]} ref={pick.anchor}>
      <mesh {...pick.handlers}>
        <boxGeometry args={[size[0], size[1], d]} />
        <meshStandardMaterial color={PAPER} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0, d / 2 + 0.001]} {...pick.handlers}>
        <planeGeometry args={[size[0], size[1]]} />
        <meshStandardMaterial
          map={face}
          roughness={0.9}
          emissive="#ffffff"
          emissiveIntensity={pick.hover ? 0.12 : 0}
        />
      </mesh>
      <group position={[0, size[1] / 2 - 0.08, d / 2 + 0.004]}>
        <Plate w={0.42} h={0.12} z={0} map={slip} />
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
