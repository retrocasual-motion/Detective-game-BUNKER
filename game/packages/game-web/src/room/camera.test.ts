import { describe, expect, it } from 'vitest';
import { BOARD_SCALE, lerpPose, roomFor, toCamera, toScreen, type Vec3 } from './camera.ts';

describe('камера комнаты', () => {
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 1024 },
  ]) {
    const r = roomFor(vp);
    const at = (v: Vec3, pose = r.poses.wall) => toScreen(toCamera(v, pose, r.p), r.p, vp);

    it(`${vp.width}×${vp.height}: в позе «Стена» углы доски — ровно углы экрана`, () => {
      const s = BOARD_SCALE;
      const tl = at([(-vp.width / 2) * s, (-vp.height / 2) * s, 0]);
      const br = at([(vp.width / 2) * s, (vp.height / 2) * s, 0]);
      expect(tl.x).toBeCloseTo(0, 3);
      expect(tl.y).toBeCloseTo(0, 3);
      expect(br.x).toBeCloseTo(vp.width, 3);
      expect(br.y).toBeCloseTo(vp.height, 3);
    });

    it(`${vp.width}×${vp.height}: за столом доска видна целиком вверху, стол — внизу`, () => {
      const d = r.poses.desk;
      const top = at([0, -r.boardHalfH, 0], d);
      const bottom = at([0, r.boardHalfH, 0], d);
      const deskFar = at([0, r.deskY, 0], d);
      expect(top.y).toBeGreaterThan(0);
      expect(top.y).toBeLessThan(vp.height * 0.12);
      expect(bottom.y).toBeLessThan(vp.height * 0.65);
      expect(deskFar.y).toBeGreaterThan(bottom.y);
      expect(deskFar.y).toBeLessThan(vp.height);
      const left = at([-r.boardHalfW, 0, 0], d);
      expect(left.x).toBeGreaterThan(0);
    });
  }

  it('промежуточная поза: t = 0 и t = 1 — концы пути', () => {
    const r = roomFor({ width: 1366, height: 768 });
    expect(lerpPose(r.poses.desk, r.poses.wall, 0)).toEqual(r.poses.desk);
    expect(lerpPose(r.poses.desk, r.poses.wall, 1)).toEqual(r.poses.wall);
  });
});
