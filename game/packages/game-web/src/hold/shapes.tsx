import { useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasTexture, Group } from 'three';
import { onClickPart, setPartCursor, useSpot } from './Held3D.tsx';
import { type Painter, paintTexture } from './texture.ts';

/**
 * Серые формы вещей в руках (этап 4a, M0): размеры примерно как в жизни, без шкур — шкуры и
 * модели glTF придут на этапе M2 в тот же каркас. Активная часть у вещи одна и видна: печать
 * конверта, пломба коробки, экран ноутбука и телефона, кнопка диктофона, окошко карты, панель
 * радиопоста. Надписи — краской на гранях (texture.ts).
 */

const KRAFT = '#b58f5a';
const BOX = '#8a7656';
const DEVICE = '#5f6267';
const DARK = '#2a2b2e';
const INK = '#1d1d1d';
const SEAL = '#8e2b25';

export interface Item {
  id: string;
  title: string;
}

export function useTexture(make: () => CanvasTexture, deps: unknown[]) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: текстура пересоздаётся по deps
  const tex = useMemo(make, deps);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Плоскость с краской: лицо (к +z) или оборот (повёрнута к −z). */
export function Plate({
  w,
  h,
  z,
  back,
  map,
}: {
  w: number;
  h: number;
  z: number;
  back?: boolean;
  map: CanvasTexture;
}) {
  return (
    <mesh position={[0, 0, z]} rotation={[0, back ? Math.PI : 0, 0]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={map} roughness={0.9} />
    </mesh>
  );
}

/** Опись в две колонки (оборот конверта, крышка коробки). */
function paintList(p: Painter, items: Item[], top: number) {
  const { ctx, w, text } = p;
  ctx.fillStyle = INK;
  text('Внутри (по описи):', w * 0.06, top, w * 0.9, '700 54px system-ui, sans-serif', 64);
  const half = Math.ceil(items.length / 2);
  const colW = w * 0.43;
  items.forEach((it, k) => {
    const col = k < half ? 0 : 1;
    const row = col ? k - half : k;
    text(
      `${it.id}  ${it.title}`,
      w * 0.06 + col * (colW + w * 0.04),
      top + 90 + row * 66,
      colW,
      '44px system-ui, sans-serif',
      52,
    );
  });
}

/** Активная часть: щелчок мышью по ней и невидимая кнопка поверх (клавиатура, тесты). */
export function useActive(id: string, label: string, testId: string, action: () => void) {
  const anchor = useRef<Group>(null);
  const [hover, setHover] = useState(false);
  useSpot(anchor, { id, label, testId, onClick: action, onHover: setHover });
  const handlers = {
    onClick: onClickPart(action),
    onPointerOver: () => {
      setHover(true);
      setPartCursor('pointer');
    },
    onPointerOut: () => {
      setHover(false);
      setPartCursor('');
    },
  };
  useEffect(() => () => setPartCursor(''), []);
  return { anchor, hover, handlers };
}

export function Envelope({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: Item[];
  onOpen: () => void;
}) {
  const front = useTexture(
    () =>
      paintTexture(3, 2.1, KRAFT, ({ ctx, w, h, text }) => {
        ctx.fillStyle = INK;
        text('Дело № 09-1128', w * 0.07, h * 0.08, w * 0.8, '58px Georgia, serif', 70);
        const y = text(title, w * 0.07, h * 0.24, w * 0.62, '700 120px Georgia, serif', 132);
        text(
          'Материалы дела · передано специалисту',
          w * 0.07,
          y + 20,
          w * 0.6,
          '54px Georgia, serif',
          66,
        );
        text(
          '16.11.2009 · подпись следователя',
          w * 0.07,
          h * 0.86,
          w * 0.6,
          'italic 50px Georgia, serif',
          60,
        );
      }),
    [title],
  );
  const back = useTexture(
    () =>
      paintTexture(3, 2.1, KRAFT, (p) => {
        const { ctx, w, h } = p;
        // Клапан — треугольник сверху.
        ctx.fillStyle = 'rgb(0 0 0 / 10%)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w, 0);
        ctx.lineTo(w / 2, h * 0.26);
        ctx.closePath();
        ctx.fill();
        paintList(p, items, h * 0.32);
      }),
    [items],
  );
  const seal = useActive('seal', 'Сломать печать и вскрыть конверт', 'envelope-open', onOpen);
  return (
    <group>
      <mesh>
        <boxGeometry args={[3, 2.1, 0.03]} />
        <meshStandardMaterial color={KRAFT} roughness={0.9} />
      </mesh>
      <Plate w={3} h={2.1} z={0.0155} map={front} />
      <Plate w={3} h={2.1} z={-0.0155} back map={back} />
      {/* Печать: сургучный круг — щелчок вскрывает. */}
      <group position={[1.0, -0.55, 0.02]} ref={seal.anchor}>
        <mesh rotation={[Math.PI / 2, 0, 0]} {...seal.handlers}>
          <cylinderGeometry args={[0.3, 0.3, 0.03, 40]} />
          <meshStandardMaterial
            color={SEAL}
            roughness={0.5}
            emissive={SEAL}
            emissiveIntensity={seal.hover ? 0.5 : 0.1}
          />
        </mesh>
      </group>
    </group>
  );
}

export function Box({ items, onOpen }: { items: Item[]; onOpen: () => void }) {
  const front = useTexture(
    () =>
      paintTexture(2.6, 1.3, BOX, ({ ctx, w, h, text }) => {
        ctx.fillStyle = INK;
        text('Дело № 09-1128', w * 0.06, h * 0.1, w * 0.8, '56px Georgia, serif', 66);
        text('Личные вещи', w * 0.06, h * 0.3, w * 0.8, '700 120px Georgia, serif', 130);
        text(
          'Изъято с объекта · 7 пакетов',
          w * 0.06,
          h * 0.62,
          w * 0.8,
          '54px Georgia, serif',
          64,
        );
      }),
    [],
  );
  const lid = useTexture(
    () => paintTexture(2.5, 1.7, '#9a8462', (p) => paintList(p, items, p.h * 0.08)),
    [items],
  );
  const tape = useActive('tape', 'Сорвать пломбу и открыть коробку', 'envelope-open', onOpen);
  return (
    <group rotation={[0.35, -0.5, 0]} scale={0.72}>
      <mesh>
        <boxGeometry args={[2.6, 1.3, 1.8]} />
        <meshStandardMaterial color={BOX} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.69, 0]} {...tape.handlers}>
        <boxGeometry args={[2.66, 0.08, 1.86]} />
        <meshStandardMaterial color="#9a8462" roughness={0.95} />
      </mesh>
      <Plate w={2.6} h={1.3} z={0.901} map={front} />
      <group position={[0, 0.735, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <Plate w={2.5} h={1.7} z={0} map={lid} />
      </group>
      {/* Пломба — лента на передней стенке: щелчок срывает. */}
      <group position={[0, 0.45, 0.92]} ref={tape.anchor}>
        <mesh {...tape.handlers}>
          <boxGeometry args={[0.22, 0.55, 0.02]} />
          <meshStandardMaterial
            color={SEAL}
            emissive={SEAL}
            emissiveIntensity={tape.hover ? 0.5 : 0.1}
          />
        </mesh>
      </group>
    </group>
  );
}

/** Бирка «Изъято» — бумажная, у вещи. */
function Tag({ text: label, at }: { text: string; at: [number, number, number] }) {
  const map = useTexture(
    () =>
      paintTexture(0.7, 0.24, '#ece6d2', ({ ctx, w, h, text }) => {
        ctx.fillStyle = INK;
        text(label, w * 0.08, h * 0.26, w * 0.9, '52px system-ui, sans-serif', 60);
      }),
    [label],
  );
  return (
    <group position={at} rotation={[0, 0, -0.12]}>
      <Plate w={0.7} h={0.24} z={0} map={map} />
    </group>
  );
}

/** Экран (или окошко, кнопка) — щелчок включает. */
function Screen({
  w,
  h,
  z,
  label,
  onUse,
}: {
  w: number;
  h: number;
  z: number;
  label: string;
  onUse: () => void;
}) {
  const s = useActive('screen', label, 'device-use', onUse);
  return (
    <group position={[0, 0, z]} ref={s.anchor}>
      <mesh {...s.handlers}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          color="#16212a"
          roughness={0.25}
          emissive="#3a5566"
          emissiveIntensity={s.hover ? 0.6 : 0.15}
        />
      </mesh>
    </group>
  );
}

export function Device({ id, tag, onUse }: { id: string; tag: string; onUse: () => void }) {
  if (id === '47')
    return (
      <group rotation={[0.28, 0, 0]} scale={0.8}>
        <mesh position={[0, -0.75, 0.55]}>
          <boxGeometry args={[2.8, 0.1, 1.9]} />
          <meshStandardMaterial color={DEVICE} roughness={0.6} />
        </mesh>
        <group position={[0, 0.2, -0.4]} rotation={[-0.12, 0, 0]}>
          <mesh>
            <boxGeometry args={[2.8, 1.85, 0.08]} />
            <meshStandardMaterial color={DEVICE} roughness={0.6} />
          </mesh>
          <Screen w={2.5} h={1.55} z={0.041} label="Открыть ноутбук" onUse={onUse} />
        </group>
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <Tag text={tag} at={[0.95, -1.15, -0.69]} />
        </group>
      </group>
    );
  if (id === '48')
    return (
      <group>
        <mesh>
          <boxGeometry args={[0.95, 1.9, 0.1]} />
          <meshStandardMaterial color={DARK} roughness={0.4} />
        </mesh>
        <Screen w={0.82} h={1.6} z={0.051} label="Включить телефон" onUse={onUse} />
        <Tag text={tag} at={[0.85, -0.9, 0.07]} />
      </group>
    );
  if (id === '49')
    return (
      <group>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 2.6, 24]} />
          <meshStandardMaterial color="#44474b" roughness={0.5} metalness={0.3} />
        </mesh>
        <group position={[-0.5, 0, 0]}>
          <Screen w={0.32} h={0.14} z={0.101} label="Включить диктофон" onUse={onUse} />
        </group>
        <Tag text={tag} at={[0.75, -0.32, 0.05]} />
      </group>
    );
  if (id === '24')
    return (
      <group>
        <mesh>
          <boxGeometry args={[0.9, 1.25, 0.05]} />
          <meshStandardMaterial color="#3a3c40" roughness={0.5} />
        </mesh>
        <Screen w={0.7} h={0.5} z={0.026} label="Посмотреть кадры" onUse={onUse} />
        <Tag text={tag} at={[0.65, -0.65, 0.04]} />
      </group>
    );
  // 50 — стойка радиопоста.
  return (
    <group rotation={[0.15, -0.35, 0]} scale={0.75}>
      <mesh>
        <boxGeometry args={[3, 1.5, 1.2]} />
        <meshStandardMaterial color={DEVICE} roughness={0.7} />
      </mesh>
      <Screen w={2.6} h={1.1} z={0.601} label="Включить запись" onUse={onUse} />
      <Tag text={tag} at={[1.25, -0.85, 0.62]} />
    </group>
  );
}
