import {
  type Camera,
  NOTE_STYLE,
  type Note,
  PERSONS,
  type Thread,
  WALL_BOUNDS,
  type WallItem,
} from '@bunker/shared';
import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas } from '../canvas/Canvas.tsx';
import { startGhostDrag } from '../canvas/ghostDrag.ts';
import { screenToWorld } from '../canvas/math.ts';
import { wholeCard } from '../petition/drafts.ts';
import { petitionFieldAt } from '../petition/fieldAt.ts';
import { usePetition } from '../petition/petition-store.ts';
import { useGame } from '../store.ts';
import { isItemCard, type PinHandlers, WallCard } from './WallCard.tsx';
import { type At, pinOf, WallThreads } from './WallThreads.tsx';
import {
  addNote,
  addThread,
  editNote,
  labelThread,
  moveItem,
  removeNote,
  removeThread,
  restoreNote,
  restoreThread,
  styleNote,
  type TakenNote,
  takeNote,
} from './wall-actions.ts';

/** Двойной щелчок по нити — удалить; одиночный ждёт, не придёт ли второй щелчок. */
const DOUBLE_CLICK_MS = 250;
const UNDO_MS = 5000;
/** Сдвиг мыши, до которого нажатие на кнопку считается щелчком, а не протяжкой. */
const CLICK_SLOP = 4;

type Pt = { x: number; y: number };
type Undo = { text: string; at: Pt; restore(): void };

/**
 * Щелчок, который закончил нить, не должен открыть вещь под ним. Глушитель снимается сам
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

/** Вещь стены под точкой экрана — сквозь нити и подписи поверх листов. */
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

const personById = new Map(PERSONS.map((p) => [p.id, p]));

/** Поле ввода записки или ярлыка: сохраняет при уходе фокуса; Esc — тоже; у ярлыка — Enter. */
function NoteEditor({
  note,
  size,
  onDone,
}: {
  note: Note;
  size: number;
  onDone(text: string): void;
}) {
  return (
    <textarea
      className="note-input"
      style={{ fontSize: size }}
      data-testid={`note-input-${note.id}`}
      aria-label={note.kind === 'label' ? 'Ярлык' : 'Записка'}
      defaultValue={note.text}
      maxLength={500}
      // biome-ignore lint/a11y/noAutofocus: поле появляется по щелчку на записке — фокус ожидаем
      autoFocus
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && note.kind === 'label')) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => onDone(e.currentTarget.value.trim())}
    />
  );
}

/**
 * Стена (WALL-C; правки автора 09.11): пробковая доска, всё висит свободно — персонажи,
 * материалы дела, записки и ярлыки игрока. Куда отпустили, там и висит (без «магнита»).
 * Нити — от кнопки к кнопке между любыми вещами; щелчок по нити — подпись, двойной —
 * удалить (с «Вернуть»). Внизу справа — чистые карточки: «Записка» и «Ярлык».
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
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinDown = useRef<Pt | null>(null);
  const pullRef = useRef(pull);
  pullRef.current = pull;

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
  // другой вещи — привязать, мимо или Esc — отменить. Режим кончается сам при уходе со стены.
  const sticky = pull?.sticky ? pull.from : null;
  const onWallView = useGame(
    (g) => g.state?.view === 'wall' && g.viewerId === null && !g.computerOpen,
  );
  useEffect(() => {
    if (!onWallView) setPull((p) => (p?.sticky ? null : p));
  }, [onWallView]);
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
    (id: string, x: number, y: number, at: { x: number; y: number }) => {
      setLive(null);
      // Лист отпустили на поле открытой папки — карточка «материал целиком» (K-A), лист
      // остаётся на стене, где висел.
      const f = petitionFieldAt(at.x, at.y);
      const m = useGame.getState().materials.find((mm) => mm.id === id);
      if (f && f !== 'to' && m) {
        usePetition.getState().setActiveField(f);
        usePetition.getState().addCard(wholeCard(m));
        return;
      }
      updateState(moveItem(id, x, y));
    },
    [updateState],
  );
  const onLive = useCallback(
    (id: string, dx: number, dy: number) => setLive(dx === 0 && dy === 0 ? null : { id, dx, dy }),
    [],
  );
  const activate = useCallback(
    (id: string) => {
      if (id.startsWith('n:')) setEditingNote(id);
      else openViewer(id);
    },
    [openViewer],
  );

  const pin: PinHandlers = useMemo(
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

  const showUndo = (text: string, e: MouseEvent, restore: () => void) => {
    const rect = el.current?.getBoundingClientRect();
    setUndo({
      text,
      restore,
      at: { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) },
    });
  };

  const deleteNote = useCallback(
    (id: string) => {
      const s = useGame.getState().state;
      const taken: TakenNote | null = s ? takeNote(id, s) : null;
      if (!taken) return;
      updateState(removeNote(id));
      const box = document
        .querySelector(`[data-wall-item="${CSS.escape(id)}"]`)
        ?.getBoundingClientRect();
      const rect = el.current?.getBoundingClientRect();
      setUndo({
        text: 'Записка снята',
        restore: () => updateState(restoreNote(taken)),
        at: { x: (box?.left ?? 0) - (rect?.left ?? 0), y: (box?.top ?? 0) - (rect?.top ?? 0) },
      });
    },
    [updateState],
  );

  const camera = wall?.camera;
  if (!wall || !camera) return null;

  const byId = new Map(materials.map((m) => [m.id, m]));
  const notes = new Map(wall.notes.map((n) => [n.id, n]));
  // Нити идут за вещью сразу, пока её тянут.
  const at = new Map<string, At>();
  for (const i of wall.items) {
    const n = notes.get(i.id);
    const w = n ? (n.width ?? NOTE_STYLE[n.kind].width) : undefined;
    at.set(i.id, live?.id === i.id ? { x: i.x + live.dx, y: i.y + live.dy, w } : { ...i, w });
  }
  const pullFrom = pull ? at.get(pull.from) : undefined;
  const editingThread = editing ? wall.threads.find((t) => t.id === editing.id) : undefined;

  /** Новая записка или ярлык: кнопка вещи — под точкой (x, y) стены; сразу правится. */
  const newNoteAt = (kind: Note['kind'], x: number, y: number) => {
    const id = `n:${crypto.randomUUID()}`;
    updateState(addNote(kind, x - NOTE_STYLE[kind].width / 2, y - 12, id));
    setEditingNote(id);
  };
  const newNote = (kind: Note['kind']) => {
    const r = el.current?.getBoundingClientRect();
    const c = screenToWorld({ x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 }, camera);
    const jitter = (wall.notes.length % 5) * 24;
    newNoteAt(kind, c.x + jitter, c.y - 80 + jitter);
  };
  /** Карточку можно взять и отпустить на доске — как в Miro; щелчок — в середину видимой стены. */
  const overWall = (pt: { x: number; y: number }) => {
    const top = document.elementFromPoint(pt.x, pt.y);
    return !!top?.closest('.wall .canvas');
  };
  const blankDown = (kind: Note['kind']) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    startGhostDrag(e.nativeEvent, {
      label: kind === 'label' ? 'Ярлык' : 'Записка',
      className: `drag-ghost-${kind}`,
      canDrop: overWall,
      onDrop: (pt) => {
        const r = el.current?.querySelector('.canvas')?.getBoundingClientRect();
        const cam = useGame.getState().state?.wall.camera;
        if (!r || !cam) return;
        const w = screenToWorld({ x: pt.x - r.left, y: pt.y - r.top }, cam);
        newNoteAt(kind, w.x, w.y);
      },
      onClick: () => newNote(kind),
    });
  };

  const render = (item: WallItem) => {
    const m = byId.get(item.id);
    const person = personById.get(item.id);
    const note = notes.get(item.id);
    let kind: string;
    let label: string;
    let content: ReactNode;
    let size: number | undefined;
    let width: number | undefined;
    let toolbar: ReactNode = null;
    if (m) {
      const isItem = isItemCard(m);
      kind = isItem ? 'item' : m.kind;
      label = `${m.id}. ${m.title}`;
      content = isItem ? (
        <>
          <span className="card-id">Изъято · {m.id}</span>
          <span className="card-title">{m.title}</span>
          <span className={`item-photo item-photo-${m.id}`} aria-hidden />
        </>
      ) : (
        <>
          <span className="card-id">{m.id}</span>
          <span className="card-title">{m.title}</span>
          {m.kind === 'disc' && <span className="paper-disc-window" aria-hidden />}
        </>
      );
    } else if (person) {
      kind = 'person';
      label = person.name;
      content = (
        <>
          <span className="person-photo" aria-hidden />
          <span className="person-name">{person.name}</span>
          <span className="person-role">{person.role}</span>
        </>
      );
    } else if (note) {
      kind = note.kind;
      size = note.size ?? NOTE_STYLE[note.kind].size;
      width = note.width ?? NOTE_STYLE[note.kind].width;
      if (editingNote === note.id) {
        const id = note.id;
        const step = (d: number) => () => updateState(styleNote(id, { size: (size ?? 16) + d }));
        toolbar = (
          // Кнопки не забирают фокус у поля ввода: правка продолжается.
          <div
            className="note-toolbar"
            role="toolbar"
            aria-label="Шрифт"
            data-testid="note-toolbar"
            style={{ scale: 1 / camera.zoom }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              type="button"
              aria-label="Шрифт меньше"
              data-testid="font-down"
              onClick={step(-2)}
            >
              A−
            </button>
            <span className="note-toolbar-size" data-testid="font-size">
              {size}
            </span>
            <button type="button" aria-label="Шрифт больше" data-testid="font-up" onClick={step(2)}>
              A+
            </button>
          </div>
        );
      }
      label = note.kind === 'label' ? `Ярлык: ${note.text}` : `Записка: ${note.text}`;
      content =
        editingNote === note.id ? (
          <NoteEditor
            note={note}
            size={size}
            onDone={(text) => {
              updateState(editNote(note.id, text));
              setEditingNote(null);
            }}
          />
        ) : (
          <span className="note-text" style={{ fontSize: size }}>
            {note.text}
          </span>
        );
    } else {
      return null;
    }
    return (
      <WallCard
        key={item.id}
        id={item.id}
        place={item}
        zoom={camera.zoom}
        kind={kind}
        label={label}
        onActivate={activate}
        onDrop={drop}
        onLive={onLive}
        pin={pin}
        onDelete={note ? deleteNote : undefined}
        editing={editingNote === item.id}
        width={width}
        onResize={note ? (id, w) => updateState(styleNote(id, { width: w })) : undefined}
        toolbar={toolbar}
      >
        {content}
      </WallCard>
    );
  };

  return (
    <div className="wall" data-testid="view-wall" ref={el}>
      <Canvas
        camera={camera}
        onCameraChange={setCamera}
        className="wall-surface"
        bounds={WALL_BOUNDS}
        surface={WALL_BOUNDS}
      >
        {wall.items.map(render)}
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
            const thread: Thread | undefined = wall.threads.find((t) => t.id === id);
            if (!thread) return;
            updateState(removeThread(id));
            showUndo('Нить удалена', e, () => updateState(restoreThread(thread)));
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
      {/* Чистые карточки — стопкой у края доски: взять записку или ярлык. */}
      <div className="wall-blanks">
        <button
          type="button"
          className="wall-blank wall-blank-note"
          data-testid="new-note"
          onPointerDown={blankDown('note')}
          onClick={(e) => {
            // Мышь — через перетаскивание (щелчок без сдвига — там же); здесь — клавиатура.
            if (e.detail === 0) newNote('note');
          }}
        >
          Записка
        </button>
        <button
          type="button"
          className="wall-blank wall-blank-label"
          data-testid="new-label"
          onPointerDown={blankDown('label')}
          onClick={(e) => {
            if (e.detail === 0) newNote('label');
          }}
        >
          Ярлык
        </button>
      </div>
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
              undo.restore();
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
