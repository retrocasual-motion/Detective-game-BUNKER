import type { BoardItem, Camera, Material } from '@bunker/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '../canvas/Canvas.tsx';
import { CARD_W, PIN_Y } from '../canvas/geometry.ts';
import { useDraggable } from '../canvas/useDraggable.ts';
import { useGame } from '../store.ts';
import { BoardThreads } from './BoardThreads.tsx';
import { addThread, labelThread, moveBoardItem, removeFromBoard } from './board-actions.ts';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(t.tagName);

interface BoardCardProps {
  item: BoardItem;
  material: Material;
  zoom: number;
  selected: boolean;
  pending: boolean;
  onPick(id: string): void;
  onMove(id: string, x: number, y: number): void;
}

function BoardCard({ item, material, zoom, selected, pending, onPick, onMove }: BoardCardProps) {
  const drag = useDraggable(zoom, (dx, dy) => onMove(item.id, item.x + dx, item.y + dy));
  const x = item.x + (drag.offset?.x ?? 0);
  const y = item.y + (drag.offset?.y ?? 0);
  const cls = [
    'card',
    selected && 'card-selected',
    pending && 'card-pending',
    drag.offset && 'card-dragging',
  ];
  return (
    <button
      type="button"
      aria-label={`${material.id}. ${material.title}`}
      className={cls.filter(Boolean).join(' ')}
      data-testid={`board-item-${item.id}`}
      style={{ transform: `translate(${x}px, ${y}px)` }}
      onClick={() => {
        if (!drag.wasDragged()) onPick(item.id);
      }}
      {...drag.handlers}
    >
      <span className="card-id">{material.id}</span>
      <span className="card-title">{material.title}</span>
    </button>
  );
}

/** Доска (вид «Справа», TECH_PLAN 4.2): копии материалов, нити и подписи без проверки. */
export function BoardView() {
  const board = useGame((g) => g.state?.board);
  const materials = useGame((g) => g.materials);
  const updateState = useGame((g) => g.updateState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threadMode, setThreadMode] = useState(false);
  const [threadFrom, setThreadFrom] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  const setCamera = useCallback(
    (camera: Camera) => updateState((s) => ({ ...s, board: { ...s.board, camera } })),
    [updateState],
  );
  const move = useCallback(
    (id: string, x: number, y: number) => updateState(moveBoardItem(id, x, y)),
    [updateState],
  );

  const pick = (id: string) => {
    if (!threadMode) return setSelectedId(id);
    if (!threadFrom) return setThreadFrom(id);
    if (threadFrom !== id) updateState(addThread(threadFrom, id));
    setThreadFrom(null);
    setThreadMode(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || !selectedId || isTyping(e.target))
        return;
      // Под открытым окном (просмотрщик, папка) доска не видна — ничего не удаляем.
      const g = useGame.getState();
      if (g.viewerId || g.petitionOpen) return;
      updateState(removeFromBoard(selectedId));
      setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, updateState]);

  if (!board) return null;

  const editing = board.threads.find((t) => t.id === editingId);
  const editPos = (() => {
    if (!editing) return null;
    const a = board.items.find((i) => i.id === editing.from);
    const b = board.items.find((i) => i.id === editing.to);
    if (!a || !b) return null;
    return { x: (a.x + b.x + CARD_W) / 2, y: (a.y + b.y) / 2 + PIN_Y };
  })();

  return (
    <div className="board" data-testid="view-right">
      <div className="board-toolbar">
        <button
          type="button"
          data-testid="thread-mode"
          aria-pressed={threadMode}
          onClick={() => {
            setThreadMode((m) => !m);
            setThreadFrom(null);
          }}
        >
          {threadMode
            ? threadFrom
              ? 'Нить: выберите вторую копию'
              : 'Нить: выберите первую копию'
            : 'Нить'}
        </button>
      </div>
      <Canvas
        camera={board.camera}
        onCameraChange={setCamera}
        className="board-surface"
        onBackgroundClick={() => setSelectedId(null)}
      >
        {board.items.map((item) => {
          const material = byId.get(item.materialId);
          return material ? (
            <BoardCard
              key={item.id}
              item={item}
              material={material}
              zoom={board.camera.zoom}
              selected={item.id === selectedId}
              pending={item.id === threadFrom}
              onPick={pick}
              onMove={move}
            />
          ) : null;
        })}
        {/* Нити — поверх копий, как настоящая нить поверх бумаги. */}
        <BoardThreads
          items={board.items}
          threads={board.threads}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onEditLabel={setEditingId}
        />
        {editing && editPos && (
          <input
            className="thread-label-input"
            data-testid="thread-label-input"
            aria-label="Подпись нити"
            defaultValue={editing.label}
            maxLength={200}
            // biome-ignore lint/a11y/noAutofocus: поле появляется по двойному клику — фокус ожидаем
            autoFocus
            style={{ transform: `translate(${editPos.x}px, ${editPos.y}px)` }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateState(labelThread(editing.id, e.currentTarget.value.trim()));
                setEditingId(null);
              }
              if (e.key === 'Escape') setEditingId(null);
            }}
            onBlur={(e) => {
              updateState(labelThread(editing.id, e.currentTarget.value.trim()));
              setEditingId(null);
            }}
          />
        )}
      </Canvas>
    </div>
  );
}
