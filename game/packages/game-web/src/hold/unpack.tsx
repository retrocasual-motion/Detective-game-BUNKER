import type { MaterialKind } from '@bunker/shared';
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { reducedMotion } from '../motion.ts';
import { SETTLED, useAnimate } from './animate.ts';
import { Plate, useActive, useTexture } from './shapes.tsx';
import { paintTexture } from './texture.ts';

/**
 * Вскрытый конверт и коробка в руках (OP-D, EB-A — автор 22.11, «на пробу»): содержимое стоит
 * внутри на ребре, как в картотеке; у каждой вещи сверху бумажный ярлык с номером и кратким
 * названием, силуэт — по виду материала (лист, скреплённые листы, фото, диск в конверте, тетрадь,
 * пакет). Навели — вещь приподнимается; щелчок — вынута: лист читают, пакет берут в руки.
 * Отложили — всё на стене группой, как раньше (A-260).
 */

const KRAFT = '#b58f5a';
const BOX = '#8a7656';
const INK = '#1d1d1d';
const PAPER = '#f1ede2';
const SLIP = '#efe6cc';

/** Лица вещей рисуются мельче: их до 11 в одном конверте. */
const FACE_SCALE = 0.32;

export interface UnpackItem {
  id: string;
  /** Краткое название (как на обороте конверта). */
  title: string;
  kind: MaterialKind;
  /** Пакет личных вещей: чей и откуда (из заголовка описи). */
  bag?: BagLabel;
}

export interface BagLabel {
  /** «Л. Моро». */
  name: string;
  /** «Дело № 09-1128 · 28.10.2009». */
  line: string;
  /** «Изъяты из жилой комнаты 3 и с собой у Л. Моро». */
  place: string;
}

/**
 * Ярлык пакета — из самой описи (EB-A): название «Личные вещи Л. Моро» и строка под ним
 * «Дело № 09-1128 · 28.10.2009 · изъяты из …». Нового текста нет.
 */
export function bagLabel(title: string, body: string): BagLabel {
  const name = title.replace(/^Личные вещи\s+/, '').trim();
  const head = body.split('\n').find((l) => /^Дело №/.test(l.trim())) ?? '';
  const parts = head.split('·').map((p) => p.trim().replace(/\.$/, ''));
  const place = parts.slice(2).join(' · ');
  return {
    name,
    line: parts.slice(0, 2).join(' · '),
    place: place ? place[0]?.toUpperCase() + place.slice(1) : '',
  };
}

/** Размер вещи (ширина, высота, толщина) по виду: как в жизни, 1 см ≈ 0,095. */
const SIZE: Record<MaterialKind, [number, number, number]> = {
  sheet: [2.82, 2.0, 0.02],
  folded: [2.82, 2.0, 0.03],
  stapled: [2.82, 2.0, 0.04],
  pack: [2.82, 2.0, 0.07],
  half: [2.82, 1.0, 0.02],
  photos: [1.71, 1.24, 0.03],
  notebook: [2.0, 1.48, 0.09],
  disc: [1.25, 1.25, 0.03],
  bag: [2.82, 1.95, 0.07],
};

const COLOR: Record<MaterialKind, string> = {
  sheet: PAPER,
  folded: PAPER,
  stapled: PAPER,
  pack: '#ebe6d8',
  half: '#ece6d6',
  photos: '#dedad2',
  notebook: '#45505c',
  disc: '#e6e0cf',
  bag: '#dfe7ec',
};

const TAB: [number, number] = [1.0, 0.46];
/** Ярлыки вразбивку, чтобы читались все. */
const TAB_X = [-0.9, 0, 0.9];
/** На сколько вещь выглядывает над краем конверта; подъём при наведении; вынута. */
const PEEK = 0.42;
const LIFT_HOVER = 0.3;
const LIFT_OUT = 2.2;
const SMOOTH = 9;
const ease = (dt: number) => (reducedMotion() ? 1 : 1 - Math.exp(-dt * SMOOTH));

/** Заслонка наведения: стенки и вещи не пропускают мышь к тому, что за ними (как в коробе 29). */
const stop = (e: ThreeEvent<PointerEvent>) => e.stopPropagation();
const BLOCK = { onPointerOver: stop, onPointerMove: stop };

/** Вскрытый конверт (крафт, с расширением) или коробка: стенки, дно, надпись спереди. */
export function Unpacked({
  vessel,
  title,
  items,
  onPick,
}: {
  vessel: 'envelope' | 'box';
  title: string;
  items: UnpackItem[];
  onPick: (it: UnpackItem) => void;
}) {
  const box = vessel === 'box';
  const W = 3.1;
  const H = box ? 2.0 : 2.18;
  const WALL = box ? 0.05 : 0.012;
  const color = box ? BOX : KRAFT;
  // Глубина — по числу вещей: конверт с расширением раздувается.
  const D = Math.min(3.2, Math.max(0.7, items.length * 0.26 + 0.25));
  const gap = items.length > 1 ? (D - 2 * WALL - 0.24) / (items.length - 1) : 0;
  const front = useTexture(
    () =>
      paintTexture(W, H, color, ({ ctx, w, h, text }) => {
        ctx.fillStyle = INK;
        text('Дело № 09-1128', w * 0.07, h * 0.36, w * 0.8, '58px Georgia, serif', 70);
        text(title, w * 0.07, h * 0.48, w * 0.86, '700 96px Georgia, serif', 108);
        // Сорванная печать (конверт) или пломба (коробка) — у правого края.
        ctx.fillStyle = 'rgb(142 43 37 / 55%)';
        ctx.beginPath();
        ctx.arc(w * 0.84, h * 0.16, w * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }),
    [title, color],
  );
  return (
    <group rotation={[0.66, 0, 0]} position={[0, -0.3, 0]} scale={0.62}>
      {/* Дно, задняя стенка, бока (у конверта — складки расширения). */}
      <mesh position={[0, -H / 2 + WALL / 2, 0]} {...BLOCK}>
        <boxGeometry args={[W, WALL, D]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0, -D / 2 + WALL / 2]} {...BLOCK}>
        <boxGeometry args={[W, H, WALL]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (W - WALL)) / 2, 0, 0]} {...BLOCK}>
          <boxGeometry args={[WALL, H, D]} />
          <meshStandardMaterial color={box ? color : '#a8834f'} roughness={0.95} />
        </mesh>
      ))}
      {/* Клапан конверта откинут назад. */}
      {!box && (
        <mesh position={[0, H / 2 + 0.32, -D / 2 - 0.02]} rotation={[-0.35, 0, 0]} {...BLOCK}>
          <boxGeometry args={[W, 0.7, WALL]} />
          <meshStandardMaterial color={KRAFT} roughness={0.95} />
        </mesh>
      )}
      <group position={[0, 0, D / 2 - WALL / 2]} {...BLOCK}>
        <mesh>
          <boxGeometry args={[W, H, WALL]} />
          <meshStandardMaterial color={color} roughness={0.95} />
        </mesh>
        <Plate w={W} h={H} z={WALL / 2 + 0.002} map={front} />
      </group>
      {items.map((it, k) => {
        const [w, h] = SIZE[it.kind];
        const want = TAB_X[k % TAB_X.length] ?? 0;
        // Узкая вещь (диск, фото) сама стоит со сдвигом — её ярлык на своём месте вразбивку.
        const room = Math.max(0, (W - w) / 2 - 0.04);
        const x = Math.max(-room, Math.min(room, want));
        return (
          <group
            key={it.id}
            position={[x, H / 2 + PEEK - h / 2, -D / 2 + WALL + 0.12 + k * gap]}
            rotation={[-0.05 - (k % 2) * 0.03, 0, 0]}
          >
            <FileItem item={it} tabX={want - x} onPick={() => onPick(it)} />
          </group>
        );
      })}
    </group>
  );
}

/** Вещь в конверте: силуэт по виду, ярлык сверху. Берут за ярлык (как конверты в коробе 29). */
function FileItem({
  item,
  tabX: wantX,
  onPick,
}: {
  item: UnpackItem;
  tabX: number;
  onPick: () => void;
}) {
  const [w, h, d] = SIZE[item.kind];
  const tabX = Math.max(-(w - TAB[0]) / 2, Math.min((w - TAB[0]) / 2, wantX));
  const lift = useRef<Group>(null);
  const out = useRef(false);
  const y = useRef(0);
  const bag = item.kind === 'bag';
  const pick = useActive(
    `item-${item.id}`,
    bag ? `Взять пакет: ${item.title}` : `Вынуть и прочитать: ${item.title}`,
    `unpack-${item.id}`,
    () => {
      if (out.current) return;
      out.current = true;
      if (reducedMotion()) onPick();
    },
    true,
  );
  useAnimate((dt) => {
    const to = out.current ? LIFT_OUT : pick.hover ? LIFT_HOVER : 0;
    y.current += (to - y.current) * ease(dt);
    if (lift.current) lift.current.position.y = y.current;
    if (out.current && y.current > LIFT_OUT * 0.85 && !reducedMotion()) {
      out.current = false;
      y.current = 0;
      onPick();
      return true;
    }
    return out.current || Math.abs(to - y.current) > SETTLED;
  });
  const face = useTexture(() => paintFace(item, w, h), [item.id, item.kind, item.title]);
  const tab = useTexture(
    () =>
      paintTexture(TAB[0], TAB[1], SLIP, ({ ctx, w: tw, h: th, text }) => {
        ctx.fillStyle = INK;
        if (bag && item.bag) {
          // «Личные вещи» — мелко сверху, чьи — крупно (название описи читается сверху вниз).
          text('Личные вещи', tw * 0.06, th * 0.08, tw * 0.88, '40px system-ui, sans-serif', 46);
          text(item.bag.name, tw * 0.06, th * 0.4, tw * 0.88, '700 84px system-ui, sans-serif', 92);
          return;
        }
        text(item.id, tw * 0.06, th * 0.06, tw * 0.88, '700 80px system-ui, sans-serif', 88);
        text(item.title, tw * 0.06, th * 0.44, tw * 0.88, '42px system-ui, sans-serif', 48);
      }),
    [item.id, item.title, bag],
  );
  const glow = pick.hover ? 0.05 : 0;
  const tabY = h / 2 + TAB[1] / 2 - 0.05;
  return (
    <group>
      <group position={[tabX, tabY, d / 2 + 0.01]} ref={pick.anchor}>
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
        {bag ? (
          <BagShape w={w} h={h} d={d} glow={glow} label={item.bag} rows={[]} small />
        ) : (
          <>
            <mesh {...BLOCK}>
              <boxGeometry args={[w, h, d]} />
              <meshStandardMaterial
                color={COLOR[item.kind]}
                roughness={item.kind === 'photos' ? 0.4 : 0.95}
                emissive="#ffffff"
                emissiveIntensity={glow}
              />
            </mesh>
            <mesh position={[0, 0, d / 2 + 0.002]} {...BLOCK}>
              <planeGeometry args={[w, h]} />
              <meshStandardMaterial
                map={face}
                roughness={0.9}
                emissive="#ffffff"
                emissiveIntensity={glow}
              />
            </mesh>
          </>
        )}
        <mesh position={[tabX, tabY, d / 2 + 0.006]}>
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
  );
}

/** Лицо вещи: название и строки (лист), снимок в белой рамке (фото), окошко с диском, наклейка. */
function paintFace(item: UnpackItem, wU: number, hU: number) {
  return paintTexture(
    wU,
    hU,
    COLOR[item.kind],
    ({ ctx, w, h, text }) => {
      const lines = (from: number) => {
        ctx.fillStyle = 'rgb(0 0 0 / 14%)';
        for (let y = from; y < h * 0.92; y += 52)
          ctx.fillRect(w * 0.08, y, w * (0.55 + ((y * 7) % 30) / 100), 11);
      };
      switch (item.kind) {
        case 'photos':
          ctx.fillStyle = '#5e5a55';
          ctx.fillRect(w * 0.06, h * 0.07, w * 0.88, h * 0.86);
          return;
        case 'disc':
          ctx.fillStyle = '#cfc8b4';
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, w * 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = COLOR.disc;
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, w * 0.06, 0, Math.PI * 2);
          ctx.fill();
          return;
        case 'notebook':
          ctx.fillStyle = SLIP;
          ctx.fillRect(w * 0.3, h * 0.2, w * 0.4, h * 0.16);
          return;
        default: {
          ctx.fillStyle = INK;
          const y = text(item.title, w * 0.08, h * 0.1, w * 0.84, '700 64px Georgia, serif', 74);
          lines(y + 20);
          // Скобка степлера — в левом верхнем углу.
          if (item.kind === 'stapled') {
            ctx.fillStyle = '#8b8f95';
            ctx.fillRect(w * 0.02, h * 0.04, w * 0.06, 10);
          }
          // Сгиб — посередине.
          if (item.kind === 'folded') {
            ctx.fillStyle = 'rgb(0 0 0 / 12%)';
            ctx.fillRect(0, h / 2 - 3, w, 6);
          }
        }
      }
    },
    FACE_SCALE,
  );
}

// ── Пакет личных вещей (EB-A) ──

/** Строка описи пакета: «| 1 | Блокнот для эскизов… |». */
export function inventoryRows(body: string): string[] {
  const rows: string[] = [];
  for (const line of body.split('\n')) {
    const m = /^\|\s*\d+\s*\|\s*(.+?)\s*\|\s*$/.exec(line.trim());
    if (m?.[1]) rows.push(m[1]);
  }
  return rows;
}

type Form = 'book' | 'cloth' | 'watch' | 'paper' | 'kit';

/**
 * Форма вещи по строке описи — нейтральная, без надписей и деталей (T6-B), все вещи одинаково
 * тщательно (Z-2): сам рисунок не подсказывает, что важно. Настоящий вид — этап дизайна.
 */
export function formOf(row: string): Form {
  const r = row.toLowerCase();
  if (/одежд|кардиган/.test(r)) return 'cloth';
  if (/часы/.test(r)) return 'watch';
  if (/блокнот|ежедневник|книга|разговорник/.test(r)) return 'book';
  if (/фотограф|записк|лист|конверт|квитанц/.test(r)) return 'paper';
  return 'kit';
}

const FORM: Record<Form, { size: [number, number, number]; color: string }> = {
  book: { size: [0.62, 0.86, 0.08], color: '#6b5f50' },
  cloth: { size: [0.95, 0.7, 0.12], color: '#7a8290' },
  watch: { size: [0.26, 0.26, 0.04], color: '#3f4246' },
  paper: { size: [0.55, 0.72, 0.012], color: '#efe9da' },
  kit: { size: [0.62, 0.36, 0.12], color: '#4e5256' },
};

/** Прозрачный пакет: плёнка, застёжка сверху, бумажное поле ярлыка; внутри — вещи по описи. */
export function BagShape({
  w,
  h,
  d,
  glow = 0,
  label,
  rows,
  small = false,
}: {
  w: number;
  h: number;
  d: number;
  glow?: number;
  label?: BagLabel;
  rows: string[];
  /** В коробке: вещей не видно за соседними пакетами — только плёнка и ярлык. */
  small?: boolean;
}) {
  const slip = useTexture(
    () =>
      paintTexture(w * 0.62, h * 0.3, '#f6f3ea', ({ ctx, w: sw, h: sh, text }) => {
        ctx.fillStyle = INK;
        if (!label) return;
        text(label.line, sw * 0.05, sh * 0.08, sw * 0.9, '34px system-ui, sans-serif', 40);
        text('Личные вещи', sw * 0.05, sh * 0.24, sw * 0.9, '44px system-ui, sans-serif', 50);
        const y = text(
          label.name,
          sw * 0.05,
          sh * 0.42,
          sw * 0.9,
          '700 80px system-ui, sans-serif',
          88,
        );
        text(label.place, sw * 0.05, y + 4, sw * 0.9, '32px system-ui, sans-serif', 38);
      }),
    [label?.name, label?.line, label?.place, w, h],
  );
  // Вещи — в два столбца под ярлыком, по порядку описи.
  const laid = useMemo(() => {
    const top = h / 2 - h * 0.36;
    return rows.map((row, k) => {
      const f = FORM[formOf(row)];
      const col = k % 2;
      const r = Math.floor(k / 2);
      return {
        key: `${k}:${row.slice(0, 12)}`,
        f,
        x: (col ? 1 : -1) * w * 0.22,
        y: top - f.size[1] / 2 - r * 0.42,
        z: -d / 2 + f.size[2] / 2 + 0.005 + (k % 3) * 0.004,
        rot: ((k * 37) % 11) / 100 - 0.05,
      };
    });
  }, [rows, w, h, d]);
  return (
    <group>
      {!small &&
        laid.map((t) => (
          <mesh key={t.key} position={[t.x, t.y, t.z]} rotation={[0, 0, t.rot]}>
            {t.f === FORM.watch ? (
              <cylinderGeometry args={[t.f.size[0] / 2, t.f.size[0] / 2, t.f.size[2], 24]} />
            ) : (
              <boxGeometry args={t.f.size} />
            )}
            <meshStandardMaterial color={t.f.color} roughness={0.85} />
          </mesh>
        ))}
      {/* Задняя плёнка — молочная: сквозь неё не виден стол, вещи читаются на ней. */}
      <mesh position={[0, 0, -d / 2]} {...BLOCK}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          color="#c9d1d6"
          roughness={0.35}
          emissive="#ffffff"
          emissiveIntensity={glow}
        />
      </mesh>
      {/* Передняя плёнка с бликом. */}
      <mesh {...BLOCK}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={COLOR.bag}
          transparent
          opacity={0.16}
          roughness={0.2}
          depthWrite={false}
          emissive="#ffffff"
          emissiveIntensity={glow}
        />
      </mesh>
      {/* Застёжка. */}
      <mesh position={[0, h / 2 - 0.06, 0]}>
        <boxGeometry args={[w, 0.04, d + 0.01]} />
        <meshStandardMaterial color="#b9c4cc" roughness={0.5} />
      </mesh>
      {/* Поле ярлыка — белое, на плёнке, слева сверху. */}
      <mesh position={[-w * 0.17, h / 2 - h * 0.2, d / 2 + 0.003]}>
        <planeGeometry args={[w * 0.62, h * 0.3]} />
        <meshStandardMaterial
          map={slip}
          roughness={0.9}
          emissive="#ffffff"
          emissiveIntensity={glow}
        />
      </mesh>
    </group>
  );
}

/** Пакет в руках (EB-A): вертят; щелчок по пакету — опись и вещи листом (материал 40–46). */
export function BagInHands({
  label,
  rows,
  onOpen,
}: {
  label: BagLabel;
  rows: string[];
  onOpen: () => void;
}) {
  const open = useActive('bag', `Открыть пакет: ${label.name}`, 'bag-open', onOpen);
  const [w, h, d] = [2.3, 3.0, 0.16];
  return (
    <group scale={0.7} rotation={[0.1, -0.2, 0]}>
      <BagShape w={w} h={h} d={d} glow={open.hover ? 0.05 : 0} label={label} rows={rows} />
      {/* Щелчок — по всей плёнке спереди. */}
      <group position={[0, 0, d / 2 + 0.01]} ref={open.anchor}>
        <mesh {...open.handlers}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
