import { Vector3 } from 'three';

/**
 * Шаг приближения к точке под курсором (этап 4a): камера смотрит прямо (−z) и едет по лучу
 * к точке p на плоскости вещи (z = 0) — точка остаётся под курсором, ближе становится именно
 * она, а не середина. factor > 1 — ближе, < 1 — дальше. Совсем далеко — камера по центру.
 */
export function zoomStep(
  cam: Vector3,
  p: Vector3,
  factor: number,
  limits: { minZ: number; maxZ: number; half: [number, number] },
): Vector3 {
  const next = p.clone().add(cam.clone().sub(p).divideScalar(factor));
  if (next.z >= limits.maxZ - 1e-3) return new Vector3(0, 0, limits.maxZ);
  if (next.z < limits.minZ)
    next.copy(
      p.clone().add(
        cam
          .clone()
          .sub(p)
          .multiplyScalar(limits.minZ / cam.z),
      ),
    );
  next.x = Math.max(-limits.half[0], Math.min(limits.half[0], next.x));
  next.y = Math.max(-limits.half[1], Math.min(limits.half[1], next.y));
  return next;
}
