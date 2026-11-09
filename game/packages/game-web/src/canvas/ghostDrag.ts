/** Сдвиг мыши, после которого нажатие — уже перетаскивание, а не щелчок. */
const SLOP = 5;

export interface GhostDragOptions {
  /** Что видно под курсором, пока тянут. */
  label: string;
  className: string;
  /** Можно ли отпустить здесь (призрак становится «готов»). */
  canDrop(pt: { x: number; y: number }): boolean;
  /** Отпустили там, где можно. */
  onDrop(pt: { x: number; y: number }): void;
  /** Нажали и отпустили без перетаскивания. */
  onClick(): void;
}

/**
 * Перетащить вещь из-за пределов холста на доску (из лотка «Входящие», чистую карточку) —
 * как в Miro или Figma: под курсором идёт её призрак; отпустить на доске — вещь повиснет
 * там; мимо — ничего. Без перетаскивания — обычный щелчок.
 */
export function startGhostDrag(
  e: PointerEvent | { clientX: number; clientY: number; button: number },
  o: GhostDragOptions,
) {
  if (e.button !== 0) return;
  const start = { x: e.clientX, y: e.clientY };
  let ghost: HTMLDivElement | null = null;

  const place = (x: number, y: number) => {
    if (!ghost) return;
    ghost.style.translate = `${x}px ${y}px`;
    ghost.classList.toggle('ghost-ok', o.canDrop({ x, y }));
  };
  const move = (ev: PointerEvent) => {
    if (!ghost && Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) > SLOP) {
      ghost = document.createElement('div');
      ghost.className = `drag-ghost ${o.className}`;
      ghost.dataset.testid = 'drag-ghost';
      ghost.textContent = o.label;
      document.body.appendChild(ghost);
    }
    place(ev.clientX, ev.clientY);
  };
  const end = (ev: PointerEvent, commit: boolean) => {
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
    const pt = { x: ev.clientX, y: ev.clientY };
    if (!ghost) {
      if (commit) o.onClick();
      return;
    }
    ghost.remove();
    ghost = null;
    if (commit && o.canDrop(pt)) o.onDrop(pt);
  };
  const up = (ev: PointerEvent) => end(ev, true);
  const cancel = (ev: PointerEvent) => end(ev, false);
  // Перехват: листы под курсором гасят всплытие своих событий мыши.
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel, true);
}
