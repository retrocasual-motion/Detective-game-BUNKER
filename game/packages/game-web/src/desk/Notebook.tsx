import { useEffect, useRef } from 'react';
import { useGame } from '../store.ts';

/** Сколько знаков помещается в блокнот (схема состояния игрока). */
const MAX_CHARS = 20_000;

/**
 * Блокнот следователя (правка автора 11.11, DV-A): файлы устройств на стену не переносятся — что
 * важно, игрок записывает сам. Язычок внизу справа, выезжает как папка ходатайства, не на весь
 * экран и поверх всего: листа, вещи в руках, ноутбука. Игра записи не читает (P-1). Клавиши
 * остаются в блокноте: цифры не рисуют ключ ноутбука, стрелки не листают лист; Esc закрывает
 * только блокнот.
 */
export function Notebook() {
  const open = useGame((g) => g.notebookOpen);
  const ready = useGame((g) => g.state !== null);
  const text = useGame((g) => g.state?.notebook ?? '');
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) area.current?.focus({ preventScroll: true });
  }, [open]);

  if (!ready) return null;
  const setOpen = (v: boolean) => useGame.getState().setNotebookOpen(v);

  return (
    <div className={`notebook${open ? ' notebook-open' : ''}`}>
      <button
        type="button"
        className="notebook-tab"
        data-testid="notebook-tab"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Блокнот
      </button>
      <section
        className="notebook-pad"
        data-testid="notebook"
        aria-label="Блокнот следователя"
        inert={!open}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        <div className="notebook-rings" aria-hidden />
        <button
          type="button"
          className="tool tool-close notebook-close"
          aria-label="Закрыть блокнот"
          title="Закрыть блокнот (записи сохранятся)"
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
        <textarea
          ref={area}
          className="notebook-text"
          data-testid="notebook-text"
          aria-label="Записи"
          spellCheck={false}
          maxLength={MAX_CHARS}
          value={text}
          onChange={(e) => {
            const notebook = e.target.value;
            useGame.getState().updateState((s) => ({ ...s, notebook }));
          }}
        />
      </section>
    </div>
  );
}
