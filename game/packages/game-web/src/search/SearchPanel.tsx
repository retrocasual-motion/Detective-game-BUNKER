import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useGame, useVisibleMaterials } from '../store.ts';
import { MIN_QUERY, searchCase } from './searchCase.ts';

/** Сколько строк показывать у одного материала (остальные — «ещё N»). */
const PER_MATERIAL = 5;

/**
 * Поиск по делу (RD-C, решение автора 09.11): ярлык «Поиск» справа сверху или Ctrl+F. Слово
 * ищется во всех материалах игрока; щелчок по строке открывает лист на ней (слово подсвечено).
 * Панель остаётся открытой под листом — после чтения можно взять следующую строку.
 */
export function SearchPanel() {
  const open = useGame((g) => g.searchOpen);
  const setOpen = useGame((g) => g.setSearchOpen);
  const materials = useVisibleMaterials();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const input = useRef<HTMLInputElement>(null);
  const found = useMemo(() => searchCase(materials, deferred), [materials, deferred]);
  const total = found.reduce((n, f) => n + f.hits.length, 0);
  // SR-D (решение автора 10.11): лист — сразу на найденном месте, под ним доска подводит его
  // карточку к центру и подсвечивает. Панель остаётся — следующий результат одним щелчком.
  const showFound = (id: string, k: number) => {
    const g = useGame.getState();
    g.openViewer(id, { q: deferred, k });
    g.revealOnWall(id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !e.altKey) {
        e.preventDefault();
        // Из открытого листа — к поиску по всему делу.
        useGame.getState().closeViewer();
        setOpen(true);
        requestAnimationFrame(() => input.current?.select());
      } else if (
        e.key === 'Escape' &&
        useGame.getState().searchOpen &&
        !useGame.getState().viewerId
      ) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  if (!open)
    return (
      <button
        type="button"
        className="search-tab"
        data-testid="search-tab"
        title="Поиск по делу (Ctrl+F)"
        onClick={() => setOpen(true)}
      >
        Поиск
      </button>
    );

  return (
    <section className="search-panel" data-testid="search-panel" aria-label="Поиск по делу">
      <div className="search-head">
        <input
          ref={input}
          type="search"
          data-testid="search-input"
          aria-label="Слово или число"
          placeholder="Слово или число"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="tool tool-close"
          aria-label="Закрыть поиск"
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
      </div>
      <p className="search-count" data-testid="search-count">
        {deferred.trim().length < MIN_QUERY
          ? 'Ищет во всех материалах дела, которые у вас есть.'
          : total
            ? `${total} — в ${found.length} ${plural(found.length)}`
            : 'В открытых материалах ничего не найдено.'}
      </p>
      <ol className="search-results">
        {found.map((f) => (
          <li key={f.id} data-testid={`search-${f.id}`}>
            <div className="search-material">
              <span className="search-id">{f.id}</span> {f.title}
            </div>
            {f.hits.slice(0, PER_MATERIAL).map((h) => (
              <button
                key={h.k}
                type="button"
                className="search-hit"
                onClick={() => showFound(f.id, h.k)}
              >
                {h.before}
                <mark>{h.match}</mark>
                {h.after}
              </button>
            ))}
            {f.hits.length > PER_MATERIAL && (
              <button
                type="button"
                className="search-more"
                onClick={() => showFound(f.id, PER_MATERIAL)}
              >
                ещё {f.hits.length - PER_MATERIAL} в этом материале
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

const plural = (n: number) => {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return 'материале';
  return 'материалах';
};
