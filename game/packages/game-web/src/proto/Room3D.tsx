import { useMemo } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Path, Shape } from 'three';
import type { Room } from '../room/camera.ts';
import { type DeskObject, deskObjects, type Poly, roomPolys } from '../room/decor.ts';
import type { Rect } from './deskWorld.ts';
import { css3 } from './space.ts';

/**
 * Прототип 3D-стола: комната и неподвижные вещи следователя — те же коробки, что рисует игра
 * (`roomPolys`, `deskObjects`), только объёмные, со светом. Задняя стена — с дырой под доску:
 * там просвечивает DOM-стена (наша стена дела).
 */

type Box = DeskObject['boxes'][number];

/** Вещи следователя: не двигаются, бумагу на них не положить. */
const KEEP = new Set([
  'monitor',
  'drive',
  // Клавиатура убрана (автор 23.11: «освободи место слева»).
  'phone',
  'lamp',
  'inbox-back',
  'inbox-front',
  'papers',
]);

export function cssColors() {
  const css = getComputedStyle(document.documentElement);
  return (name: string) => css.getPropertyValue(name).trim() || '#444444';
}

export function fixedObjects(room: Room): DeskObject[] {
  return deskObjects(room, cssColors()).filter((o) => KEEP.has(o.key));
}

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

function PolyMesh({ poly }: { poly: Poly }) {
  const geo = useMemo(() => {
    const g = new BufferGeometry();
    const v = poly.pts.flatMap(([x, y, z]) => css3(x, y, z).toArray());
    g.setAttribute('position', new Float32BufferAttribute(v, 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }, [poly]);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color={poly.color} roughness={0.95} side={DoubleSide} />
    </mesh>
  );
}

/** Задняя стена с дырой под доску: в дыре видна DOM-стена под холстом. */
function BackWall({ poly, room }: { poly: Poly; room: Room }) {
  const shape = useMemo(() => {
    const xs = poly.pts.map((q) => q[0]);
    const ys = poly.pts.map((q) => -q[1]);
    const s = new Shape();
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    s.moveTo(x0, y0);
    s.lineTo(x1, y0);
    s.lineTo(x1, y1);
    s.lineTo(x0, y1);
    s.closePath();
    const hole = new Path();
    const { boardHalfW: w, boardHalfH: h } = room;
    hole.moveTo(-w, -h);
    hole.lineTo(-w, h);
    hole.lineTo(w, h);
    hole.lineTo(w, -h);
    hole.closePath();
    s.holes.push(hole);
    return s;
  }, [poly, room]);
  return (
    <mesh position={[0, 0, -1]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={poly.color} roughness={0.95} />
    </mesh>
  );
}

function BoxMesh({ b }: { b: Box }) {
  const w = b.max[0] - b.min[0];
  const h = b.max[1] - b.min[1];
  const d = b.max[2] - b.min[2];
  const c = css3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  const [px, pz] = b.yaw && b.pivot ? b.pivot : [c.x, c.z];
  const body = (
    <>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={b.color} roughness={0.8} />
      </mesh>
      {b.screen && (
        <mesh position={[0, h * 0.02, d / 2 + 0.6]}>
          <planeGeometry args={[w * 0.93, h * 0.86]} />
          <meshBasicMaterial color={b.screen} />
        </mesh>
      )}
      {b.screenBar && (
        <mesh position={[0, -h * 0.38, d / 2 + 0.8]}>
          <planeGeometry args={[w * 0.93, h * 0.06]} />
          <meshBasicMaterial color={b.screenBar} />
        </mesh>
      )}
    </>
  );
  return (
    <group position={[px, c.y, pz]} rotation={[0, b.yaw ?? 0, 0]}>
      <group position={[c.x - px, 0, c.z - pz]}>{body}</group>
    </group>
  );
}

export function Room3D({ room, objects }: { room: Room; objects: DeskObject[] }) {
  const polys = useMemo(() => roomPolys(room, cssColors()), [room]);
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
      {polys.map((poly, i) =>
        poly.pts.every((q) => q[2] === poly.pts[0]?.[2]) && (poly.pts[0]?.[2] ?? 0) < 0 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: порядок граней комнаты постоянный
          <BackWall key={i} poly={poly} room={room} />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: порядок граней комнаты постоянный
          <PolyMesh key={i} poly={poly} />
        ),
      )}
      {objects.flatMap((o) =>
        // biome-ignore lint/suspicious/noArrayIndexKey: коробки предмета постоянны
        o.boxes.map((b, k) => <BoxMesh key={`${o.key}-${k}`} b={b} />),
      )}
    </group>
  );
}
