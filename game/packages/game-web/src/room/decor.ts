import { faceCenter, type Pose, toCamera, toScreen, type Vec3 } from './camera.ts';

/**
 * Серый декор комнаты (стены, пол, окно, кромка и ножки стола) — рисуется на одном
 * холсте своей проекцией. Большие CSS-плоскости в перспективе браузер дорисовывает
 * кусками, поэтому декор — не DOM. Грани с видами лежат поверх холста.
 */

interface Poly {
  pts: Vec3[];
  color: string;
}

const rect = (c: Vec3, u: Vec3, v: Vec3): Vec3[] => [
  [c[0] - u[0] - v[0], c[1] - u[1] - v[1], c[2] - u[2] - v[2]],
  [c[0] + u[0] - v[0], c[1] + u[1] - v[1], c[2] + u[2] - v[2]],
  [c[0] + u[0] + v[0], c[1] + u[1] + v[1], c[2] + u[2] + v[2]],
  [c[0] - u[0] + v[0], c[1] - u[1] + v[1], c[2] - u[2] + v[2]],
];

/** Порядок — от дальнего к ближнему (художник): пол, стены, окно, ножки, кромка. */
export function roomPolys(
  p: number,
  vp: { width: number; height: number },
  css: CSSStyleDeclaration,
): Poly[] {
  const col = (name: string) => css.getPropertyValue(name).trim() || '#444';
  const front = -1.3 * p;
  const back = 1.8 * p;
  const zc = (front + back) / 2;
  const hz = (back - front) / 2;
  const top = -0.9 * p;
  const floor = 1.4 * p;
  const yc = (top + floor) / 2;
  const hy = (floor - top) / 2;
  const hx = 1.2 * p;
  const desk = faceCenter('desk', p);
  const deskFront = desk[2] + vp.height / 2;
  const hw = vp.width / 2;
  const legTop = desk[1] + 40;
  const leg = (side: number): Poly => ({
    pts: rect(
      [side * (hw - 40), (legTop + floor) / 2, deskFront - 10],
      [15, 0, 0],
      [0, (floor - legTop) / 2, 0],
    ),
    color: col('--color-desk-edge'),
  });
  return [
    { pts: rect([0, floor, zc], [hx, 0, 0], [0, 0, hz]), color: col('--color-room-floor') },
    { pts: rect([-hx, yc, zc], [0, 0, hz], [0, hy, 0]), color: col('--color-room-wall') },
    { pts: rect([hx, yc, zc], [0, 0, hz], [0, hy, 0]), color: col('--color-room-wall') },
    { pts: rect([0, yc, front], [hx, 0, 0], [0, hy, 0]), color: col('--color-room-wall-front') },
    {
      pts: rect([0, 0.05 * p, front + 1], [0.47 * p, 0, 0], [0, 0.32 * p, 0]),
      color: col('--color-room-dark'),
    },
    {
      pts: rect([0, 0.05 * p, front + 2], [0.45 * p, 0, 0], [0, 0.3 * p, 0]),
      color: col('--color-room-window'),
    },
    leg(-1),
    leg(1),
    {
      pts: rect([0, desk[1] + 20, deskFront], [hw, 0, 0], [0, 20, 0]),
      color: col('--color-desk-edge'),
    },
  ];
}

/** Отсечь многоугольник плоскостью z = zMax (всё, что за зрителем, выбрасывается). */
export function clipNear(pts: Vec3[], zMax: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as Vec3;
    const b = pts[(i + 1) % pts.length] as Vec3;
    const aIn = a[2] <= zMax;
    const bIn = b[2] <= zMax;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (zMax - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, zMax]);
    }
  }
  return out;
}

export function drawRoom(
  canvas: HTMLCanvasElement,
  pose: Pose,
  p: number,
  vp: { width: number; height: number },
): void {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(vp.width * dpr);
  const h = Math.round(vp.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(canvas);
  ctx.fillStyle = css.getPropertyValue('--color-room-dark').trim() || '#1f1f1f';
  ctx.fillRect(0, 0, vp.width, vp.height);
  for (const poly of roomPolys(p, vp, css)) {
    const cam = clipNear(
      poly.pts.map((pt) => toCamera(pt, pose, p)),
      p - 1,
    );
    if (cam.length < 3) continue;
    ctx.beginPath();
    cam.forEach((pt, i) => {
      const s = toScreen(pt, p, vp);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
    ctx.fillStyle = poly.color;
    ctx.fill();
  }
}
