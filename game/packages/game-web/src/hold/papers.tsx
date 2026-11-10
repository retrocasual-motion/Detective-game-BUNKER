import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Group, Vector3 } from 'three';
import type { Bundle } from '../viewer/bundles.ts';
import { holdPart, setPartCursor, useSpot } from './Held3D.tsx';
import { Plate, useActive, useTexture } from './shapes.tsx';
import { paintTexture } from './texture.ts';

/**
 * Пачки бумаг из помещений (29) — физическая улика (PH-B, решение автора 10.11): коробка с
 * девятью пачками, пачку берут в руки и крутят. Сверху — верхний лист; по краям — торец:
 * бумага, а где есть, слои картона (выступают чуть шире листов, темнее); снизу — картонная
 * подложка с ярлыком бюро. Листы видны, только когда пачку пролистывают (опись — ответ дела).
 * Размеры — как в жизни (A4), толщина по числу листов чуть преувеличена, чтобы торец читался.
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

function useSheetFace(b: Bundle) {
  return useTexture(
    () =>
      paintTexture(W, H, SHEET, ({ ctx, w, h, text }) => {
        ctx.fillStyle = INK;
        let y = text(b.top, w * 0.09, h * 0.12, w * 0.82, '64px Georgia, serif', 80);
        // Ниже — строки листа, мелко (с руки не прочесть).
        ctx.fillStyle = 'rgb(0 0 0 / 16%)';
        for (y += 40; y < h * 0.9; y += 46)
          ctx.fillRect(w * 0.09, y, w * (0.5 + ((y * 7) % 30) / 100), 10);
      }),
    [b.top],
  );
}

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

/**
 * Слой картона в пачке (RD-A, решения автора 10.11): выступает по краям чуть шире листов.
 * Ловится легко: вокруг края — невидимая зона захвата (шире и толще самого картона), и только
 * когда на пачку смотрят сбоку (сверху и снизу пачку вращают, как обычно). Навели — край
 * заметно выдвигается и курсор «рука». Потянуть — картон выезжает за мышью; отпустили раньше
 * половины — вернулся; дальше — вытащен. С клавиатуры — невидимая кнопка края.
 */
function CardLayer({ n, z, onPull }: { n: number; z: number; onPull: () => void }) {
  const [hover, setHover] = useState(false);
  const [slide, setSlide] = useState(0);
  const live = useRef(0);
  const anchor = useRef<Group>(null);
  useSpot(anchor, {
    id: `layer-${n}`,
    label: 'Вытащить картон из пачки',
    testId: `stack-layer-${n}`,
    onClick: onPull,
  });
  useEffect(() => () => setPartCursor(''), []);
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
    const move = (ev: PointerEvent) => {
      live.current = Math.min(1, Math.hypot(ev.clientX - x0, ev.clientY - y0) / PULL_PX);
      setSlide(live.current);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setPartCursor('');
      if (live.current >= 0.5) {
        setSlide(1);
        onPull();
      } else setSlide(0);
      live.current = 0;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  // Выступ за край листа: в покое — на волосок, при наведении — заметно (правка автора 10.11).
  const out = hover ? 0.09 : 0.012;
  return (
    <group position={[slide * W * 0.9, 0, z]}>
      <mesh>
        <boxGeometry args={[W + 2 * out, H + 2 * out, CARD_T]} />
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
      {/* Кнопка края — у правого торца, видна, когда торец смотрит на игрока. */}
      <group ref={anchor} position={[W / 2 + out, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
    </group>
  );
}

/** Пачка целиком: бумага, слои картона, подложка; верхний лист — щелчок «пролистать». */
export function PaperStack({
  bundle: b,
  onLeaf,
  onPull,
}: {
  bundle: Bundle;
  onLeaf: () => void;
  /** Вытащили слой картона, что лежит перед листом n. */
  onPull: (n: number) => void;
}) {
  const d = stackDepth(b.sheets);
  const face = useSheetFace(b);
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
  const leaf = useActive('leaf', `Пролистать пачку ${b.id}`, 'stack-leaf', onLeaf);
  return (
    <group scale={0.78}>
      {/* Бумага — чуть уже картона: слои картона видны по краям. */}
      <mesh>
        <boxGeometry args={[W, H, d]} />
        <meshStandardMaterial color={PAPER} roughness={0.95} />
      </mesh>
      {b.layers.map((n) => (
        <CardLayer key={n} n={n} z={layerZ(n, b.sheets, d)} onPull={() => onPull(n)} />
      ))}
      {/* Подложка снизу — картон с ярлыком бюро. */}
      <mesh position={[0, 0, -d / 2 - BASE_T / 2]}>
        <boxGeometry args={[W + 0.08, H + 0.08, BASE_T]} />
        <meshStandardMaterial color={BASE} roughness={0.95} />
      </mesh>
      <Plate w={W + 0.08} h={H + 0.08} z={-d / 2 - BASE_T - 0.001} back map={base} />
      {/* Верхний лист: щелчок — пролистать пачку. */}
      <group position={[0, 0, d / 2 + 0.001]} ref={leaf.anchor}>
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
      <group position={[-W / 2 + 0.6, H / 2 - 0.2, d / 2 + 0.004]} rotation={[0, 0, 0.04]}>
        <Plate w={1.1} h={0.3} z={0} map={slip} />
      </group>
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
  const face = useSheetFace(b);
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
 * дела. Щелчок по обложке — открыть: опись пачки на этом листе (обложка, фото, копия бланка).
 */
export function Folder({ code, onOpen }: { code: string | null; onOpen: () => void }) {
  const cover = useTexture(
    () =>
      paintTexture(W, H, CARD, ({ ctx, w, h, text }) => {
        if (!code) return;
        ctx.fillStyle = '#f1ead6';
        ctx.fillRect(w * 0.3, h * 0.12, w * 0.4, h * 0.1);
        ctx.fillStyle = INK;
        text(code, w * 0.36, h * 0.135, w * 0.3, '700 120px system-ui, sans-serif', 130);
      }),
    [code],
  );
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
