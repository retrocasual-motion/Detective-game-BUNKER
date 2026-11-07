import type { BoardItem, Camera, Material } from '@bunker/shared';
import {
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas } from '../canvas/Canvas.tsx';
import { screenToWorld } from '../canvas/math.ts';
import { useDraggable } from '../canvas/useDraggable.ts';
import { useGame } from '../store.ts';
import { BoardThreads, pinOf } from './BoardThreads.tsx';
import {
  addThread,
  labelThread,
  moveBoardItem,
  removeFromBoard,
  restoreToBoard,
  type Taken,
  takeFromBoard,
} from './board-actions.ts';

/** Двойной щелчок по нити — удалить; одиночный ждёт, не придёт ли второй щелчок. */
const DOUBLE_CLICK_MS = 250;
const UNDO_MS = 5000;

type Pt = { x: number; y: number };

/** Точка экрана → мир доски (в покое доска лежит плоско — координаты экрана честные). */
function toWorld(
  e: { clientX: number; clientY: number; target: EventTarget | null },
  camera: Camera,
): Pt {
  const canvas = e.target instanceof Element ? e.target.closest('.canvas') : null;
  const rect = canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top }, camera);
}

interface BoardCardProps {
  item: BoardItem;
  material: Material;
  camera: Camera;
  onOpen(materialId: string): void;
  onMove(id: string, x: number, y: number): void;
  onLive(id: string, dx: number, dy: number): void;
  onPullStart(id: string): void;
  onPull(p: Pt): void;
  onPullEnd(targetId: string | null): void;
  onRemove(id: string, e: MouseEvent): void;
}

function BoardCard(props: BoardCardProps) {
  const { item, material, camera } = props;
  const drag = useDraggable({
    zoom: camera.zoom,
    onDrop: (dx, dy) => props.onMove(item.id, item.x + dx, item.y + dy),
    onMove: (dx, dy) => props.onLive(item.id, dx, dy),
  });
  const x = item.x + (drag.offset?.x ?? 0);
  const y = item.y + (drag.offset?.y ?? 0);

  const pullHandlers = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      props.onPullStart(item.id);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) props.onPull(toWorld(e, camera));
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      e.stopPropagation();
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-board-item]');
      props.onPullEnd(under?.getAttribute('data-board-item') ?? null);
    },
    onPointerCancel() {
      props.onPullEnd(null);
    },
  };

  return (
    <div
      className={`card board-card${drag.offset ? ' card-dragging' : ''}`}
      data-testid={`board-item-${item.id}`}
      data-board-item={item.id}
      style={{ translate: `${x}px ${y}px` }}
    >
      <button
        type="button"
        className="board-card-body"
        aria-label={`${material.id}. ${material.title}`}
        onClick={() => {
          if (!drag.wasDragged()) props.onOpen(material.id);
        }}
        {...drag.handlers}
      >
        <span className="card-id">{material.id}</span>
        <span className="card-title">{material.title}</span>
      </button>
      <button
        type="button"
        className="board-pin"
        data-testid={`board-pin-${item.id}`}
        aria-label="Тянуть нить от булавки"
        title="Потяните к другой копии — получится нить"
        {...pullHandlers}
      />
      <button
        type="button"
        className="board-remove"
        data-testid={`board-remove-${item.id}`}
        aria-label="Снять с доски"
        title="Снять с доски"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => props.onRemove(item.id, e)}
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Доска (вид «Справа», TECH_PLAN 4.2; TH-B): копии, нити от булавки к булавке, подписи.
 * Щелчок по копии — открыть; булавку потянуть к другой копии — нить; ✕ — снять копию;
 * щелчок по нити — подпись; двойной щелчок — удалить. Удалённое можно «Вернуть».
 */
export function BoardView() {
  const board = useGame((g) => g.state?.board);
  const materials = useGame((g) => g.materials);
  const updateState = useGame((g) => g.updateState);
  const openViewer = useGame((g) => g.openViewer);
  const [live, setLive] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [pull, setPull] = useState<{ from: string; to: Pt | null } | null>(null);
  const [editing, setEditing] = useState<{ id: string; at: Pt } | null>(null);
  const [undo, setUndo] = useState<{ taken: Taken; text: string; at: Pt } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    },
    [],
  );

  const setCamera = useCallback(
    (camera: Camera) => updateState((s) => ({ ...s, board: { ...s.board, camera } })),
    [updateState],
  );

  if (!board) return null;

  const remove = (id: string, text: string, e: MouseEvent) => {
    const s = useGame.getState().state;
    if (!s) return;
    const taken = takeFromBoard(id, s);
    updateState(removeFromBoard(id));
    const rect = (e.currentTarget as Element).closest('.board')?.getBoundingClientRect();
    setUndo({
      taken,
      text,
      at: { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) },
    });
  };

  // Нити идут за копией сразу, пока её тянут.
  const items = live
    ? board.items.map((i) => (i.id === live.id ? { ...i, x: i.x + live.dx, y: i.y + live.dy } : i))
    : board.items;
  const pullFrom = pull ? items.find((i) => i.id === pull.from) : undefined;
  const editingThread = editing ? board.threads.find((t) => t.id === editing.id) : undefined;

  return (
    <div className="board" data-testid="view-right">
      <Canvas camera={board.camera} onCameraChange={setCamera} className="board-surface">
        {board.items.map((item) => {
          const material = byId.get(item.materialId);
          return material ? (
            <BoardCard
              key={item.id}
              item={item}
              material={material}
              camera={board.camera}
              onOpen={openViewer}
              onMove={(id, x, y) => {
                setLive(null);
                updateState(moveBoardItem(id, x, y));
              }}
              onLive={(id, dx, dy) => setLive(dx === 0 && dy === 0 ? null : { id, dx, dy })}
              onPullStart={(id) => setPull({ from: id, to: null })}
              onPull={(to) => setPull((p) => (p ? { ...p, to } : p))}
              onPullEnd={(target) => {
                if (pull && target && target !== pull.from)
                  updateState(addThread(pull.from, target));
                setPull(null);
              }}
              onRemove={(id, e) => remove(id, 'Копия снята с доски', e)}
            />
          ) : null;
        })}
        {/* Нити — поверх копий, как настоящая нить поверх бумаги. */}
        <BoardThreads
          items={items}
          threads={board.threads}
          pulling={pullFrom && pull?.to ? { from: pinOf(pullFrom), to: pull.to } : null}
          onThreadClick={(id, e) => {
            const at = toWorld(e, board.camera);
            if (clickTimer.current) clearTimeout(clickTimer.current);
            clickTimer.current = setTimeout(() => setEditing({ id, at }), DOUBLE_CLICK_MS);
          }}
          onThreadDoubleClick={(id, e) => {
            if (clickTimer.current) clearTimeout(clickTimer.current);
            clickTimer.current = null;
            setEditing(null);
            remove(id, 'Нить удалена', e);
          }}
        />
        {editing && editingThread && (
          <input
            className="thread-label-input"
            data-testid="thread-label-input"
            aria-label="Подпись нити"
            defaultValue={editingThread.label}
            maxLength={200}
            // biome-ignore lint/a11y/noAutofocus: поле появляется по щелчку на нити — фокус ожидаем
            autoFocus
            style={{ translate: `${editing.at.x}px ${editing.at.y}px` }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateState(labelThread(editingThread.id, e.currentTarget.value.trim()));
                setEditing(null);
              }
              if (e.key === 'Escape') setEditing(null);
            }}
            onBlur={(e) => {
              updateState(labelThread(editingThread.id, e.currentTarget.value.trim()));
              setEditing(null);
            }}
          />
        )}
      </Canvas>
      {undo && (
        <div
          className="undo-toast"
          data-testid="undo-toast"
          style={{ left: undo.at.x, top: undo.at.y }}
        >
          {undo.text}
          <button
            type="button"
            onClick={() => {
              updateState(restoreToBoard(undo.taken));
              setUndo(null);
            }}
          >
            Вернуть
          </button>
        </div>
      )}
    </div>
  );
}
