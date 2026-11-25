import type { Room } from '../room/camera.ts';
import type { DeskObject } from '../room/decor.ts';
import { css3 } from './space.ts';
import type { Rect } from './world.ts';

/**
 * Вещи следователя для 3D-стола (MG-A, автор 24.11): нарисованы игрой (`room/decor.ts`), здесь —
 * только объём без цвета. Он пишет глубину: лист за монитором или под лампой ими закрыт, как на
 * самом деле; и он же — преграда (`footprints`): вещь его обходит.
 */

type Box = DeskObject['boxes'][number];

/** Следы вещей следователя на столе (м, с поворотом) — запретная часть зоны улик. */
export function footprints(room: Room, objs: DeskObject[], margin = 0.01): Rect[] {
  const { p } = room;
  return objs.flatMap((o) =>
    o.boxes.map((b) => {
      const w = (b.max[0] - b.min[0]) / p + margin * 2;
      const d = (b.max[2] - b.min[2]) / p + margin * 2;
      const cx = (b.min[0] + b.max[0]) / 2;
      const cz = (b.min[2] + b.max[2]) / 2;
      if (!b.yaw || !b.pivot) return { x: cx / p, z: cz / p, w, d, rot: 0 };
      const [px, pz] = b.pivot;
      const c = Math.cos(b.yaw);
      const s = Math.sin(b.yaw);
      const x = px + (cx - px) * c + (cz - pz) * s;
      const z = pz - (cx - px) * s + (cz - pz) * c;
      return { x: x / p, z: z / p, w, d, rot: b.yaw };
    }),
  );
}

function DepthBox({ b }: { b: Box }) {
  const w = b.max[0] - b.min[0];
  const h = b.max[1] - b.min[1];
  const d = b.max[2] - b.min[2];
  const c = css3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  const [px, pz] = b.yaw && b.pivot ? b.pivot : [c.x, c.z];
  return (
    <group position={[px, c.y, pz]} rotation={[0, b.yaw ?? 0, 0]}>
      {/* Рисуется первым: глубина готова до листов. */}
      {/* Ближе листа под мышью — нажатие этой вещи: дальше по лучу 3D-стол его не берёт (took.ts). */}
      <mesh
        position={[c.x - px, 0, c.z - pz]}
        renderOrder={-1}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerOver={(e) => e.stopPropagation()}
      >
        <boxGeometry args={[w, h, d]} />
        <meshBasicMaterial colorWrite={false} />
      </mesh>
    </group>
  );
}

/** Свет — как в прототипе: листы и устройства освещены, как нарисованная комната. */
export function Occluders({ room, objects }: { room: Room; objects: DeskObject[] }) {
  const lamp = objects.find((o) => o.key === 'lamp')?.boxes[2];
  const lampAt = lamp
    ? css3((lamp.min[0] + lamp.max[0]) / 2, lamp.max[1] + 4, (lamp.min[2] + lamp.max[2]) / 2)
    : null;
  return (
    <group>
      <ambientLight intensity={1.1} />
      <hemisphereLight args={['#c8c4bc', '#3a332b', 0.9]} />
      <directionalLight position={[room.p * 0.4, room.p * 2, room.p * 2.2]} intensity={1.4} />
      {lampAt && (
        <pointLight
          position={lampAt.toArray()}
          color="#ffd9a0"
          intensity={1.6}
          distance={room.p * 1.6}
          decay={0}
        />
      )}
      {objects.flatMap((o) =>
        // biome-ignore lint/suspicious/noArrayIndexKey: коробки предмета постоянны
        o.boxes.map((b, k) => <DepthBox key={`${o.key}-${k}`} b={b} />),
      )}
    </group>
  );
}
