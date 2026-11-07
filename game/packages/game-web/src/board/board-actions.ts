import type { BoardItem, BoardThread, PlayerState } from '@bunker/shared';
import { CARD_H, CARD_W, newId } from '../canvas/geometry.ts';
import { screenToWorld } from '../canvas/math.ts';

type Update = (s: PlayerState) => PlayerState;

const withBoard = (s: PlayerState, board: Partial<PlayerState['board']>): PlayerState => ({
  ...s,
  board: { ...s.board, ...board },
});

const PIN_COLS = 5;
const PIN_ROWS = 3;
const GAP = 20;

/** Копия материала — в обзор доски, рядком (5 × 3 ячейки вокруг центра), чтобы копии не легли стопкой. */
export const pinToBoard =
  (materialId: string, viewport: { width: number; height: number }): Update =>
  (s) => {
    const c = screenToWorld({ x: viewport.width / 2, y: viewport.height / 2 }, s.board.camera);
    const n = s.board.items.length;
    const col = n % PIN_COLS;
    const row = Math.floor(n / PIN_COLS) % PIN_ROWS;
    const item: BoardItem = {
      id: newId(),
      materialId,
      x: c.x - (PIN_COLS * (CARD_W + GAP)) / 2 + col * (CARD_W + GAP),
      y: c.y - (PIN_ROWS * (CARD_H + GAP)) / 2 + row * (CARD_H + GAP),
    };
    return withBoard(s, { items: [...s.board.items, item] });
  };

export const moveBoardItem =
  (id: string, x: number, y: number): Update =>
  (s) =>
    withBoard(s, { items: s.board.items.map((i) => (i.id === id ? { ...i, x, y } : i)) });

export const addThread =
  (from: string, to: string): Update =>
  (s) => {
    const thread: BoardThread = { id: newId(), from, to, label: '' };
    return withBoard(s, { threads: [...s.board.threads, thread] });
  };

export const labelThread =
  (id: string, label: string): Update =>
  (s) =>
    withBoard(s, { threads: s.board.threads.map((t) => (t.id === id ? { ...t, label } : t)) });

/** Удалить копию вместе с её нитями или одну нить. */
export const removeFromBoard =
  (id: string): Update =>
  (s) =>
    withBoard(s, {
      items: s.board.items.filter((i) => i.id !== id),
      threads: s.board.threads.filter((t) => t.id !== id && t.from !== id && t.to !== id),
    });

export interface Taken {
  items: BoardItem[];
  threads: BoardThread[];
}

/** Что заберёт removeFromBoard(id) — чтобы можно было «Вернуть». */
export const takeFromBoard = (id: string, s: PlayerState): Taken => ({
  items: s.board.items.filter((i) => i.id === id),
  threads: s.board.threads.filter((t) => t.id === id || t.from === id || t.to === id),
});

/** Вернуть забранное. Нить возвращается, только если обе её копии на доске; дубли не появляются. */
export const restoreToBoard =
  (taken: Taken): Update =>
  (s) => {
    const itemIds = new Set(s.board.items.map((i) => i.id));
    const items = [...s.board.items, ...taken.items.filter((i) => !itemIds.has(i.id))];
    const present = new Set(items.map((i) => i.id));
    const threadIds = new Set(s.board.threads.map((t) => t.id));
    const threads = [
      ...s.board.threads,
      ...taken.threads.filter(
        (t) => !threadIds.has(t.id) && present.has(t.from) && present.has(t.to),
      ),
    ];
    return withBoard(s, { items, threads });
  };
