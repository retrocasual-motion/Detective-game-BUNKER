import { describe, expect, it } from 'vitest';
import { nearRefOf, roomFor, toCamera, toScreen } from './camera.ts';

const nearY = (vp: { width: number; height: number }, z: number) => {
  const r = roomFor(vp);
  return toScreen(toCamera([0, r.deskY, z * r.p], r.poses.desk, r.p), r.p, vp).y;
};

describe('RS-B: ближний край стола, видный при 16 : 9, в кадре при любой форме окна (автор 27.11)', () => {
  it('16 : 9 — поза прежняя; ниже окно — камера дальше, край в кадре', () => {
    const ref = roomFor({ width: 1600, height: 900 });
    const big = roomFor({ width: 1920, height: 1080 });
    expect(big.poses.desk.eye[2] / big.p).toBeCloseTo(ref.poses.desk.eye[2] / ref.p, 3);
    // Край, видный внизу при 16 : 9.
    const z = nearRefOf();
    expect(nearY({ width: 1600, height: 900 }, z)).toBeLessThanOrEqual(900);
    for (const vp of [
      { width: 1920, height: 900 },
      { width: 1920, height: 800 },
      { width: 2560, height: 1080 },
      { width: 1366, height: 600 },
    ]) {
      expect(nearY(vp, z)).toBeLessThanOrEqual(vp.height);
      expect(roomFor(vp).poses.desk.eye[2] / roomFor(vp).p).toBeGreaterThan(
        ref.poses.desk.eye[2] / ref.p,
      );
    }
    // Выше окно (16 : 10) — не трогаем.
    const tall = roomFor({ width: 1440, height: 900 });
    expect(tall.poses.desk.eye[2] / tall.p).toBeCloseTo(ref.poses.desk.eye[2] / ref.p, 3);
  });
});
