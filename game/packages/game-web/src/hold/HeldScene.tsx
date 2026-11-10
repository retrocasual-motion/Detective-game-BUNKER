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
  listingOf,
  PAPERS_ID,
  parseBundles,
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
  const bundles = useMemo(() => parseBundles(body).bundles, [body]);
  const materials = useGame((g) => g.materials);
  const [pick, setPick] = useState<Bundle | null>(null);
  const [page, setPage] = useState(0);
  const [folder, setFolder] = useState<{ code: string | null; listing: string; n: number } | null>(
    null,
  );
  const close = () => useGame.getState().hold(null);
  // Листы пачки — из её описи, когда опись пришла (её отдаёт движок на первое «листать»).
  const listing = pick ? listingOf(pick.id, materials) : null;
  const listingBody = materials.find((m) => m.id === listing)?.body ?? null;
  const sheets = useMemo(
    () => (pick && listingBody ? sheetPages(listingBody, pick) : null),
    [pick, listingBody],
  );
  const take = (b: Bundle) => {
    setPage(0);
    setPick(b);
  };
  // Первое перелистывание — «ОСМОТР | 29 | листать П-0N»: опись — сразу на стену (AW-B).
  const next = async () => {
    if (!pick) return;
    if (!sheets) {
      const r = await postAction('ОСМОТР', PAPERS_ID, `листать ${pick.id}`).catch(() => null);
      if (!r || r.quiet) return;
      useGame.getState().addFound(r.released);
    }
    setPage((p) => Math.min(pick.sheets, p + 1));
  };
  // Взяли папку — за торчащий край или долистав до обложки (правила card-p02, card-p09).
  const pull = async (b: Bundle, n: number) => {
    const r = await postAction('ОСМОТР', `${PAPERS_ID} ${b.id} картон`, 'вытащить').catch(
      () => null,
    );
    if (!r) return;
    useGame.getState().addFound(r.released);
    const id = listingOf(b.id, useGame.getState().materials);
    if (!id) return;
    const text = useGame.getState().materials.find((m) => m.id === id)?.body ?? '';
    afterLeaving(() => setFolder({ code: coverCode(text, n), listing: id, n }));
  };
  // Листы текстом вниз (П-05, 19–24) — перевернуть: движок отдаёт их лицом вверх (L957).
  const turnOver = async (b: Bundle) => {
    const r = await postAction('ОСМОТР', b.id, 'перевернуть нижние листы').catch(() => null);
    if (!r || r.quiet || !r.released.length) return;
    useGame.getState().addFound(r.released);
    const id = r.released[0]?.id;
    if (!id) return;
    afterLeaving(() => {
      close();
      useGame.getState().openViewer(id);
    });
  };
  if (pick && folder)
    return (
      <Held3D
        key={`folder-${pick.id}-${folder.n}`}
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
              const to = Math.min(pick.sheets, folder.n + 2);
              useGame.getState().openViewer(folder.listing, undefined, {
                title: `Папка ${folder.code ?? ''} (пачка ${pick.id}, листы ${folder.n}–${to})`,
                from: folder.n,
                to,
              });
            })
          }
        />
      </Held3D>
    );
  if (pick)
    return (
      <Held3D
        key={pick.id}
        mode="free"
        half={[1.6, 1.2]}
        label={`Пачка ${pick.id} · ${pick.room} · ${pick.sheets} л.`}
        caption={
          sheets && page > 0
            ? page >= pick.sheets
              ? `${pick.id}: все ${pick.sheets} л. пролистаны`
              : `${pick.id} · лист ${page + 1} из ${pick.sheets}`
            : undefined
        }
        onClose={() => setPick(null)}
      >
        <PaperStack
          bundle={pick}
          sheets={sheets}
          page={page}
          onNext={() => void next()}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onPull={(n) => void pull(pick, n)}
          onTurnOver={() => void turnOver(pick)}
        />
      </Held3D>
    );
  return (
    <Held3D mode="free" half={[1.6, 1.2]} label="Бумаги из помещений · 9 пачек" onClose={close}>
      <PapersBox bundles={bundles} onPick={(b) => afterLeaving(() => take(b))} />
    </Held3D>
  );
}

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
