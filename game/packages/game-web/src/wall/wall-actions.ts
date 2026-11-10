import {
  hangTilt,
  NOTE_STYLE,
  type Note,
  onWall,
  type PlayerState,
  type Thread,
} from '@bunker/shared';
import { newId } from '../canvas/geometry.ts';

type Update = (s: PlayerState) => PlayerState;

const withWall = (s: PlayerState, wall: Partial<PlayerState['wall']>): PlayerState => ({
  ...s,
  wall: { ...s.wall, ...wall },
});

const topZ = (s: PlayerState) => Math.max(0, ...s.wall.items.map((i) => i.z));

/**
 * Повесить или передвинуть вещь: куда отпустили, там и висит (без «магнита», правка автора
 * 09.11); поверх остальных; за край доски не уходит.
 */
export const moveItem =
  (id: string, x: number, y: number): Update =>
  (s) => {
    const z = topZ(s) + 1;
    const rest = s.wall.items.filter((i) => i.id !== id);
    const was = s.wall.items.find((i) => i.id === id);
    return withWall(s, {
      items: [...rest, { id, ...onWall(x, y), z, rot: was?.rot ?? hangTilt(id) }],
    });
  };

/**
 * Выделенные вещи сдвинуть вместе (MS-D): каждая — на (dx, dy), край доски у каждой свой;
 * группа — поверх остальных, порядок внутри группы прежний.
 */
export const moveItems =
  (ids: readonly string[], dx: number, dy: number): Update =>
  (s) => {
    const pick = new Set(ids);
    let z = topZ(s);
    const moved = s.wall.items
      .filter((i) => pick.has(i.id))
      .sort((a, b) => a.z - b.z)
      .map((i) => ({ ...i, ...onWall(i.x + dx, i.y + dy), z: ++z }));
    return withWall(s, { items: [...s.wall.items.filter((i) => !pick.has(i.id)), ...moved] });
  };

/** Новая записка или ярлык — в точке стены, сразу поверх остальных. */
export const addNote =
  (kind: Note['kind'], x: number, y: number, id = `n:${newId()}`): Update =>
  (s) => {
    const note: Note = { id, kind, text: '' };
    const z = topZ(s) + 1;
    return withWall(s, {
      notes: [...s.wall.notes, note],
      items: [
        ...s.wall.items,
        { id, ...onWall(x, y), z, rot: kind === 'label' ? 0 : hangTilt(id) },
      ],
    });
  };

export const editNote =
  (id: string, text: string): Update =>
  (s) =>
    withWall(s, { notes: s.wall.notes.map((n) => (n.id === id ? { ...n, text } : n)) });

/** Размер шрифта и ширина записки или ярлыка — в пределах NOTE_STYLE. */
export const styleNote =
  (id: string, style: { size?: number; width?: number }): Update =>
  (s) =>
    withWall(s, {
      notes: s.wall.notes.map((n) => {
        if (n.id !== id) return n;
        const next = { ...n };
        if (style.size !== undefined)
          next.size = Math.round(
            Math.min(NOTE_STYLE.maxSize, Math.max(NOTE_STYLE.minSize, style.size)),
          );
        if (style.width !== undefined)
          next.width = Math.round(
            Math.min(NOTE_STYLE.maxWidth, Math.max(NOTE_STYLE.minWidth, style.width)),
          );
        return next;
      }),
    });

export interface TakenNote {
  note: Note;
  item: PlayerState['wall']['items'][number];
  threads: Thread[];
}

/** Что заберёт removeNote — чтобы можно было «Вернуть». */
export const takeNote = (id: string, s: PlayerState): TakenNote | null => {
  const note = s.wall.notes.find((n) => n.id === id);
  const item = s.wall.items.find((i) => i.id === id);
  if (!note || !item) return null;
  return { note, item, threads: s.wall.threads.filter((t) => t.from === id || t.to === id) };
};

export const removeNote =
  (id: string): Update =>
  (s) =>
    withWall(s, {
      notes: s.wall.notes.filter((n) => n.id !== id),
      items: s.wall.items.filter((i) => i.id !== id),
      threads: s.wall.threads.filter((t) => t.from !== id && t.to !== id),
    });

export const restoreNote =
  (t: TakenNote): Update =>
  (s) => {
    if (s.wall.notes.some((n) => n.id === t.note.id)) return s;
    const present = new Set([...s.wall.items.map((i) => i.id), t.item.id]);
    return withWall(s, {
      notes: [...s.wall.notes, t.note],
      items: [...s.wall.items, t.item],
      threads: [
        ...s.wall.threads,
        ...t.threads.filter((th) => present.has(th.from) && present.has(th.to)),
      ],
    });
  };

/** Нить между двумя вещами; вторая такая же нить не появляется. */
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

/** Что выбрасывается в корзину (TR-A, решение автора 09.11): только письма-ответы. */
export const isLetter = (id: string) => /^M\d{3}$/.test(id);

/** Письмо, выброшенное в корзину: где висело и какие нити шли к нему — чтобы «Вернуть». */
export interface Binned {
  id: string;
  item: PlayerState['wall']['items'][number] | null;
  threads: Thread[];
}

export const takeLetter = (id: string, s: PlayerState): Binned => ({
  id,
  item: s.wall.items.find((i) => i.id === id) ?? null,
  threads: s.wall.threads.filter((t) => t.from === id || t.to === id),
});

/** В корзину: со стены (вместе с нитями) и из «Входящих»; в деле письмо остаётся. */
export const binLetter =
  (id: string): Update =>
  (s) =>
    !isLetter(id) || s.trash.includes(id)
      ? s
      : {
          ...withWall(s, {
            items: s.wall.items.filter((i) => i.id !== id),
            threads: s.wall.threads.filter((t) => t.from !== id && t.to !== id),
          }),
          trash: [...s.trash, id],
        };

/** «Вернуть» сразу после броска: на прежнее место на стене (с нитями) или во «Входящие». */
export const unbinLetter =
  (b: Binned): Update =>
  (s) => {
    if (!s.trash.includes(b.id)) return s;
    const out = { ...s, trash: s.trash.filter((id) => id !== b.id) };
    if (!b.item || s.wall.items.some((i) => i.id === b.id)) return out;
    const present = new Set([...s.wall.items.map((i) => i.id), b.id]);
    return withWall(out, {
      items: [...s.wall.items, b.item],
      threads: [
        ...s.wall.threads,
        ...b.threads.filter((t) => present.has(t.from) && present.has(t.to)),
      ],
    });
  };

/** Достать из корзины позже — во «Входящие» на столе (TR-A). */
export const takeOutOfBin =
  (id: string): Update =>
  (s) =>
    s.trash.includes(id) ? { ...s, trash: s.trash.filter((x) => x !== id) } : s;
