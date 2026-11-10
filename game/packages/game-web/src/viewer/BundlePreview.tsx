import { type CSSProperties, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { postAction } from '../api.ts';
import { useGame } from '../store.ts';
import { BUNDLE_PREVIEW_ID, type Bundle, listingOf, parseBundles } from './bundles.ts';
import { unwrapLines } from './text.ts';

/** Толщина торца на скане, px: по числу листов (96 листов — толстая, 9 — тонкая). */
const edgeHeight = (sheets: number) => Math.round(8 + sheets * 0.55);

/**
 * Материал 29 — девять сканов стопок (PK-B, решение автора 10.11): верхний лист и торец сбоку,
 * толщина — по числу листов, слои картона — тёмными полосами. Щелчок по стопке — «листать»:
 * опись пачки открывается. Глубокое приближение к торцу — его осмотр (useSheet, data-osmotr):
 * у П-02 — слой картона, лист 18; у П-09 — обложки папок; у прочих — подложка сканера.
 */
export function BundlePreview({ body }: { body: string }) {
  const { intro, bundles } = useMemo(() => parseBundles(body), [body]);

  const leaf = async (b: Bundle) => {
    const r = await postAction('ОСМОТР', BUNDLE_PREVIEW_ID, `листать ${b.id}`).catch(() => null);
    if (!r) return;
    const g = useGame.getState();
    if (r.released.length) g.addReleased(r.released);
    const id = listingOf(b.id, useGame.getState().materials);
    if (id) useGame.getState().openViewer(id);
  };

  return (
    <>
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks]}>{unwrapLines(intro)}</Markdown>
      <div className="bundles">
        {bundles.map((b) => (
          <figure key={b.id} className="bundle" data-testid={`bundle-${b.id}`}>
            <button
              type="button"
              className="bundle-scan"
              aria-label={`Листать пачку ${b.id}`}
              title="Листать пачку"
              onClick={(e) => {
                e.stopPropagation();
                void leaf(b);
              }}
            >
              <span className="bundle-top">{b.top}</span>
              <span
                className="bundle-edge"
                data-testid={`edge-${b.id}`}
                data-osmotr-target={`${BUNDLE_PREVIEW_ID} ${b.id} торец`}
                data-osmotr-value="осмотреть"
                style={{ height: edgeHeight(b.sheets) } as CSSProperties}
              >
                {b.layers.map((n) => (
                  <span
                    key={n}
                    className="bundle-layer"
                    data-testid={`layer-${b.id}`}
                    style={{ top: `${((n - 1) / b.sheets) * 100}%` }}
                  />
                ))}
              </span>
            </button>
            <figcaption>
              <b>{b.id}</b> · {b.room} · {b.sheets} л.
              <span className="bundle-side">Вид сбоку: {b.side}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
