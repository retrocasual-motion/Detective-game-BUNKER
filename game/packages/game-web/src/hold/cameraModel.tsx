import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { useCamera } from '../camera/camera.ts';
import { reducedMotion } from '../motion.ts';
import type { Focus } from './Held3D.tsx';
import { rounded, Screen, Tag, useActive, useTexture } from './shapes.tsx';
import { paintTexture } from './texture.ts';

/**
 * Камера инженера в руках (24; A-268 — изъята сама камера с картой внутри; автор 17.11: «как
 * телефон»). Компактная камера 2009 года по референсам (Canon PowerShot SD1200 / IXUS 95, Sony
 * W290): плоский металлический корпус со скруглёнными углами; спереди — объектив в выступающем
 * кольце и окошко вспышки, сверху — спуск и кнопка питания; сзади слева — экран 4:3, справа —
 * рычажок зума W/T, четырёхпозиционная кнопка с SET в центре, MENU и DISP. Вертят как вещь;
 * щелчок по экрану — камера встаёт задней стороной к игроку, камера сцены подъезжает, экран живой
 * (CameraScreen), кнопки на корпусе работают. Своё оформление, без марок.
 */

const W = 1.6;
const H = 1.0;
const D = 0.32;
const BACK = D / 2 + 0.02;
/** Экран — 0,96 × 0,72 (4:3) слева на задней стороне. */
export const CAMERA_SCREEN: [number, number] = [0.96, 0.72];
const SCREEN_X = -0.27;
/** Правая колонка кнопок. */
const CX = 0.52;
/** Наклон «как взяли в руки» — видно бок и объектив; вплотную — задней стороной ровно. */
const TILT: [number, number] = [0.18, 0.55];

/** Рамка задней стороны (мировые координаты): к ней подъезжает камера сцены. */
export const CAMERA_FOCUS: Focus = {
  name: 'camera',
  x: 0,
  y: 0,
  z: BACK,
  w: W,
  h: H + 0.06,
  lift: 0.15,
  fill: [0.9, 0.55],
};

export function CameraDevice({ tag, on, onUse }: { tag: string; on: boolean; onUse: () => void }) {
  const body = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = body.current;
    if (!g) return;
    const k = reducedMotion() ? 1 : 1 - Math.exp(-dt * 10);
    const [tx, ty] = on ? [0, 0] : TILT;
    g.rotation.x += (tx - g.rotation.x) * k;
    g.rotation.y += (ty - g.rotation.y) * k;
  });
  const shape = useMemo(() => rounded(W, H, 0.14), []);
  const c = useCamera.getState;
  const face = useTexture(
    () =>
      paintTexture(CAMERA_SCREEN[0], CAMERA_SCREEN[1], '#050506', ({ ctx, w, h }) => {
        // Издали экран тёмный, с бликом: снимок видно вплотную.
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, 'rgb(255 255 255 / 10%)');
        g.addColorStop(0.5, 'rgb(255 255 255 / 0%)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }),
    [],
  );
  return (
    <group ref={body} rotation={[TILT[0], TILT[1], 0]}>
      {/* Корпус: светлый металл, скруглённые углы. */}
      <mesh position={[0, 0, -D / 2]}>
        <extrudeGeometry
          args={[
            shape,
            {
              depth: D,
              bevelEnabled: true,
              bevelThickness: 0.02,
              bevelSize: 0.02,
              bevelSegments: 3,
              curveSegments: 14,
            },
          ]}
        />
        <meshStandardMaterial color="#b8bbc0" roughness={0.3} metalness={0.85} />
      </mesh>

      {/* Спереди: объектив в кольце, окошко вспышки, лампа автофокуса. */}
      <group position={[0.38, 0.04, -BACK]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.3, 0.32, 0.1, 40]} />
          <meshStandardMaterial color="#cfd2d6" roughness={0.25} metalness={0.9} />
        </mesh>
        <mesh position={[0, 0.13, 0]}>
          <cylinderGeometry args={[0.22, 0.25, 0.08, 40]} />
          <meshStandardMaterial color="#26282c" roughness={0.4} metalness={0.5} />
        </mesh>
        <mesh position={[0, 0.172, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 0.005, 40]} />
          <meshStandardMaterial color="#0e1a2a" roughness={0.05} metalness={0.6} />
        </mesh>
      </group>
      <mesh position={[-0.48, 0.3, -BACK - 0.001]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.3, 0.13]} />
        <meshStandardMaterial color="#e9e6dc" roughness={0.2} emissive="#3a3830" />
      </mesh>
      <mesh position={[-0.14, 0.34, -BACK - 0.001]} rotation={[0, Math.PI, 0]}>
        <circleGeometry args={[0.035, 20]} />
        <meshStandardMaterial color="#a8541c" roughness={0.3} />
      </mesh>

      {/* Сверху: спуск и кнопка питания. */}
      <mesh position={[0.5, H / 2 + 0.03, 0]}>
        <cylinderGeometry args={[0.08, 0.085, 0.05, 28]} />
        <meshStandardMaterial color="#d8dadd" roughness={0.25} metalness={0.9} />
      </mesh>
      <mesh position={[0.2, H / 2 + 0.02, 0]}>
        <boxGeometry args={[0.12, 0.03, 0.06]} />
        <meshStandardMaterial color="#3a3c40" roughness={0.4} />
      </mesh>

      {/* Сзади: экран и кнопки. */}
      <group position={[SCREEN_X, 0, 0]}>
        <Screen
          w={CAMERA_SCREEN[0]}
          h={CAMERA_SCREEN[1]}
          z={BACK + 0.002}
          label="Посмотреть кадры"
          onUse={onUse}
          face={face}
          on={on}
        />
      </group>
      <group position={[0, 0, BACK + 0.002]}>
        <Btn
          on={on}
          at={[CX - 0.08, 0.36]}
          size={[0.15, 0.09]}
          glyph="W"
          label="Рычажок зума — W (уменьшить, таблица)"
          testId="camera-w"
          action={() => c().wide()}
        />
        <Btn
          on={on}
          at={[CX + 0.08, 0.36]}
          size={[0.15, 0.09]}
          glyph="T"
          label="Рычажок зума — T (увеличить)"
          testId="camera-t"
          action={() => c().tele()}
        />
        {/* Четырёхпозиционная кнопка: кольцо, стрелки и SET. */}
        <mesh position={[CX, 0, 0.004]}>
          <ringGeometry args={[0.1, 0.2, 40]} />
          <meshStandardMaterial color="#8d9095" roughness={0.3} metalness={0.8} />
        </mesh>
        <Btn
          on={on}
          at={[CX, 0.14]}
          size={[0.08, 0.07]}
          glyph="▲"
          label="Вверх"
          testId="camera-up"
          action={() => c().up()}
        />
        <Btn
          on={on}
          at={[CX, -0.14]}
          size={[0.08, 0.07]}
          glyph="▼"
          label="Вниз"
          testId="camera-down"
          action={() => c().down()}
        />
        <Btn
          on={on}
          at={[CX - 0.14, 0]}
          size={[0.07, 0.08]}
          glyph="◀"
          label="Предыдущий кадр"
          testId="camera-left"
          action={() => c().left()}
        />
        <Btn
          on={on}
          at={[CX + 0.14, 0]}
          size={[0.07, 0.08]}
          glyph="▶"
          label="Следующий кадр"
          testId="camera-right"
          action={() => c().right()}
        />
        <Btn
          on={on}
          at={[CX, 0]}
          size={[0.12, 0.12]}
          round
          glyph="SET"
          label="SET"
          testId="camera-set"
          action={() => c().set()}
        />
        <Btn
          on={on}
          at={[CX - 0.13, -0.38]}
          size={[0.18, 0.08]}
          glyph="MENU"
          label="MENU"
          testId="camera-menu"
          action={() => c().menu()}
        />
        <Btn
          on={on}
          at={[CX + 0.13, -0.38]}
          size={[0.18, 0.08]}
          glyph="DISP."
          label="DISP — информация на экране"
          testId="camera-disp"
          action={() => c().display()}
        />
      </group>
      {/* Бирка вещдока — на петле ремешка сбоку. */}
      <Tag text={tag} at={[1.08, -0.5, -0.12]} />
    </group>
  );
}

/** Кнопка на корпусе: значок краской на самой кнопке; работает вплотную. */
function Btn({
  on,
  at,
  size,
  glyph,
  label,
  testId,
  action,
  round,
}: {
  on: boolean;
  at: [number, number];
  size: [number, number];
  glyph: string;
  label: string;
  testId: string;
  action: () => void;
  round?: boolean;
}) {
  const s = useActive(testId, label, testId, action);
  const [w, h] = size;
  const face = useTexture(
    () =>
      paintTexture(w, h, '#2b2d31', ({ ctx, w: pw, h: ph }) => {
        ctx.fillStyle = '#e9eaec';
        const small = glyph.length > 1;
        ctx.font = `700 ${Math.round(ph * (small ? 0.42 : 0.6))}px Tahoma, "Segoe UI Symbol", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glyph, pw / 2, ph * 0.54, pw * 0.9);
      }),
    [glyph, w, h],
  );
  const pressed = on && s.hover;
  return (
    <group position={[at[0], at[1], 0]} ref={on ? s.anchor : undefined}>
      <group position={[0, 0, pressed ? 0.008 : 0.016]}>
        <mesh rotation={round ? [Math.PI / 2, 0, 0] : [0, 0, 0]} {...(on ? s.handlers : {})}>
          {round ? (
            <cylinderGeometry args={[w / 2, w / 2, 0.03, 28]} />
          ) : (
            <boxGeometry args={[w, h, 0.03]} />
          )}
          <meshStandardMaterial color={pressed ? '#3a3d42' : '#2b2d31'} roughness={0.4} />
        </mesh>
        {round ? (
          <mesh position={[0, 0, 0.016]}>
            <circleGeometry args={[w / 2 - 0.004, 28]} />
            <meshBasicMaterial map={face} toneMapped={false} />
          </mesh>
        ) : (
          <mesh position={[0, 0, 0.016]}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial map={face} toneMapped={false} />
          </mesh>
        )}
      </group>
    </group>
  );
}
