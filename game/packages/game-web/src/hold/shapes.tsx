import { useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasTexture, Group } from 'three';
import { gameNow, hhmm } from '../clock.ts';
import { useGame } from '../store.ts';
import { onClickPart, setPartCursor, useSpot } from './Held3D.tsx';
import { paintLaptopFace } from './laptopFace.ts';
import { paintPhoneFace } from './phoneFace.ts';
import { paintReceiverDial, paintRecorderScreen } from './radioFace.ts';
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
  face,
}: {
  w: number;
  h: number;
  z: number;
  label: string;
  onUse: () => void;
  /** Что горит на экране (включённое устройство): картинка светится сама. */
  face?: CanvasTexture;
}) {
  const s = useActive('screen', label, 'device-use', onUse);
  return (
    <group position={[0, 0, z]} ref={s.anchor}>
      <mesh {...s.handlers}>
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

/** Экран ноутбука в руках — уже включён: вход или рабочий стол (правка автора 10.11). */
function LaptopScreen({ onUse }: { onUse: () => void }) {
  const unlocked = useGame((g) => g.materials.some((m) => m.id === 'L560'));
  const face = useTexture(
    () => paintTexture(2.5, 1.55, null, paintLaptopFace(unlocked)),
    [unlocked],
  );
  return <Screen w={2.5} h={1.55} z={0.041} label="Открыть ноутбук" onUse={onUse} face={face} />;
}

/** Экран телефона в руках — уже горит: экран блокировки с уведомлениями (как на живом экране). */
function PhoneScreen({ onUse }: { onUse: () => void }) {
  const unlocked = useGame((g) => g.materials.some((m) => m.id === 'L540'));
  const body48 = useGame((g) => g.materials.find((m) => m.id === '48')?.body ?? '');
  const started = useGame((g) => g.state?.started);
  const time = hhmm(gameNow(started));
  const face = useTexture(
    () => paintTexture(0.82, 1.6, null, paintPhoneFace(unlocked, body48, time)),
    [unlocked, body48, time],
  );
  return <Screen w={0.82} h={1.6} z={0.051} label="Включить телефон" onUse={onUse} face={face} />;
}

/** Экран регистратора RL-2 на стойке — уже горит: время и шкала отрезка (как на панели). */
function RecorderScreen({ onUse }: { onUse: () => void }) {
  const body50 = useGame((g) => g.materials.find((m) => m.id === '50')?.body ?? '');
  const pos = useGame((g) => g.state?.radio?.pos ?? 35_000);
  const face = useTexture(
    () => paintTexture(1.5, 0.42, null, paintRecorderScreen(body50, pos)),
    [body50, pos],
  );
  return (
    <Screen w={1.5} h={0.42} z={0.081} label="Работать с регистратором" onUse={onUse} face={face} />
  );
}

/** Ручка (круглая) на передней панели. */
function Knob({
  at,
  r,
  color = '#2b2d30',
}: {
  at: [number, number, number];
  r: number;
  color?: string;
}) {
  return (
    <mesh position={at} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[r, r * 1.05, r * 0.9, 28]} />
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.4} />
    </mesh>
  );
}

/**
 * Стойка радиопоста (50; A-267 — изъята целиком): сверху приёмник общего покрытия — шкала с
 * тремя диапазонами и пятью карандашными метками, ручка настройки, переключатель «РУЧН. / ПОИСК»
 * в положении ПОИСК, выдвижной штырь для УКВ, сзади — отсоединённый антенный кабель (основная
 * антенна поста — наружная); посередине — регистратор RL-2 с горящим экраном (щелчок — работать);
 * внизу — блок питания. Без марок, своё оформление.
 */
function RadioStand({ tag, onUse }: { tag: string; onUse: () => void }) {
  const dial = useTexture(() => paintTexture(1.6, 0.55, null, paintReceiverDial()), []);
  const plate = useTexture(
    () =>
      paintTexture(0.9, 0.16, '#d8dadc', ({ ctx, w, h }) => {
        ctx.fillStyle = '#2a2c2f';
        ctx.font = `700 ${Math.round(h * 0.34)}px Tahoma, sans-serif`;
        ctx.fillText('FIELDWORKS RADIO · RL-2', w * 0.04, h * 0.3, w * 0.92);
      }),
    [],
  );
  const sw = useTexture(
    () =>
      paintTexture(0.36, 0.14, null, ({ ctx, w, h }) => {
        ctx.fillStyle = '#e8e8e2';
        ctx.font = `700 ${Math.round(h * 0.34)}px Tahoma, sans-serif`;
        ctx.fillText('РУЧН.', w * 0.02, h * 0.3);
        ctx.fillText('ПОИСК', w * 0.55, h * 0.3);
      }),
    [],
  );
  const RACK = '#3d4044';
  const PANEL = '#8f9398';
  return (
    <group rotation={[0.12, -0.4, 0]} scale={0.62} position={[0, -0.15, 0]}>
      {/* Рама стойки. */}
      {[-1.12, 1.12].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <boxGeometry args={[0.08, 2.5, 0.9]} />
          <meshStandardMaterial color={RACK} roughness={0.6} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 1.25, 0]}>
        <boxGeometry args={[2.32, 0.06, 0.9]} />
        <meshStandardMaterial color={RACK} roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, -1.25, 0]}>
        <boxGeometry args={[2.32, 0.08, 0.9]} />
        <meshStandardMaterial color={RACK} roughness={0.6} metalness={0.3} />
      </mesh>

      {/* Приёмник. */}
      <group position={[0, 0.72, 0]}>
        <mesh>
          <boxGeometry args={[2.16, 0.86, 0.8]} />
          <meshStandardMaterial color={PANEL} roughness={0.45} metalness={0.5} />
        </mesh>
        <mesh position={[-0.2, 0.05, 0.401]}>
          <planeGeometry args={[1.6, 0.55]} />
          <meshBasicMaterial map={dial} toneMapped={false} />
        </mesh>
        <Knob at={[0.82, 0.02, 0.45]} r={0.17} />
        <Knob at={[0.82, -0.3, 0.43]} r={0.07} color="#444" />
        {/* Переключатель «РУЧН. / ПОИСК» — в положении ПОИСК (A-267). */}
        <mesh position={[-0.7, -0.34, 0.401]}>
          <planeGeometry args={[0.36, 0.14]} />
          <meshBasicMaterial map={sw} transparent toneMapped={false} />
        </mesh>
        <mesh position={[-0.6, -0.34, 0.44]} rotation={[0, 0, -0.5]}>
          <boxGeometry args={[0.03, 0.12, 0.06]} />
          <meshStandardMaterial color="#d0d2d4" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Выдвижной штырь (УКВ) на крышке. */}
        <group position={[0.9, 0.43, -0.25]} rotation={[0, 0, -0.35]}>
          <mesh position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.012, 0.02, 1.4, 10]} />
            <meshStandardMaterial color="#c9ccd0" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0, 1.41, 0]}>
            <sphereGeometry args={[0.025, 10, 10]} />
            <meshStandardMaterial color="#c9ccd0" metalness={0.9} roughness={0.2} />
          </mesh>
        </group>
        {/* Антенный кабель сзади — отсоединён при изъятии. */}
        <mesh position={[-0.75, -0.2, -0.55]} rotation={[0.9, 0, 0.2]}>
          <torusGeometry args={[0.28, 0.025, 8, 24, Math.PI * 1.3]} />
          <meshStandardMaterial color="#1b1c1e" roughness={0.8} />
        </mesh>
      </group>

      {/* Регистратор RL-2. */}
      <group position={[0, -0.12, 0]}>
        <mesh>
          <boxGeometry args={[2.16, 0.62, 0.8]} />
          <meshStandardMaterial color="#b9bcc0" roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[-0.55, 0.22, 0.401]}>
          <planeGeometry args={[0.9, 0.16]} />
          <meshBasicMaterial map={plate} toneMapped={false} />
        </mesh>
        <group position={[-0.1, -0.06, 0.32]}>
          <RecorderScreen onUse={onUse} />
        </group>
        {[0.78, 0.92].map((x) => (
          <mesh key={x} position={[x, 0.18, 0.41]}>
            <sphereGeometry args={[0.03, 10, 10]} />
            <meshStandardMaterial color="#ff9d2e" emissive="#ff7a10" emissiveIntensity={0.8} />
          </mesh>
        ))}
        {[0.7, 0.84, 0.98].map((x) => (
          <mesh key={x} position={[x, -0.12, 0.41]}>
            <boxGeometry args={[0.11, 0.08, 0.04]} />
            <meshStandardMaterial color="#2e3135" roughness={0.5} />
          </mesh>
        ))}
      </group>

      {/* Блок питания: решётка и выключатель. */}
      <group position={[0, -0.86, 0]}>
        <mesh>
          <boxGeometry args={[2.16, 0.62, 0.8]} />
          <meshStandardMaterial color="#55585d" roughness={0.6} metalness={0.3} />
        </mesh>
        {[-0.9, -0.78, -0.66, -0.54, -0.42, -0.3, -0.18, -0.06, 0.06].map((vx) => (
          <mesh key={vx} position={[vx, 0, 0.401]}>
            <planeGeometry args={[0.05, 0.36]} />
            <meshStandardMaterial color="#26282b" />
          </mesh>
        ))}
        <mesh position={[0.85, 0, 0.42]}>
          <boxGeometry args={[0.16, 0.1, 0.05]} />
          <meshStandardMaterial color="#a32a22" roughness={0.4} />
        </mesh>
      </group>
      <Tag text={tag} at={[0.95, -1.45, 0.47]} />
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
          <LaptopScreen onUse={onUse} />
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
        <PhoneScreen onUse={onUse} />
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
  // 50 — стойка радиопоста целиком (A-267).
  return <RadioStand tag={tag} onUse={onUse} />;
}
