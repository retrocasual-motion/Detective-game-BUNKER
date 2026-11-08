import type { Material } from '@bunker/shared';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { useGame } from '../store.ts';

/** Сдвиг мыши, после которого нажатие на лист в лотке — уже перенос, а не щелчок. */
const DRAG_SLOP = 5;
/** Сколько висит записка «Добавлено в дело». */
const ARRIVAL_MS = 8000;

interface InboxTrayProps {
  /** Вынуть материал из лотка на стол: в точку экрана или (null) — в середину видимого стола. */
  onTakeOut(materialId: string, at: { x: number; y: number } | null): void;
}

/**
 * Лоток «Входящие» (TECH_PLAN 4.2; E2-INBOX-A): всё, что открыто по ходу дела, приходит сюда
 * стопкой, свежее сверху. Лоток — у ближнего края стола, внизу справа (зеркально папке
 * ходатайства). Щелчок по листу — открыть; утащить на стол или «На стол» — вынуть.
 * Подсветки нет (P-1): новое — это просто то, что лежит в лотке.
 */
export function InboxTray({ onTakeOut }: InboxTrayProps) {
  const items = useGame((g) => g.state?.desk.items);
  const materials = useGame((g) => g.materials);
  const open = useGame((g) => g.trayOpen);
  const setOpen = useGame((g) => g.setTrayOpen);
  const openViewer = useGame((g) => g.openViewer);
  const arrival = useGame((g) => g.arrival);
  const [note, setNote] = useState<typeof arrival>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!arrival) return;
    setNote(arrival);
    const t = setTimeout(() => setNote(null), ARRIVAL_MS);
    return () => clearTimeout(t);
  }, [arrival]);

  const byId = new Map(materials.map((m) => [m.id, m]));
  const inTray = (items ?? [])
    .filter((i) => i.tray)
    .sort((a, b) => b.z - a.z)
    .flatMap((i) => byId.get(i.materialId) ?? []);

  const first = note ? byId.get(note.ids[0] ?? '') : undefined;

  return (
    <div className={`inbox${open ? ' inbox-open' : ''}`} data-testid="inbox">
      {note && first && !open && (
        <button
          type="button"
          className="inbox-note"
          data-testid="inbox-note"
          onClick={() => setOpen(true)}
        >
          Добавлено в дело: {first.id} · {first.title}
          {note.ids.length > 1 && ` и ещё ${note.ids.length - 1}`}
        </button>
      )}
      <button
        type="button"
        className={`inbox-tab${inTray.length ? ' inbox-tab-full' : ''}`}
        data-testid="inbox-tab"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Входящие
      </button>
      <section
        ref={panel}
        className="inbox-panel"
        data-testid="inbox-panel"
        aria-label="Входящие"
        inert={!open}
      >
        {inTray.length === 0 ? (
          <p className="inbox-empty">Лоток пуст</p>
        ) : (
          inTray.map((m) => (
            <TrayItem
              key={m.id}
              material={m}
              panel={panel}
              onOpen={() => openViewer(m.id)}
              onTakeOut={(at) => onTakeOut(m.id, at)}
            />
          ))
        )}
      </section>
    </div>
  );
}

function TrayItem({
  material,
  panel,
  onOpen,
  onTakeOut,
}: {
  material: Material;
  panel: React.RefObject<HTMLElement | null>;
  onOpen(): void;
  onTakeOut(at: { x: number; y: number } | null): void;
}) {
  const down = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    down.current = { x: e.clientX, y: e.clientY };
    dragged.current = false;
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = down.current;
    if (!d) return;
    if (!dragged.current && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > DRAG_SLOP) {
      dragged.current = true;
    }
    if (dragged.current) setGhost({ x: e.clientX, y: e.clientY });
  };
  const cancel = () => {
    down.current = null;
    dragged.current = false;
    setGhost(null);
  };
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    down.current = null;
    setGhost(null);
    if (!dragged.current) return;
    const r = panel.current?.getBoundingClientRect();
    const inside =
      r &&
      e.clientX >= r.left &&
      e.clientX <= r.right &&
      e.clientY >= r.top &&
      e.clientY <= r.bottom;
    if (!inside) onTakeOut({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="inbox-item">
      <button
        type="button"
        className={`inbox-paper paper-${material.kind}-mini`}
        data-testid={`inbox-item-${material.id}`}
        aria-label={`${material.id}. ${material.title}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancel}
        onLostPointerCapture={() => setGhost(null)}
        onClick={() => {
          // Щелчок, которым кончился перенос, — не «открыть»; следующий (или Enter) — открыть.
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          onOpen();
        }}
      >
        <span className="card-id">{material.id}</span>
        <span className="inbox-title">{material.title}</span>
      </button>
      <button
        type="button"
        className="inbox-take"
        data-testid={`inbox-take-${material.id}`}
        title="Вынуть на стол"
        onClick={() => onTakeOut(null)}
      >
        На стол
      </button>
      {ghost && (
        <span className="inbox-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden>
          {material.id} · {material.title}
        </span>
      )}
    </div>
  );
}
