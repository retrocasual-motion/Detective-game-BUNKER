import type { ThreeEvent } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { type Group, Vector3 } from 'three';
import { reducedMotion } from '../motion.ts';
import { captionNow, useRecorder } from '../radio/recorder.ts';
import { useGame } from '../store.ts';
import { type Focus, holdPart, useScreenAnchor } from './Held3D.tsx';
import { paintReceiverDial, paintRecorderScreen } from './radioFace.ts';
import { Tag, useActive, useTexture } from './shapes.tsx';
import { paintTexture } from './texture.ts';

/**
 * Стойка радиопоста в руках (50; A-267 — изъята целиком). Сверху приёмник общего покрытия —
 * шкала с тремя диапазонами и пятью карандашными метками, ручка настройки со стрелкой,
 * переключатель «РУЧН. / ПОИСК», выдвижной штырь для УКВ, сзади — отсоединённый антенный кабель;
 * посередине — регистратор RL-2 с горящим экраном и клавишами; внизу — блок питания. Без марок.
 *
 * Работа прямо на модели (автор 12.11): щелчок по регистратору или приёмнику — стойка встаёт
 * лицом, камера подъезжает к этой части (Held3D, Focus). У регистратора экран живой (разметка
 * поверх плоскости экрана), клавиши «звук ⏮ / пуск / звук ⏭ / метка» — на корпусе. У приёмника
 * ручка настройки крутится (тянуть, колесо, щелчок по краю, стрелки клавиатуры) и ведёт красную
 * стрелку по шкале; переключатель щёлкается. Приёмник обесточен — запись от этого не меняется
 * (T-4-A: игра не читает действий игрока как ответ); стойка, отложенная и взятая снова, — как при
 * изъятии (RS-A).
 */

/** Масштаб и сдвиг стойки в сцене — от них мировые рамки частей. */
const S = 0.62;
const OY = -0.15;
/** Наклон стойки в руках (вид «как взяли»); вплотную — лицом. */
const TILT: [number, number] = [0.12, -0.4];
const RECEIVER_Y = 0.72;
const RECORDER_Y = -0.12;
const UNIT_W = 2.16;

export type RadioPart = 'recorder' | 'receiver';

/** Рамки частей лицом к камере (мировые координаты): к ним подъезжает камера. */
export const RADIO_FOCUS: Record<RadioPart, Focus> = {
  recorder: {
    name: 'recorder',
    x: 0,
    z: S * 0.42,
    y: OY + S * RECORDER_Y,
    w: S * UNIT_W,
    h: S * 0.62,
    lift: 0.17,
  },
  receiver: {
    name: 'receiver',
    x: 0,
    z: S * 0.45,
    y: OY + S * RECEIVER_Y,
    w: S * UNIT_W,
    h: S * 0.86,
    lift: 0.1,
  },
};

/** Экран регистратора: размер плоскости и ширина его разметки, px. */
export const SCREEN_W = 1.5;
export const SCREEN_H = 0.42;
export const SCREEN_PX = 1000;

/** Шкала приёмника на панели: центр по x и ширина; стрелка — доля этой ширины. */
const DIAL_X = -0.2;
const DIAL_W = 1.6;
const DIAL_H = 0.55;

const RACK = '#3d4044';
const PANEL = '#8f9398';

export function RadioStand({
  tag,
  focus,
  onFocus,
}: {
  tag: string;
  focus: RadioPart | null;
  onFocus: (part: RadioPart) => void;
}) {
  const stand = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = stand.current;
    if (!g) return;
    const k = reducedMotion() ? 1 : 1 - Math.exp(-dt * 10);
    const [tx, ty] = focus ? [0, 0] : TILT;
    g.rotation.x += (tx - g.rotation.x) * k;
    g.rotation.y += (ty - g.rotation.y) * k;
  });
  return (
    <group ref={stand} rotation={[TILT[0], TILT[1], 0]} scale={S} position={[0, OY, 0]}>
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

      <Receiver on={focus === 'receiver'} onFocus={() => onFocus('receiver')} />
      <Recorder on={focus === 'recorder'} onFocus={() => onFocus('recorder')} />

      {/* Блок питания: решётка и выключатель. */}
      <group position={[0, -0.86, 0]}>
        <mesh>
          <boxGeometry args={[UNIT_W, 0.62, 0.8]} />
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

/** Приёмник: щелчок — вплотную; вплотную — ручка, стрелка, переключатель. */
function Receiver({ on, onFocus }: { on: boolean; onFocus: () => void }) {
  const dial = useTexture(() => paintTexture(DIAL_W, DIAL_H, null, paintReceiverDial()), []);
  const sw = useTexture(
    () =>
      paintTexture(0.76, 0.1, null, ({ ctx, w, h }) => {
        ctx.fillStyle = '#eceee8';
        ctx.font = `700 ${Math.round(h * 0.5)}px Tahoma, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText('РУЧН.', w * 0.02, h * 0.5);
        ctx.textAlign = 'right';
        ctx.fillText('ПОИСК', w * 0.98, h * 0.5);
      }),
    [],
  );
  const needle = useRecorder((r) => r.needle);
  const unit = useActive('radio-receiver', 'Работать с приёмником', 'radio-receiver', onFocus);
  return (
    <group position={[0, RECEIVER_Y, 0]} {...(on ? {} : unit.handlers)}>
      <mesh>
        <boxGeometry args={[UNIT_W, 0.86, 0.8]} />
        <meshStandardMaterial
          color={PANEL}
          roughness={0.45}
          metalness={0.5}
          emissive="#2a3440"
          emissiveIntensity={!on && unit.hover ? 0.5 : 0}
        />
      </mesh>
      <group position={[DIAL_X, 0.05, 0.401]} ref={on ? undefined : unit.anchor}>
        <mesh>
          <planeGeometry args={[DIAL_W, DIAL_H]} />
          <meshBasicMaterial map={dial} toneMapped={false} />
        </mesh>
        {/* Стрелка — красная риска за стеклом; её ведёт ручка настройки. */}
        <mesh position={[(needle - 0.5) * DIAL_W, 0, 0.002]}>
          <planeGeometry args={[0.012, DIAL_H * 0.92]} />
          <meshBasicMaterial color="#b3261e" toneMapped={false} />
        </mesh>
      </group>
      <TuningKnob on={on} needle={needle} />
      <mesh position={[0.82, -0.3, 0.43]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.075, 0.06, 24]} />
        <meshStandardMaterial color="#444" roughness={0.45} metalness={0.4} />
      </mesh>
      <ModeSwitch on={on} />
      <mesh position={[-0.68, -0.33, 0.402]}>
        <planeGeometry args={[0.76, 0.1]} />
        <meshBasicMaterial map={sw} transparent toneMapped={false} />
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
  );
}

/** Сколько оборотов ручки на всю шкалу. */
const TURNS = 4;
const KNOB_STEP = 0.01;

/**
 * Ручка настройки: тянуть мышью (вбок или вверх-вниз), колесо, щелчок по левому или правому краю —
 * на шаг; с клавиатуры — стрелки (RadioHeld). Только вплотную к приёмнику.
 */
function TuningKnob({ on, needle }: { on: boolean; needle: number }) {
  const turn = useRecorder((r) => r.turnKnob);
  const s = useActive(
    'radio-knob',
    'Ручка настройки — повернуть вправо',
    'radio-knob',
    () => turn(KNOB_STEP),
    true,
  );
  const handlers = on
    ? {
        ...s.handlers,
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          const c = e.object.getWorldPosition(new Vector3());
          turn(e.point.x < c.x ? -KNOB_STEP : KNOB_STEP);
        },
        onPointerDown: (e: ThreeEvent<PointerEvent>) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          holdPart();
          let last = { x: e.clientX, y: e.clientY };
          const move = (ev: PointerEvent) => {
            turn((ev.clientX - last.x - (ev.clientY - last.y)) * 0.0012);
            last = { x: ev.clientX, y: ev.clientY };
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        },
        onWheel: (e: ThreeEvent<WheelEvent>) => {
          e.stopPropagation();
          turn(e.nativeEvent.deltaY < 0 ? KNOB_STEP : -KNOB_STEP);
        },
      }
    : {};
  return (
    <group
      position={[0.82, 0.02, 0.45]}
      rotation={[0, 0, -(needle - 0.5) * 2 * Math.PI * TURNS]}
      ref={on ? s.anchor : undefined}
    >
      <mesh rotation={[Math.PI / 2, 0, 0]} {...handlers}>
        <cylinderGeometry args={[0.17, 0.18, 0.15, 36]} />
        <meshStandardMaterial
          color={on && s.hover ? '#3a3d42' : '#2b2d30'}
          roughness={0.45}
          metalness={0.4}
        />
      </mesh>
      {/* Риска на ручке — видно, что она повернулась. */}
      <mesh position={[0, 0.11, 0.076]}>
        <planeGeometry args={[0.025, 0.09]} />
        <meshBasicMaterial color="#e8e8e2" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Переключатель «РУЧН. / ПОИСК»: рычажок наклоняется к надписи; щелчок — в другое положение. */
function ModeSwitch({ on }: { on: boolean }) {
  const mode = useRecorder((r) => r.mode);
  const flip = useRecorder((r) => r.flip);
  const s = useActive('radio-switch', 'Переключатель «РУЧН. / ПОИСК»', 'radio-switch', flip);
  return (
    <group position={[-0.68, -0.33, 0.401]} ref={on ? s.anchor : undefined}>
      <mesh rotation={[Math.PI / 2, 0, 0]} {...(on ? s.handlers : {})}>
        <cylinderGeometry args={[0.065, 0.07, 0.03, 24]} />
        <meshStandardMaterial
          color={on && s.hover ? '#e2e4e6' : '#b8bbbf'}
          metalness={0.7}
          roughness={0.3}
        />
      </mesh>
      <group rotation={[0, mode === 'ПОИСК' ? 0.55 : -0.55, 0]}>
        <mesh position={[0, 0, 0.07]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.014, 0.018, 0.12, 12]} />
          <meshStandardMaterial color="#d0d2d4" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0, 0.13]}>
          <sphereGeometry args={[0.025, 12, 12]} />
          <meshStandardMaterial color="#d0d2d4" metalness={0.8} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

/** Регистратор RL-2: щелчок — вплотную; вплотную — живой экран и клавиши на корпусе. */
function Recorder({ on, onFocus }: { on: boolean; onFocus: () => void }) {
  const plate = useTexture(
    () =>
      paintTexture(0.9, 0.16, '#d8dadc', ({ ctx, w, h }) => {
        ctx.fillStyle = '#2a2c2f';
        ctx.font = `700 ${Math.round(h * 0.34)}px Tahoma, sans-serif`;
        ctx.fillText('FIELDWORKS RADIO · RL-2', w * 0.04, h * 0.3, w * 0.92);
      }),
    [],
  );
  const labels = useTexture(
    () =>
      paintTexture(0.4, 0.4, null, ({ ctx, w, h }) => {
        ctx.fillStyle = '#25272a';
        ctx.font = `700 ${Math.round(h * 0.06)}px Tahoma, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Под клавишами (их центры: x 0.75 / 0.87 / 0.99 и 0.87 внизу; поле — от x 0.67).
        const at = (x: number) => ((x - 0.67) / 0.4) * w;
        ctx.fillText('ЗВУК', at(0.75), h * 0.42);
        ctx.fillText('ПУСК', at(0.87), h * 0.42);
        ctx.fillText('ЗВУК', at(0.99), h * 0.42);
        ctx.fillText('МЕТКА', at(0.87), h * 0.9);
      }),
    [],
  );
  const sticker = useTexture(
    () =>
      paintTexture(0.62, 0.09, '#f0eedf', ({ ctx, w, h }) => {
        ctx.fillStyle = '#3a3a34';
        ctx.font = `${Math.round(h * 0.42)}px Tahoma, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText('непрерывная запись · без стирания', w * 0.04, h * 0.52, w * 0.92);
      }),
    [],
  );
  const ledLabels = useTexture(
    () =>
      paintTexture(0.36, 0.1, null, ({ ctx, w, h }) => {
        ctx.fillStyle = '#25272a';
        ctx.font = `700 ${Math.round(h * 0.5)}px Tahoma, sans-serif`;
        ctx.textBaseline = 'middle';
        // Индикаторы стоят на x 0.78 и 0.92; поле — от x 0.7.
        ctx.fillText('1', ((0.83 - 0.7) / 0.36) * w, h * 0.5);
        ctx.fillText('2', ((0.97 - 0.7) / 0.36) * w, h * 0.5);
      }),
    [],
  );
  const playing = useRecorder((r) => r.playing);
  // Канон (L906): оба индикатора горят; ярче — где в точке что-то слышно.
  const loud = useRecorder((r) => {
    const c = captionNow(r);
    return !!c && !c.background;
  });
  const r = useRecorder.getState;
  const unit = useActive('radio-recorder', 'Работать с регистратором', 'device-use', onFocus);
  return (
    <group position={[0, RECORDER_Y, 0]} {...(on ? {} : unit.handlers)}>
      <mesh>
        <boxGeometry args={[UNIT_W, 0.62, 0.8]} />
        <meshStandardMaterial
          color="#b9bcc0"
          roughness={0.4}
          metalness={0.6}
          emissive="#2a3440"
          emissiveIntensity={!on && unit.hover ? 0.4 : 0}
        />
      </mesh>
      <mesh position={[-0.55, 0.22, 0.401]}>
        <planeGeometry args={[0.9, 0.16]} />
        <meshBasicMaterial map={plate} toneMapped={false} />
      </mesh>
      <group position={[-0.1, -0.06, 0.401]} ref={on ? undefined : unit.anchor}>
        <RecorderScreen on={on} />
      </group>
      <mesh position={[0.32, 0.22, 0.401]} rotation={[0, 0, 0.015]}>
        <planeGeometry args={[0.62, 0.09]} />
        <meshBasicMaterial map={sticker} toneMapped={false} />
      </mesh>
      <mesh position={[0.88, 0.18, 0.401]}>
        <planeGeometry args={[0.36, 0.1]} />
        <meshBasicMaterial map={ledLabels} transparent toneMapped={false} />
      </mesh>
      {[0.78, 0.92].map((x) => (
        <mesh key={x} position={[x, 0.18, 0.41]}>
          <sphereGeometry args={[0.03, 10, 10]} />
          <meshStandardMaterial
            color={loud ? '#ffd9a0' : '#ff9d2e'}
            emissive="#ff7a10"
            emissiveIntensity={loud ? 2.2 : 0.6}
          />
        </mesh>
      ))}
      <mesh position={[0.87, -0.11, 0.401]}>
        <planeGeometry args={[0.4, 0.4]} />
        <meshBasicMaterial map={labels} transparent toneMapped={false} />
      </mesh>
      <Key
        on={on}
        at={[0.75, -0.02]}
        glyph="⏮"
        label="Звук ⏮ — к прежней полосе"
        testId="radio-prev"
        action={() => r().prevSound()}
      />
      <Key
        on={on}
        at={[0.87, -0.02]}
        glyph={playing ? '❚❚' : '▶'}
        label={playing ? 'Пауза' : 'Пуск'}
        testId="radio-play"
        green
        action={() => r().toggle()}
      />
      <Key
        on={on}
        at={[0.99, -0.02]}
        glyph="⏭"
        label="Звук ⏭ — к следующей полосе"
        testId="radio-next"
        action={() => r().nextSound()}
      />
      <Key
        on={on}
        at={[0.87, -0.2]}
        glyph="✎"
        label="Метка — поставить здесь"
        testId="radio-mark-add"
        action={() => r().setLabeling('')}
      />
    </group>
  );
}

/** Клавиша на корпусе регистратора: значок на клавише, подпись под ней — краской на корпусе. */
function Key({
  on,
  at,
  glyph,
  label,
  testId,
  green,
  action,
}: {
  on: boolean;
  at: [number, number];
  glyph: string;
  label: string;
  testId: string;
  green?: boolean;
  action: () => void;
}) {
  const s = useActive(testId, label, testId, action);
  const color = green ? '#46603d' : '#2e3135';
  const face = useTexture(
    () =>
      paintTexture(0.1, 0.08, color, ({ ctx, w, h }) => {
        ctx.fillStyle = '#eef0f2';
        ctx.font = `700 ${Math.round(h * 0.5)}px "Segoe UI Symbol", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glyph, w / 2, h * 0.54);
      }),
    [glyph, color],
  );
  const pressed = on && s.hover;
  return (
    <group position={[at[0], at[1], 0.401]} ref={on ? s.anchor : undefined}>
      <group position={[0, 0, pressed ? 0.012 : 0.02]}>
        <mesh {...(on ? s.handlers : {})}>
          <boxGeometry args={[0.1, 0.08, 0.04]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.0205]}>
          <planeGeometry args={[0.1, 0.08]} />
          <meshBasicMaterial map={face} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Экран регистратора на модели: издали — картинка; вплотную поверх неё — живая разметка. */
function RecorderScreen({ on }: { on: boolean }) {
  const body50 = useGame((g) => g.materials.find((m) => m.id === '50')?.body ?? '');
  const pos = useRecorder((r) => Math.round(r.pos));
  const anchor = useRef<Group>(null);
  useScreenAnchor(on ? anchor : NO_ANCHOR, SCREEN_W, SCREEN_H);
  const face = useTexture(
    () => paintTexture(SCREEN_W, SCREEN_H, null, paintRecorderScreen(body50, pos)),
    [body50, pos],
  );
  return (
    <group ref={anchor}>
      <mesh>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        <meshBasicMaterial map={face} toneMapped={false} color="#e4e8ee" />
      </mesh>
    </group>
  );
}

const NO_ANCHOR = { current: null };
