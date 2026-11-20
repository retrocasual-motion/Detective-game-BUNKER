import {
  CONTAINERS,
  type ContainerId,
  containerContents,
  folderItemId,
  SERVER_DISC_ID,
} from '@bunker/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { postAction } from '../api.ts';
import { CAMERA_PX, CameraScreen, CameraSheet } from '../camera/CameraScreen.tsx';
import { stopCamera, useCamera } from '../camera/camera.ts';
import { LAPTOP_PX, LaptopLive } from '../laptop/LaptopView.tsx';
import { PHONE_PX, PhoneLive } from '../phone/PhoneView.tsx';
import { RadioSheet, RecorderLcd } from '../radio/RecorderParts.tsx';
import { stopRecorder, useRecorder } from '../radio/recorder.ts';
import { type Held, useGame } from '../store.ts';
import {
  type Bundle,
  coverCode,
  docOf,
  FOLDER_SHEETS,
  faceUpTexts,
  listingOf,
  PAPERS_ID,
  parseBundles,
  remaining,
  sheetPages,
} from '../viewer/bundles.ts';
import { CAMERA_FOCUS, CameraDevice } from './cameraModel.tsx';
import { CASSETTE_ID, CassetteHeld } from './cassette.tsx';
import Held3D, { afterLeaving, type Focus } from './Held3D.tsx';
import { Folder, PaperStack, PapersBox } from './papers.tsx';
import { RADIO_FOCUS, type RadioPart, RadioStand, SCREEN_PX } from './radioStand.tsx';
import { ServerDiscHeld } from './serverDisc.tsx';
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
    const box = held.id === 'personal' || held.id === 'bank';
    return (
      <Held3D
        mode={box ? 'free' : 'flip'}
        half={[1.6, 1.2]}
        label={box ? `Коробка «${c.label}»` : `Конверт «${c.label}»`}
        onClose={close}
      >
        {held.id === 'bank' ? (
          // Коробка вещдоков из банка (A-272, L460): бирка бюро, ячейка вскрыта в банке.
          <Box
            items={items}
            onOpen={open}
            title="Front Range Savings"
            note="Ячейка № 845 · вскрыта 17.11.2009"
          />
        ) : box ? (
          <Box items={items} onOpen={open} />
        ) : (
          <Envelope title={c.label} items={items} onOpen={open} />
        )}
      </Held3D>
    );
  }

  if (held.id === PAPERS_ID) return <Papers />;
  if (held.id === SERVER_DISC_ID) return <ServerDiscHeld />;
  if (held.id === CASSETTE_ID) return <CassetteHeld />;
  if (held.id === '50') return <RadioHeld title={titles.get('50') ?? '50'} close={close} />;

  const title = titles.get(held.id) ?? held.id;
  if (held.id === '47' || held.id === '48') return <ScreenDevice id={held.id} title={title} />;
  if (held.id === '24') return <CameraHeld title={title} />;
  return (
    <Held3D mode="free" half={[1.6, 1.2]} label={title} onClose={close}>
      <Device
        id={held.id}
        tag={`Изъято · ${held.id}`}
        onUse={() =>
          afterLeaving(() => {
            // Ручка-диктофон — назад, play, вперёд (4d-2).
            if (held.id === '49') {
              useGame.getState().openPen();
              return;
            }
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
  const turned = useGame((g) => g.state?.turned ?? NONE);
  // Перевёрнутые листы П-05 — лицом вверх, лица — из пересканов (L957), когда они пришли.
  const rescans = materials.find((m) => m.id === RESCANS_ID)?.body ?? '';
  const faceUp = useMemo(() => faceUpTexts(rescans), [rescans]);
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
    return remaining(b, taken, text ? sheetPages(text, b) : null, turned, faceUp);
  };
  const orig = all.find((b) => b.id === pickId) ?? null;
  const now = orig ? view(orig) : null;
  const take = (b: Bundle) => {
    setPage(0);
    setPickId(b.id);
  };
  // Первое перелистывание — «ОСМОТР | 29 | листать П-0N»: опись — сразу на стену (AW-B). Лист
  // переворачивается сразу, опись подтягивается в это время (правка автора 10.11: без задержки).
  const asking = useRef(false);
  const next = async () => {
    if (!orig || !now) return;
    setPage((p) => Math.min(now.bundle.sheets, p + 1));
    if (now.sheets || asking.current) return;
    asking.current = true;
    const r = await postAction('ОСМОТР', PAPERS_ID, `листать ${orig.id}`).catch(() => null);
    asking.current = false;
    if (!r || r.quiet) {
      setPage(0);
      return;
    }
    useGame.getState().addFound(r.released);
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
    // Опись пачки — в дело (во «Входящие», без записки); на стену — сама папка (правка автора 10.11).
    useGame.getState().addFound(r.released, '29', []);
    // Список материалов — уже с описью, что только что пришла (снимок до addFound её не знает).
    const g = useGame.getState();
    const id = listingOf(orig.id, g.materials);
    if (!id) return;
    const text = g.materials.find((m) => m.id === id)?.body ?? '';
    const t = `${orig.id}/${first}`;
    const code = coverCode(text, first);
    g.updateState((s) => ({ ...s, taken: [...(s.taken ?? []), t] }));
    useGame.getState().addFound([], '29', [folderItemId(t)]);
    if (useGame.getState().placed)
      useGame.setState((st) => ({
        placed: st.placed && { ...st.placed, text: `Папка ${code ?? ''}` },
      }));
    setPage((p) => Math.min(p, Math.max(0, n - 1)));
    afterLeaving(() => setFolder({ code, listing: id, n: first }));
  };
  // Листы текстом вниз (П-05, 19–24) — перевернуть: движок отдаёт их лицом вверх (L957).
  const turnOver = async () => {
    if (!orig) return;
    const r = await postAction('ОСМОТР', orig.id, 'перевернуть нижние листы').catch(() => null);
    if (!r || r.quiet || !r.released.length) return;
    // Перевёрнутые лежат лицом вверх — пачку листают дальше (правка автора 10.11).
    const first = now?.orig[page] ?? page + 1;
    useGame
      .getState()
      .updateState((s) => ({ ...s, turned: [...(s.turned ?? []), `${orig.id}/${first}`] }));
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
              // Папка — отдельный материал (DS-A, A-263); папки П-09 — пока выдержкой из описи.
              const doc = docOf(`${orig.id}/${folder.n}`, useGame.getState().materials);
              if (doc) {
                useGame.getState().openViewer(doc);
                return;
              }
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

/**
 * Ноутбук (47) и телефон (48) — работа прямо на модели (WM-B, автор 17.11): щелчок по экрану —
 * вещь встаёт экраном к игроку, камера подъезжает, экран живой (разметка на плоскости экрана).
 * Esc, щелчок мимо или правая кнопка мимо экрана — снова вещь в руках.
 */
function ScreenDevice({ id, title }: { id: '47' | '48'; title: string }) {
  const laptop = id === '47';
  const on = useGame((g) => (laptop ? !!g.laptop : !!g.phone));
  const g = useGame.getState;
  return (
    <Held3D
      mode="free"
      half={[1.6, 1.2]}
      label={title}
      onClose={() => g().hold(null)}
      focus={on ? (laptop ? LAPTOP_FOCUS : PHONE_FOCUS) : null}
      onUnfocus={() => (laptop ? g().closeLaptop() : g().closePhone())}
      screen={on ? laptop ? <LaptopLive /> : <PhoneLive /> : null}
      screenW={laptop ? LAPTOP_PX[0] : PHONE_PX[0]}
      screenMenu
    >
      <Device
        id={id}
        tag={`Изъято · ${id}`}
        focused={on}
        onUse={() => (laptop ? g().openLaptop() : g().openPhone())}
      />
    </Held3D>
  );
}
/**
 * Камера инженера (24, A-268) — как телефон: вертят в руках, щелчок по экрану — вплотную, экран
 * живой, кнопки на корпусе; стрелки и Enter — те же кнопки с клавиатуры. Отложили — просмотр с
 * начала (кадр остаётся).
 */
function CameraHeld({ title }: { title: string }) {
  const on = useGame((g) => g.camera);
  const g = useGame.getState;
  useEffect(() => stopCamera, []);
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
      const c = useCamera.getState();
      const act: Record<string, () => void> = {
        ArrowLeft: c.left,
        ArrowRight: c.right,
        ArrowUp: c.up,
        ArrowDown: c.down,
        Enter: c.set,
      };
      const fn = act[e.key];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on]);
  return (
    <Held3D
      mode="free"
      half={[1.6, 1.2]}
      label={title}
      onClose={() => g().hold(null)}
      focus={on ? CAMERA_FOCUS : null}
      onUnfocus={() => {
        stopCamera();
        g().closeCamera();
      }}
      screen={on ? <CameraScreen /> : null}
      screenW={CAMERA_PX[0]}
      screenMenu
      extra={on ? <CameraSheet /> : null}
    >
      <CameraDevice tag="Изъято · 24" on={on} onUse={() => g().openCamera()} />
    </Held3D>
  );
}

/** Ноутбук: экран почти во весь кадр. */
const LAPTOP_FOCUS: Focus = { name: 'laptop', track: true, fill: [0.95, 0.92] };
/** Телефон: виден целиком, с кнопкой «домой» (экран — 1,2 из 1,9 высоты корпуса). */
const PHONE_FOCUS: Focus = { name: 'phone', track: true, fill: [0.9, (1.2 / 1.9) * 0.92] };

/**
 * Стойка радиопоста (50, A-267) — работа прямо на модели (автор 12.11): щелчок по регистратору
 * или приёмнику — вплотную к нему; Esc или щелчок мимо — снова стойка в руках; ещё раз — положить.
 */
function RadioHeld({ title, close }: { title: string; close: () => void }) {
  const [focus, setFocus] = useState<RadioPart | null>(null);
  const unfocus = () => {
    useRecorder.getState().setLabeling(null);
    setFocus(null);
  };
  const body = useGame((g) => g.materials.find((m) => m.id === '50')?.body ?? '');
  useEffect(() => {
    useRecorder.getState().init(body);
    return stopRecorder;
  }, [body]);
  // Стрелки клавиатуры у приёмника — ручка настройки (без мыши, DA-2).
  useEffect(() => {
    if (focus !== 'receiver') return;
    const onKey = (e: KeyboardEvent) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      useRecorder.getState().turnKnob(d * (e.shiftKey ? 0.02 : 0.004));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus]);
  return (
    <Held3D
      mode="free"
      half={[1.6, 1.2]}
      label={title}
      onClose={close}
      focus={focus ? RADIO_FOCUS[focus] : null}
      onUnfocus={unfocus}
      screen={focus === 'recorder' ? <RecorderLcd /> : null}
      screenW={SCREEN_PX}
      extra={focus ? <RadioSheet part={focus} /> : null}
    >
      <RadioStand tag="Изъято · 50" focus={focus} onFocus={setFocus} onUnfocus={unfocus} />
    </Held3D>
  );
}

const NONE: readonly string[] = [];
/** Пересканы листов 19–24 П-05 лицом вверх. */
const RESCANS_ID = 'L957';

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
              // К стене — как со стола (ZM-B, правка автора 10.11: прежний наезд на ярлык группы
              // шёл мимо этого вида); новое на стене светится.
              useGame.getState().setView('wall');
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
