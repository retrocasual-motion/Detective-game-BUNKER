import { useEffect, useMemo, useRef, useState } from 'react';
import { type CanvasTexture, type Group, Shape } from 'three';
import { gameNow, hhmm } from '../clock.ts';
import { reducedMotion } from '../motion.ts';
import { phoneHome } from '../phone/phoneHome.ts';
import { useGame } from '../store.ts';
import { SETTLED, useAnimate } from './animate.ts';
import { onClickPart, setPartCursor, useScreenAnchor, useSpot } from './Held3D.tsx';
import { paintLaptopFace } from './laptopFace.ts';
import { paintPhoneFace } from './phoneFace.ts';
import { type Painter, paintTexture } from './texture.ts';

/**
 * Серые формы вещей в руках (этап 4a, M0): размеры примерно как в жизни, без шкур — шкуры и
 * модели glTF придут на этапе M2 в тот же каркас. Активная часть у вещи одна и видна: печать
 * конверта, пломба коробки, экран ноутбука и телефона, кнопка диктофона, окошко карты, панель
 * радиопоста (стойка — radioStand.tsx). Надписи — краской на гранях (texture.ts).
 */

const KRAFT = '#b58f5a';
const BOX = '#8a7656';
const DEVICE = '#5f6267';
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
export function useActive(
  id: string,
  label: string,
  testId: string,
  action: () => void,
  /**
   * Тесная часть среди соседних (ярлыки в коробке): мышь до невидимой кнопки не доходит — её
   * ловит сама часть, и ближняя заслоняет дальние (правка автора 10.11: наведение шло насквозь).
   */
  tight = false,
) {
  const anchor = useRef<Group>(null);
  const [hover, setHover] = useState(false);
  useSpot(anchor, { id, label, testId, onClick: action, onHover: setHover, passive: tight });
  const handlers = {
    onClick: onClickPart(action),
    onPointerOver: (e?: { stopPropagation(): void }) => {
      if (tight) e?.stopPropagation();
      setHover(true);
      setPartCursor('pointer');
    },
    ...(tight ? { onPointerMove: (e: { stopPropagation(): void }) => e.stopPropagation() } : {}),
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
export function Tag({ text: label, at }: { text: string; at: [number, number, number] }) {
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
export function Screen({
  w,
  h,
  z,
  label,
  onUse,
  face,
  on = false,
}: {
  w: number;
  h: number;
  z: number;
  label: string;
  onUse: () => void;
  /** Что горит на экране (включённое устройство): картинка светится сама. */
  face?: CanvasTexture;
  /** Вплотную (WM-B): поверх экрана — живая разметка, невидимой кнопки нет. */
  on?: boolean;
}) {
  const s = useActive('screen', label, 'device-use', onUse);
  const live = useRef<Group>(null);
  useScreenAnchor(on ? live : NO_ANCHOR, w, h);
  return (
    <group position={[0, 0, z]} ref={on ? undefined : s.anchor}>
      <group ref={live} />
      <mesh {...(on ? {} : s.handlers)}>
        <planeGeometry args={[w, h]} />
        {face ? (
          <meshBasicMaterial
            map={face}
            toneMapped={false}
            color={s.hover ? '#ffffff' : '#e4e8ee'}
          />
        ) : (
          <meshStandardMaterial
            color="#16212a"
            roughness={0.25}
            emissive="#3a5566"
            emissiveIntensity={s.hover ? 0.6 : 0.15}
          />
        )}
      </mesh>
    </group>
  );
}

const NO_ANCHOR = { current: null };

/** Экран ноутбука — плоскость под 1280 × 800 (WXGA), размер в сцене. */
export const LAPTOP_SCREEN: [number, number] = [2.5, 1.5625];
/** Экран телефона — под 320 × 480. */
export const PHONE_SCREEN: [number, number] = [0.8, 1.2];

/** Экран ноутбука в руках — уже включён: вход или рабочий стол (правка автора 10.11). */
function LaptopScreen({ onUse, on }: { onUse: () => void; on: boolean }) {
  const unlocked = useGame((g) => g.materials.some((m) => m.id === 'L560'));
  const [w, h] = LAPTOP_SCREEN;
  const face = useTexture(() => paintTexture(w, h, null, paintLaptopFace(unlocked)), [unlocked]);
  return <Screen w={w} h={h} z={0.041} label="Открыть ноутбук" onUse={onUse} face={face} on={on} />;
}

/** Экран телефона в руках — уже горит: экран блокировки с уведомлениями (как на живом экране). */
function PhoneScreen({ onUse, on, z }: { onUse: () => void; on: boolean; z: number }) {
  const unlocked = useGame((g) => g.materials.some((m) => m.id === 'L540'));
  const body48 = useGame((g) => g.materials.find((m) => m.id === '48')?.body ?? '');
  const started = useGame((g) => g.state?.started);
  const time = hhmm(gameNow(started));
  const [w, h] = PHONE_SCREEN;
  const face = useTexture(
    () => paintTexture(w, h, null, paintPhoneFace(unlocked, body48, time)),
    [unlocked, body48, time],
  );
  return <Screen w={w} h={h} z={z} label="Включить телефон" onUse={onUse} face={face} on={on} />;
}

/**
 * Ноутбук в руках (4c-1; WM-B — автор 17.11): вертят как вещь; вплотную крышка встаёт экраном
 * прямо к камере, экран живой — разметка на плоскости экрана.
 */
function Laptop({ tag, onUse, on }: { tag: string; onUse: () => void; on: boolean }) {
  const body = useRef<Group>(null);
  useAnimate((dt) => {
    const g = body.current;
    if (!g) return false;
    // Вплотную — наклон, при котором крышка (−0,12) стоит прямо.
    const k = reducedMotion() ? 1 : 1 - Math.exp(-dt * 10);
    const to = on ? 0.12 : 0.28;
    g.rotation.x += (to - g.rotation.x) * k;
    return Math.abs(to - g.rotation.x) > SETTLED;
  });
  return (
    <group ref={body} rotation={[0.28, 0, 0]} scale={0.8}>
      <mesh position={[0, -0.75, 0.55]}>
        <boxGeometry args={[2.8, 0.1, 1.9]} />
        <meshStandardMaterial color={DEVICE} roughness={0.6} />
      </mesh>
      <group position={[0, 0.2, -0.4]} rotation={[-0.12, 0, 0]}>
        <mesh>
          <boxGeometry args={[2.8, 1.85, 0.08]} />
          <meshStandardMaterial color={DEVICE} roughness={0.6} />
        </mesh>
        <LaptopScreen onUse={onUse} on={on} />
      </group>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <Tag text={tag} at={[0.95, -1.15, -0.69]} />
      </group>
    </group>
  );
}

/** Скруглённый прямоугольник по центру — контур корпуса телефона. */
export function rounded(w: number, h: number, r: number) {
  const p = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
  return p;
}

const PHONE_W = 1.0;
const PHONE_H = 1.9;
const PHONE_D = 0.1;

/**
 * Телефон Габриэля в руках (4c-2; WM-B — автор 17.11: «условный iPhone»): скруглённый чёрный
 * корпус со стеклом во всю лицевую сторону, светлый металлический ободок, щель динамика сверху,
 * круглая кнопка «домой» снизу. Вплотную экран живой; кнопка «домой» на корпусе — на главный
 * экран. Своё оформление, без марок.
 */
function Phone({ tag, onUse, on }: { tag: string; onUse: () => void; on: boolean }) {
  const shape = useMemo(() => rounded(PHONE_W, PHONE_H, 0.17), []);
  const rim = useMemo(() => rounded(PHONE_W + 0.03, PHONE_H + 0.03, 0.185), []);
  const ring = useTexture(
    () =>
      paintTexture(0.17, 0.17, '#141416', ({ ctx, w, h }) => {
        ctx.strokeStyle = '#9a9ca0';
        ctx.lineWidth = w * 0.06;
        const r = w * 0.22;
        ctx.beginPath();
        ctx.roundRect(w / 2 - r, h / 2 - r, r * 2, r * 2, r * 0.35);
        ctx.stroke();
      }),
    [],
  );
  const home = useActive('phone-home', 'Home', 'phone-home-btn', () => phoneHome.go?.());
  const front = PHONE_D / 2 + 0.017;
  return (
    <group>
      <mesh position={[0, 0, -PHONE_D / 2]}>
        <extrudeGeometry
          args={[
            shape,
            {
              depth: PHONE_D,
              bevelEnabled: true,
              bevelThickness: 0.015,
              bevelSize: 0.015,
              bevelSegments: 3,
              curveSegments: 16,
            },
          ]}
        />
        <meshStandardMaterial color="#0d0d0f" roughness={0.15} metalness={0.3} />
      </mesh>
      {/* Ободок светлого металла. */}
      <mesh position={[0, 0, -PHONE_D / 2 + 0.01]}>
        <extrudeGeometry
          args={[rim, { depth: PHONE_D * 0.7, bevelEnabled: false, curveSegments: 16 }]}
        />
        <meshStandardMaterial color="#b9bcc1" roughness={0.25} metalness={0.9} />
      </mesh>
      <PhoneScreen onUse={onUse} on={on} z={front} />
      {/* Щель динамика. */}
      <mesh position={[0, 0.78, front]}>
        <planeGeometry args={[0.2, 0.028]} />
        <meshStandardMaterial color="#2c2d31" roughness={0.6} />
      </mesh>
      {/* Кнопка «домой». */}
      <group position={[0, -0.79, front]} ref={on ? home.anchor : undefined}>
        <mesh rotation={[Math.PI / 2, 0, 0]} {...(on ? home.handlers : {})}>
          <cylinderGeometry args={[0.085, 0.085, 0.006, 32]} />
          <meshStandardMaterial
            color={on && home.hover ? '#2a2b30' : '#141416'}
            roughness={0.3}
            metalness={0.4}
          />
        </mesh>
        <mesh position={[0, 0, 0.004]}>
          <circleGeometry args={[0.08, 32]} />
          <meshBasicMaterial map={ring} toneMapped={false} />
        </mesh>
      </group>
      <Tag text={tag} at={[0.85, -0.9, 0.08]} />
    </group>
  );
}

export function Device({
  id,
  tag,
  onUse,
  focused = false,
}: {
  id: string;
  tag: string;
  onUse: () => void;
  /** Вплотную к экрану (ноутбук, телефон — WM-B). */
  focused?: boolean;
}) {
  if (id === '47') return <Laptop tag={tag} onUse={onUse} on={focused} />;
  if (id === '48') return <Phone tag={tag} onUse={onUse} on={focused} />;
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
  // 24 — камера инженера (A-268): своя сцена, cameraModel.tsx.
  // 50 — стойка радиопоста целиком (A-267): своя сцена, radioStand.tsx.
  return null;
}
