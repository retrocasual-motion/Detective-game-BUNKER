import { type PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { BOARD_SCALE, type Pose, type Room } from '../room/camera.ts';

/**
 * Прототип 3D-стола: three.js в тех же координатах, что CSS-комната (`room/camera.ts`) — пиксели,
 * 1 м = p; только y у three.js вверх. Камера three.js стоит ровно в позе CSS-камеры, поэтому
 * DOM-доска (наша стена) и 3D-стол совпадают без шва.
 */

/** Точка CSS-мира → three.js. */
export const css3 = (x: number, y: number, z: number) => new Vector3(x, -y, z);

/** Точка стола (метры x, z; h — над столешницей, м) → three.js. */
export const deskPoint = (room: Room, x: number, z: number, h = 0) =>
  new Vector3(x * room.p, -(room.deskY - h * room.p), z * room.p);

/** Поставить камеру three.js в позу CSS-камеры (перспектива p, наклон rx, поворот ry). */
export function syncCamera(cam: PerspectiveCamera, pose: Pose, room: Room) {
  const { p, vp } = room;
  cam.fov = (2 * Math.atan(vp.height / 2 / p) * 180) / Math.PI;
  cam.aspect = vp.width / vp.height;
  cam.near = 5;
  cam.far = 30000;
  cam.position.set(pose.eye[0], -pose.eye[1], pose.eye[2]);
  cam.rotation.set((-pose.rx * Math.PI) / 180, (pose.ry * Math.PI) / 180, 0, 'YXZ');
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}

const ray = new Raycaster();
const ndc = new Vector2();
const hit = new Vector3();

/** Точка экрана → точка на плоскости стола на высоте h (м), в метрах стола; null — мимо. */
export function screenToDesk(
  cam: PerspectiveCamera,
  room: Room,
  sx: number,
  sy: number,
  h = 0,
): { x: number; z: number } | null {
  ndc.set((sx / room.vp.width) * 2 - 1, -(sy / room.vp.height) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  const plane = new Plane(new Vector3(0, 1, 0), room.deskY - h * room.p);
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  return { x: hit.x / room.p, z: hit.z / room.p };
}

/**
 * Точка экрана → точка на плоскости стены (px доски-экрана, как у `boardPoint`), без обрезки
 * краями доски: и для промежутка между столом и доской; null — мимо.
 */
export function screenToWall(
  cam: PerspectiveCamera,
  room: Room,
  sx: number,
  sy: number,
): { x: number; y: number } | null {
  ndc.set((sx / room.vp.width) * 2 - 1, -(sy / room.vp.height) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  if (!ray.ray.intersectPlane(wallPlane, hit)) return null;
  return {
    x: hit.x / BOARD_SCALE + room.vp.width / 2,
    y: -hit.y / BOARD_SCALE + room.vp.height / 2,
  };
}
const wallPlane = new Plane(new Vector3(0, 0, 1), 0);

/** Точка стола → экран (для зоны: видна ли точка в кадре). */
export function deskToScreen(cam: PerspectiveCamera, room: Room, x: number, z: number) {
  const v = deskPoint(room, x, z).project(cam);
  return {
    x: ((v.x + 1) / 2) * room.vp.width,
    y: ((1 - v.y) / 2) * room.vp.height,
    front: v.z < 1,
  };
}

/** Точка на доске (px доски-экрана от левого верхнего угла) → three.js; dz — от стены, px. */
export const boardPoint = (room: Room, bx: number, by: number, dz = 0) =>
  css3((bx - room.vp.width / 2) * BOARD_SCALE, (by - room.vp.height / 2) * BOARD_SCALE, dz);
