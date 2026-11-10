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
import { type Bundle, listingOf, PAPERS_ID, parseBundles } from '../viewer/bundles.ts';
import Held3D, { afterLeaving } from './Held3D.tsx';
import { PaperStack, PapersBox } from './papers.tsx';
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
 * Закрыть пачку — обратно к коробке.
 */
function Papers() {
  const body = useGame((g) => g.materials.find((m) => m.id === PAPERS_ID)?.body ?? '');
  const bundles = useMemo(() => parseBundles(body).bundles, [body]);
  const [pick, setPick] = useState<Bundle | null>(null);
  const close = () => useGame.getState().hold(null);
  const leaf = async (b: Bundle) => {
    const r = await postAction('ОСМОТР', PAPERS_ID, `листать ${b.id}`).catch(() => null);
    if (!r) return;
    if (r.released.length) useGame.getState().addReleased(r.released);
    const id = listingOf(b.id, useGame.getState().materials);
    if (!id) return;
    afterLeaving(() => {
      close();
      useGame.getState().openViewer(id);
    });
  };
  if (pick)
    return (
      <Held3D
        key={pick.id}
        mode="free"
        half={[1.6, 1.2]}
        label={`Пачка ${pick.id} · ${pick.room} · ${pick.sheets} л.`}
        onClose={() => setPick(null)}
      >
        <PaperStack bundle={pick} onLeaf={() => void leaf(pick)} />
      </Held3D>
    );
  return (
    <Held3D mode="free" half={[1.6, 1.2]} label="Бумаги из помещений · 9 пачек" onClose={close}>
      <PapersBox bundles={bundles} onPick={(b) => afterLeaving(() => setPick(b))} />
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
