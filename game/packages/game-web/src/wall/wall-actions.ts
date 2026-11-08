import { hangTilt, type PlayerState, type Thread } from '@bunker/shared';
import { newId } from '../canvas/geometry.ts';

type Update = (s: PlayerState) => PlayerState;

const withWall = (s: PlayerState, wall: Partial<PlayerState['wall']>): PlayerState => ({
  ...s,
  wall: { ...s.wall, ...wall },
});

const topZ = (s: PlayerState) => Math.max(0, ...s.wall.items.map((i) => i.z));

/** Снять лист из колонки в поле (или передвинуть в поле): ложится поверх остальных. */
export const placeOnField =
  (materialId: string, x: number, y: number): Update =>
  (s) => {
    const z = topZ(s) + 1;
    const rest = s.wall.items.filter((i) => i.materialId !== materialId);
    return withWall(s, {
      items: [...rest, { materialId, x, y, z, rot: hangTilt(materialId) }],
    });
  };

/** Вернуть лист на своё место в колонке «как пришло». Нити остаются. */
export const returnToColumn =
  (materialId: string): Update =>
  (s) =>
    withWall(s, { items: s.wall.items.filter((i) => i.materialId !== materialId) });

/** Нить между двумя материалами; вторая такая же нить не появляется. */
export const addThread =
  (from: string, to: string): Update =>
  (s) => {
    if (from === to) return s;
    const dup = s.wall.threads.some(
      (t) => (t.from === from && t.to === to) || (t.from === to && t.to === from),
    );
    if (dup) return s;
    const thread: Thread = { id: newId(), from, to, label: '' };
    return withWall(s, { threads: [...s.wall.threads, thread] });
  };

export const labelThread =
  (id: string, label: string): Update =>
  (s) =>
    withWall(s, { threads: s.wall.threads.map((t) => (t.id === id ? { ...t, label } : t)) });

export const removeThread =
  (id: string): Update =>
  (s) =>
    withWall(s, { threads: s.wall.threads.filter((t) => t.id !== id) });

/** «Вернуть» удалённую нить (UN-1). */
export const restoreThread =
  (thread: Thread): Update =>
  (s) =>
    s.wall.threads.some((t) => t.id === thread.id)
      ? s
      : withWall(s, { threads: [...s.wall.threads, thread] });
