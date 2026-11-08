import { type Camera, isOverOwnColumn, type Thread, wallColumns, wallLayout } from '@bunker/shared';
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
import { PIN_Y } from '../canvas/geometry.ts';
import { screenToWorld } from '../canvas/math.ts';
import { useGame } from '../store.ts';
import { type Place, WallCard } from './WallCard.tsx';
import { pinOf, WallThreads } from './WallThreads.tsx';
import {
  addThread,
  labelThread,
  placeOnField,
  removeThread,
  restoreThread,
  returnToColumn,
} from './wall-actions.ts';

/** Двойной щелчок по нити — удалить; одиночный ждёт, не придёт ли второй щелчок. */
const DOUBLE_CLICK_MS = 250;
const UNDO_MS = 5000;
/** Сдвиг мыши, до которого нажатие на кнопку считается щелчком, а не протяжкой. */
const CLICK_SLOP = 4;
/** Поле — выше колонок по порядку наложения. */
const FIELD_Z = 1000;

type Pt = { x: number; y: number };

/**
 * Щелчок, который закончил нить, не должен открыть лист под ним. Глушитель снимается сам
 * сразу после отпускания кнопки — даже если click не пришёл (отпустили за окном).
 */
function swallowNextClick() {
  const swallow = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  const release = () => setTimeout(() => window.removeEventListener('click', swallow, true), 0);
  window.addEventListener('click', swallow, { capture: true, once: true });
  window.addEventListener('pointerup', release, { capture: true, once: true });
}

/** Материал стены под точкой экрана — сквозь нити и подписи поверх листов. */
const wallItemAt = (x: number, y: number): string | null =>
  document
    .elementsFromPoint(x, y)
    .map((el) => el.closest('[data-wall-item]'))
    .find((el) => el !== null)
    ?.getAttribute('data-wall-item') ?? null;

function toWorld(
  e: { clientX: number; clientY: number; target: EventTarget | null },
  camera: Camera,
): Pt {
  const canvas = e.target instanceof Element ? e.target.closest('.canvas') : null;
  const rect = canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top }, camera);
}

/**
 * Стена (WALL-C, решение автора 08.11): пробковая доска. Вверху — колонки «как пришло»
 * (стартовые по описи, затем поступления, IN-B), листы лесенкой. Ниже — поле для своей
 * версии. У материала одно место: потянуть лист из колонки — он переезжает в поле; отпустить
 * у своей колонки или «↩» — возвращается. Нити — от кнопки к кнопке, между любыми листами,
 * в колонке или в поле; щелчок по нити — подпись, двойной — удалить (с «Вернуть»).
 */
export function WallView() {
  const wall = useGame((g) => g.state?.wall);
  const materials = useGame((g) => g.materials);
  const updateState = useGame((g) => g.updateState);
  const openViewer = useGame((g) => g.openViewer);
  const [live, setLive] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [pull, setPull] = useState<{ from: string; to: Pt | null; sticky?: boolean } | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ id: string; at: Pt } | null>(null);
  const [undo, setUndo] = useState<{ thread: Thread; at: Pt } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinDown = useRef<Pt | null>(null);
  const pullRef = useRef(pull);
  pullRef.current = pull;

  const arrivals = wall?.arrivals;
  const layout = useMemo(
    () => wallLayout(wallColumns(materials, arrivals ?? [])),
    [materials, arrivals],
  );

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

  // Нить «двумя щелчками» (UX-J1): после щелчка по кнопке нить идёт за курсором; щелчок по
  // другому листу — привязать, мимо или Esc — отменить. Режим кончается сам при уходе со стены.
  const sticky = pull?.sticky ? pull.from : null;
  const onWall = useGame((g) => g.state?.view === 'wall' && g.viewerId === null && !g.computerOpen);
  useEffect(() => {
    if (!onWall) setPull((p) => (p?.sticky ? null : p));
  }, [onWall]);
  useEffect(() => {
    if (!sticky) return;
    const canvasRect = () =>
      el.current?.querySelector('.canvas')?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const onMove = (e: globalThis.PointerEvent) => {
      const camera = useGame.getState().state?.wall.camera;
      if (!camera) return;
      const r = canvasRect();
      const to = screenToWorld({ x: e.clientX - r.left, y: e.clientY - r.top }, camera);
      setPull((p) => (p ? { ...p, to } : p));
    };
    const onDown = (e: globalThis.PointerEvent) => {
      const top = document.elementFromPoint(e.clientX, e.clientY);
      if (e.button !== 0 || !top || !el.current?.contains(top)) {
        setPull(null);
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      const target = wallItemAt(e.clientX, e.clientY);
      if (target && target !== sticky) updateState(addThread(sticky, target));
      setPull(null);
      swallowNextClick();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPull(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown, { capture: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown, { capture: true });
      window.removeEventListener('keydown', onKey);
    };
  }, [sticky, updateState]);

  const setCamera = useCallback(
    (camera: Camera) => updateState((s) => ({ ...s, wall: { ...s.wall, camera } })),
    [updateState],
  );

  const drop = useCallback(
    (id: string, x: number, y: number) => {
      setLive(null);
      updateState(isOverOwnColumn(layout, id, x, y) ? returnToColumn(id) : placeOnField(id, x, y));
    },
    [layout, updateState],
  );
  const onLive = useCallback(
    (id: string, dx: number, dy: number) => setLive(dx === 0 && dy === 0 ? null : { id, dx, dy }),
    [],
  );
  const onReturn = useCallback((id: string) => updateState(returnToColumn(id)), [updateState]);

  const camera = wall?.camera;
  const pin = useMemo(
    () => ({
      onPointerDown(e: PointerEvent<HTMLElement>, id: string) {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        pinDown.current = { x: e.clientX, y: e.clientY };
        setPull({ from: id, to: null });
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        const cam = useGame.getState().state?.wall.camera;
        if (cam && e.currentTarget.hasPointerCapture(e.pointerId)) {
          const to = toWorld(e, cam);
          setPull((p) => (p ? { ...p, to } : p));
        }
      },
      onPointerUp(e: PointerEvent<HTMLElement>) {
        e.stopPropagation();
        const d = pinDown.current;
        pinDown.current = null;
        if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) <= CLICK_SLOP) {
          setPull((p) => (p ? { ...p, sticky: true } : p));
          return;
        }
        const target = wallItemAt(e.clientX, e.clientY);
        const p = pullRef.current;
        if (p && target && target !== p.from) updateState(addThread(p.from, target));
        setPull(null);
      },
      onPointerCancel() {
        setPull(null);
      },
    }),
    [updateState],
  );

  if (!wall || !camera) return null;

  const byId = new Map(materials.map((m) => [m.id, m]));
  const field = new Map(wall.items.map((i) => [i.materialId, i]));
  const places = new Map<string, Place>();
  for (const [id, slot] of layout.slots) {
    const f = field.get(id);
    places.set(id, f ? { x: f.x, y: f.y, rot: f.rot, z: FIELD_Z + f.z } : slot);
  }
  // Нити идут за листом сразу, пока его тянут.
  const at = new Map<string, Pt>();
  for (const [id, p] of places)
    at.set(id, live?.id === id ? { x: p.x + live.dx, y: p.y + live.dy } : p);
  const pullFrom = pull ? at.get(pull.from) : undefined;
  const editingThread = editing ? wall.threads.find((t) => t.id === editing.id) : undefined;

  const removeWithUndo = (id: string, e: MouseEvent) => {
    const thread = wall.threads.find((t) => t.id === id);
    if (!thread) return;
    updateState(removeThread(id));
    const rect = el.current?.getBoundingClientRect();
    setUndo({ thread, at: { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) } });
  };

  return (
    <div className="wall" data-testid="view-wall" ref={el}>
      <Canvas
        camera={camera}
        onCameraChange={setCamera}
        className="wall-surface"
        bounds={layout.bounds}
        surface={layout.bounds}
      >
        {layout.columns.map((c) => (
          <div
            key={c.key}
            className={`column-label${c.key.startsWith('a') ? ' column-label-arrival' : ''}`}
            data-testid={`column-${c.key}`}
            style={{ translate: `${c.x}px ${c.y}px` }}
          >
            {c.title}
          </div>
        ))}
        {/* След кнопки там, откуда лист сняли в поле: видно, что его место — здесь. */}
        {wall.items.map((i) => {
          const slot = layout.slots.get(i.materialId);
          if (!slot) return null;
          const p = pinOf(slot);
          return (
            <span
              key={`hole-${i.materialId}`}
              className="pin-hole"
              data-testid={`hole-${i.materialId}`}
              style={{ translate: `${p.x}px ${p.y - PIN_Y / 2}px` }}
            />
          );
        })}
        {[...places].map(([id, place]) => {
          const material = byId.get(id);
          return material ? (
            <WallCard
              key={id}
              material={material}
              place={place}
              onField={field.has(id)}
              zoom={camera.zoom}
              onOpen={openViewer}
              onDrop={drop}
              onLive={onLive}
              onReturn={onReturn}
              pin={pin}
            />
          ) : null;
        })}
        <WallThreads
          at={at}
          threads={wall.threads}
          pulling={pullFrom && pull?.to ? { from: pinOf(pullFrom), to: pull.to } : null}
          onThreadClick={(id, e) => {
            const p = toWorld(e, camera);
            if (clickTimer.current) clearTimeout(clickTimer.current);
            clickTimer.current = setTimeout(() => setEditing({ id, at: p }), DOUBLE_CLICK_MS);
          }}
          onLabelClick={(id, e) => {
            if (clickTimer.current) clearTimeout(clickTimer.current);
            clickTimer.current = null;
            setEditing({ id, at: toWorld(e, camera) });
          }}
          onThreadDoubleClick={(id, e) => {
            if (clickTimer.current) clearTimeout(clickTimer.current);
            clickTimer.current = null;
            setEditing(null);
            removeWithUndo(id, e);
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
          Нить удалена
          <button
            type="button"
            onClick={() => {
              updateState(restoreThread(undo.thread));
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
