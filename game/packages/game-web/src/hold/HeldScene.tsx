import {
  CONTAINERS,
  type ContainerId,
  containerContents,
  containerLabelId,
  focusCamera,
} from '@bunker/shared';
import { useMemo, useState } from 'react';
import { postAction } from '../api.ts';
import { type Held, useGame } from '../store.ts';
import {
  type Bundle,
  coverCode,
  FOLDER_SHEETS,
  listingOf,
  PAPERS_ID,
  parseBundles,
  remaining,
  sheetPages,
} from '../viewer/bundles.ts';
import Held3D, { afterLeaving } from './Held3D.tsx';
import { Folder, PaperStack, PapersBox } from './papers.tsx';
import { Box, Device, Envelope } from './shapes.tsx';

/** Вещь в руках со сценой three.js — отдельный кусок сборки (грузится, когда вещь взяли). */
export default function HeldThing({ held }: { held: Held }) {
  const [opened, setOpened] = useState(false);
  const materials = useGame((g) => g.materials);
  const close = () => useGame.getState().hold(null);
  const titles = new Map(materials.map((m) => [m.id, m.title]));

  if (held.type === 'container') {
    const c = CONTAINERS.find((x) => x.id === held.id);
    if (!c) return null;
    const inside = containerContents(c).filter((m) => titles.has(m));
    if (opened) return <Opened id={held.id} inside={inside} titles={titles} />;
    const items = inside.map((m) => ({ id: m, title: short(titles.get(m) ?? '') }));
    const open = () =>
      afterLeaving(() => {
        useGame.getState().openContainer(held.id);
        setOpened(true);
      });
    const box = held.id === 'personal';
    return (
      <Held3D
        mode={box ? 'free' : 'flip'}
        half={[1.6, 1.2]}
        label={box ? 'Коробка «Личные вещи»' : `Конверт «${c.label}»`}
        onClose={close}
      >
        {box ? (
          <Box items={items} onOpen={open} />
        ) : (
          <Envelope title={c.label} items={items} onOpen={open} />
        )}
      </Held3D>
    );
  }

  if (held.id === PAPERS_ID) return <Papers />;

  const title = titles.get(held.id) ?? held.id;
  return (
    <Held3D mode="free" half={[1.6, 1.2]} label={title} onClose={close}>
      <Device
        id={held.id}
        tag={`Изъято · ${held.id}`}
        onUse={() =>
          afterLeaving(() => {
            close();
            useGame.getState().readMaterial(held.id);
          })
        }
      />
    </Held3D>
  );
}

/**
 * Пачки бумаг из помещений (PH-B): коробка — щелчок по пачке — пачка в руках; её крутят
 * (торец, подложка), щелчок по верхнему листу — «пролистать»: опись пачки открывается листом.
 * Торчащий картон тянут — папка в руках (RD-A); открыть — опись на этом листе. Esc — на шаг назад.
 */
function Papers() {
  const body = useGame((g) => g.materials.find((m) => m.id === PAPERS_ID)?.body ?? '');
  const all = useMemo(() => parseBundles(body).bundles, [body]);
  const materials = useGame((g) => g.materials);
  const taken = useGame((g) => g.state?.taken ?? NONE);
  const [pickId, setPickId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [folder, setFolder] = useState<{ code: string | null; listing: string; n: number } | null>(
    null,
  );
  const close = () => useGame.getState().hold(null);
  // Пачка как она есть сейчас: без вынутых папок (их листов там больше нет).
  const view = (b: Bundle) => {
    const listing = listingOf(b.id, materials);
    const text = materials.find((m) => m.id === listing)?.body ?? null;
    return remaining(b, taken, text ? sheetPages(text, b) : null);
  };
  const orig = all.find((b) => b.id === pickId) ?? null;
  const now = orig ? view(orig) : null;
  const take = (b: Bundle) => {
    setPage(0);
    setPickId(b.id);
  };
  // Первое перелистывание — «ОСМОТР | 29 | листать П-0N»: опись — сразу на стену (AW-B).
  const next = async () => {
    if (!orig || !now) return;
    if (!now.sheets) {
      const r = await postAction('ОСМОТР', PAPERS_ID, `листать ${orig.id}`).catch(() => null);
      if (!r || r.quiet) return;
      useGame.getState().addFound(r.released);
    }
    setPage((p) => Math.min(now.bundle.sheets, p + 1));
  };
  // Взяли папку — за торчащий край или долистав до обложки (правила card-p02, card-p09). Она
  // пропадает из пачки: её листов там больше нет (taken).
  const pull = async (n: number) => {
    if (!orig || !now) return;
    const first = now.orig[n - 1] ?? n;
    const r = await postAction('ОСМОТР', `${PAPERS_ID} ${orig.id} картон`, 'вытащить').catch(
      () => null,
    );
    if (!r) return;
    useGame.getState().addFound(r.released);
    // Список материалов — уже с описью, что только что пришла (снимок до addFound её не знает).
    const g = useGame.getState();
    const id = listingOf(orig.id, g.materials);
    if (!id) return;
    const text = g.materials.find((m) => m.id === id)?.body ?? '';
    g.updateState((s) => ({ ...s, taken: [...(s.taken ?? []), `${orig.id}/${first}`] }));
    setPage((p) => Math.min(p, Math.max(0, n - 1)));
    afterLeaving(() => setFolder({ code: coverCode(text, first), listing: id, n: first }));
  };
  // Листы текстом вниз (П-05, 19–24) — перевернуть: движок отдаёт их лицом вверх (L957).
  const turnOver = async () => {
    if (!orig) return;
    const r = await postAction('ОСМОТР', orig.id, 'перевернуть нижние листы').catch(() => null);
    if (!r || r.quiet || !r.released.length) return;
    useGame.getState().addFound(r.released);
    const id = r.released[0]?.id;
    if (!id) return;
    afterLeaving(() => {
      close();
      useGame.getState().openViewer(id);
    });
  };
  if (orig && folder)
    return (
      <Held3D
        key={`folder-${orig.id}-${folder.n}`}
        mode="free"
        half={[1.6, 1.2]}
        label={folder.code ? `Папка ${folder.code}` : 'Папка'}
        onClose={() => setFolder(null)}
      >
        <Folder
          code={folder.code}
          onOpen={() =>
            afterLeaving(() => {
              close();
              // Только листы папки — обложка и что в ней (до отдельного документа, DS-A).
              const to = Math.min(orig.sheets, folder.n + FOLDER_SHEETS - 1);
              useGame.getState().openViewer(folder.listing, undefined, {
                title: `Папка ${folder.code ?? ''} (пачка ${orig.id}, листы ${folder.n}–${to})`,
                from: folder.n,
                to,
              });
            })
          }
        />
      </Held3D>
    );
  if (orig && now) {
    const total = now.bundle.sheets;
    return (
      <Held3D
        key={orig.id}
        mode="free"
        half={[1.6, 1.2]}
        label={`Пачка ${orig.id} · ${orig.room} · ${total} л.`}
        caption={
          now.sheets && page > 0
            ? page >= total
              ? `${orig.id}: все ${total} л. пролистаны`
              : `${orig.id} · лист ${page + 1} из ${total}`
            : undefined
        }
        onClose={() => setPickId(null)}
      >
        <PaperStack
          bundle={now.bundle}
          sheets={now.sheets}
          page={page}
          onNext={() => void next()}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onPull={(n) => void pull(n)}
          onTurnOver={() => void turnOver()}
        />
      </Held3D>
    );
  }
  return (
    <Held3D mode="free" half={[1.6, 1.2]} label="Бумаги из помещений · 9 пачек" onClose={close}>
      <PapersBox
        bundles={all.map((b) => {
          const v = view(b);
          return { ...v.bundle, top: v.sheets?.[0]?.text ?? b.top };
        })}
        onPick={(b) => afterLeaving(() => take(b))}
      />
    </Held3D>
  );
}

const NONE: readonly string[] = [];

/** Вскрыто: документы вышли из конверта и висят на стене группой под названием. */
function Opened({
  id,
  inside,
  titles,
}: {
  id: ContainerId;
  inside: string[];
  titles: Map<string, string>;
}) {
  const c = CONTAINERS.find((x) => x.id === id);
  const close = () => useGame.getState().hold(null);
  if (!c) return null;
  return (
    <div className="envelope-view" data-testid="envelope-view">
      <section className="envelope-opened" data-testid="envelope-opened">
        <h2>{c.label}</h2>
        <ul className="envelope-sheets">
          {inside.map((m, k) => (
            <li key={m} className="envelope-sheet" style={{ animationDelay: `${k * 60}ms` }}>
              <span className="envelope-sheet-id">{m}</span>
              {titles.get(m)}
            </li>
          ))}
        </ul>
        <p className="envelope-done" data-testid="envelope-done">
          Всё повешено на стену — группой под ярлыком «{c.label}».
          {c.devices ? ' Изъятые устройства — на столе.' : ''}
        </p>
        <div className="envelope-actions">
          <button
            type="button"
            className="tool envelope-open"
            data-testid="envelope-to-wall"
            onClick={() => {
              close();
              // Стена — сразу у новой группы (ярлык с названием конверта).
              const g = useGame.getState();
              const label = g.state?.wall.items.find((i) => i.id === containerLabelId(id));
              g.setView('wall', label ? focusCamera(label.x, label.y) : undefined);
            }}
          >
            Перейти к стене
          </button>
          <button type="button" className="tool" data-testid="envelope-stay" onClick={close}>
            Остаться у стола
          </button>
        </div>
      </section>
    </div>
  );
}

/** На конверте пишут кратко: до скобки или «;», не длиннее 40 знаков (по целым словам). */
export const short = (title: string) => {
  const t = title.split(/[(;]/)[0]?.trim() ?? title;
  if (t.length <= 40) return t;
  return `${t.slice(0, 40).replace(/\s+\S*$/, '')}…`;
};
