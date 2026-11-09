import { useEffect } from 'react';
import { useGame } from '../store.ts';
import { takeOutOfBin } from '../wall/wall-actions.ts';

/** Небольшой наклон комка — свой у каждого письма, без случайности между перерисовками. */
const tilt = (id: string) => ((Number(id.slice(1)) * 37) % 13) - 6;

/**
 * Корзина у стола открыта (TR-A, решение автора 09.11): выброшенные письма-ответы лежат
 * скомканными, свежее — сверху. Щелчок по комку — прочитать; «Достать» — обратно во
 * «Входящие». В деле письма остаются: карточки из них работают.
 */
export function TrashView() {
  const open = useGame((g) => g.trashOpen);
  const trash = useGame((g) => g.state?.trash);
  const materials = useGame((g) => g.materials);
  const viewerOpen = useGame((g) => g.viewerId !== null);
  const setOpen = useGame((g) => g.setTrashOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useGame.getState().viewerId) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open || !trash) return null;
  const titles = new Map(materials.map((m) => [m.id, m.title]));
  return (
    <div
      className="trash-overlay"
      data-testid="trash-view"
      inert={viewerOpen}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <section className="trash-panel" role="dialog" aria-label="Корзина">
        <header className="trash-head">
          <h2>Корзина</h2>
          <button
            type="button"
            className="tool tool-close"
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </header>
        {trash.length ? (
          <ul className="trash-list">
            {[...trash].reverse().map((id) => (
              <li key={id} className="trash-item" data-testid={`trash-${id}`}>
                <button
                  type="button"
                  className="trash-crumple"
                  style={{ rotate: `${tilt(id)}deg` }}
                  title="Развернуть и прочитать"
                  onClick={() => useGame.getState().openViewer(id)}
                >
                  <span className="trash-crumple-title">{titles.get(id) ?? id}</span>
                </button>
                <button
                  type="button"
                  className="tool"
                  data-testid={`trash-out-${id}`}
                  onClick={() => useGame.getState().updateState(takeOutOfBin(id))}
                >
                  Достать
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="trash-empty">Пусто.</p>
        )}
        <p className="trash-hint">
          Сюда можно выбросить письмо-ответ: кнопкой «В корзину» в письме, ✕ у письма на стене или
          бросив письмо из «Входящих» на корзину. В деле письмо остаётся; «Достать» — обратно во
          «Входящие».
        </p>
      </section>
    </div>
  );
}

/** «Письмо в корзине · Вернуть» — несколько секунд после броска. */
export function ThrowToast() {
  const binned = useGame((g) => g.binned);
  const undo = useGame((g) => g.undoThrow);
  if (!binned) return null;
  return (
    <div className="throw-toast" data-testid="throw-toast" role="status">
      Письмо {binned.id} в корзине
      <button type="button" onClick={undo}>
        Вернуть
      </button>
    </div>
  );
}
