import { type MouseEvent, useEffect, useState } from 'react';
import { newId } from '../canvas/geometry.ts';
import { clearFind, highlightFind, SCREEN_FIND } from '../search/highlight.ts';
import { useGame } from '../store.ts';
import { quoteCard, toVerdict, useVerdictOpen } from '../verdict/cards.ts';

/**
 * Общее у экранов устройств (ноутбук 4c-1, телефон 4c-2): устройство стоит в свободном месте
 * между папкой заключения и блокнотом (они лежат сверху — правка автора 11.11); выделенная
 * строка на экране — в заключение, пока открыта его форма (PT-A, FM-A).
 */

/** Свободное место по горизонтали: середина и ширина (обновляется, когда папка или блокнот выдвинуты). */
export function useFreeArea() {
  const folderShown = useGame((g) => g.folderOpen);
  const notebookShown = useGame((g) => g.notebookOpen);
  const [area, setArea] = useState(() => ({
    center: window.innerWidth / 2,
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const fitArea = () => {
      const edge = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
      const left = folderShown ? (edge('.petition')?.right ?? 0) : 0;
      const right = notebookShown
        ? (edge('.notebook')?.left ?? window.innerWidth)
        : window.innerWidth;
      setArea({ center: (left + right) / 2, width: right - left, height: window.innerHeight });
    };
    fitArea();
    window.addEventListener('resize', fitArea);
    return () => window.removeEventListener('resize', fitArea);
  }, [folderShown, notebookShown]);
  return area;
}

/** Где выделили: экран какого устройства (для «открыть» у выписки). */
export type ScreenKind = 'pc' | 'laptop' | 'phone' | 'camera';

/**
 * Выделение на экране устройства (A-272, DB-B): «На стену» — выписка рукой следователя; пока
 * открыта форма заключения — и «В заключение» (FM-A). Источник — подпись ближайшего
 * `data-source` (файл, раздел, письмо), иначе название материала.
 */
export function useSelectionCard(testId: string, kind: ScreenKind) {
  const [sel, setSel] = useState<{
    text: string;
    material: string;
    source: string;
    /** Раздел программы, экран телефона — откуда выписано (7.5): туда и откроется. */
    screen?: string;
    /** Страница сайта дела в браузере (A-288 п. 9): адрес и письмо веб-почты. */
    site?: { address: string; letter?: number };
    x: number;
    y: number;
  } | null>(null);
  const verdictOpen = useVerdictOpen();

  useEffect(() => {
    const onChange = () => {
      const s = window.getSelection();
      if (!s || s.isCollapsed || !s.toString().trim()) setSel(null);
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);

  const onUp = (e: MouseEvent) => {
    const s = window.getSelection();
    const text = s?.toString() ?? '';
    if (!s || s.isCollapsed || !text.trim()) return;
    const at = s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement;
    const holder = at?.closest('[data-material]');
    const material = holder?.getAttribute('data-material');
    if (!material || !e.currentTarget.contains(holder ?? null)) return;
    const title = useGame.getState().materials.find((m) => m.id === material)?.title ?? material;
    const r = s.getRangeAt(s.rangeCount - 1).getBoundingClientRect();
    setSel({
      text: text.replace(/\s+/g, ' ').trim(),
      material,
      source: at?.closest('[data-source]')?.getAttribute('data-source') ?? title,
      screen: at?.closest('[data-screen]')?.getAttribute('data-screen') ?? undefined,
      site: siteAt(at),
      x: Math.min(Math.max(r.right, 120), window.innerWidth - 120),
      y: Math.min(Math.max(r.bottom, 0), window.innerHeight - 48),
    });
  };
  const done = () => {
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };
  const button = sel && (
    <div className="sel-actions" style={{ left: sel.x, top: sel.y + 6 }}>
      <button
        type="button"
        className="to-petition"
        data-testid={testId.replace(/-to-folder$/, '-to-wall')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          useGame.getState().pinExcerpt({
            id: `x:${newId()}`,
            text: sel.text.slice(0, 600),
            material: sel.material,
            source: sel.source.slice(0, 160),
            // С сайта — выписка сайта: щелчок откроет страницу в браузере компьютера.
            place: sel.site
              ? { kind: 'site', ...sel.site }
              : sel.screen
                ? { kind, screen: sel.screen.slice(0, 80) }
                : { kind },
          });
          done();
        }}
      >
        На стену
      </button>
      {verdictOpen && (
        <button
          type="button"
          className="to-petition"
          data-testid={testId}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            toVerdict(quoteCard(sel.material, sel.text));
            done();
          }}
        >
          В заключение
        </button>
      )}
    </div>
  );
  return { onUp, button };
}

/** Выделили на странице сайта в браузере устройства: её адрес и письмо веб-почты. */
function siteAt(at: Element | null | undefined): { address: string; letter?: number } | undefined {
  const address = at?.closest('[data-site-address]')?.getAttribute('data-site-address');
  if (!address) return undefined;
  const letter = Number(at?.closest('[data-letter]')?.getAttribute('data-letter')) || 0;
  return { address: address.slice(0, 300), ...(letter ? { letter } : {}) };
}

/**
 * «Открыть» у выписки (A-272, DB-B): устройство открыто на её файле — выписанные слова
 * подсвечены и прокручены в вид (та же подсветка, что у поиска по делу).
 */
export function useFindOnScreen(selector: string, on: boolean) {
  const find = useGame((g) => g.find);
  useEffect(() => {
    if (!on || !find) return;
    // Окно (программа сервера, файл ноутбука) может открыться не сразу — пробуем до 3 с.
    let tries = 0;
    let t: ReturnType<typeof setTimeout>;
    const attempt = () => {
      const root = document.querySelector(selector);
      // Найденное — своему адресату (RV-26): пока файла нет на экране, ждём его (до 3 с), а не
      // подсвечиваем чужое совпадение.
      if (root && find.for && !root.querySelector(`[data-material="${find.for}"]`) && tries < 11) {
        tries++;
        t = setTimeout(attempt, 250);
        return;
      }
      const r = root ? highlightFind(root, find.q, find.k, SCREEN_FIND) : null;
      if (!r && ++tries < 12) {
        t = setTimeout(attempt, 250);
        return;
      }
      r?.startContainer.parentElement?.scrollIntoView({ block: 'center' });
      useGame.setState({ find: null });
    };
    t = setTimeout(attempt, 500);
    return () => clearTimeout(t);
  }, [find, on, selector]);
  useEffect(() => (on ? undefined : clearFind(SCREEN_FIND)), [on]);
}
