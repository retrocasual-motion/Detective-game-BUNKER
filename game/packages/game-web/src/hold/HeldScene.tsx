import {
  CONTAINERS,
  type ContainerId,
  containerContents,
  DEVICE_IDS,
  FOLDER_IDS,
  folderItemId,
  openedOf,
  SERVER_DISC_ID,
  SPILL_CONTAINERS,
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
import { Box, CaseFolder, Device, Envelope } from './shapes.tsx';
import { BagInHands, bagLabel, inventoryRows, Unpacked, type UnpackItem } from './unpack.tsx';

/** Вещь в руках со сценой three.js — отдельный кусок сборки (грузится, когда вещь взяли). */
/**
 * Вскрытое, что ещё в руках, пока под ним раскладывается стол (папка, короб вещдоков): держим вид
 * «в руках», а не «вскрыто», чтобы картинка не сменилась до ухода.
 */
let spilling: ContainerId | null = null;
/** Сколько вскрытое ещё в руках, пока стол раскладывает листы под ним, мс. */
const SPILL_HIDE_MS = 400;

export default function HeldThing({ held }: { held: Held }) {
  const materials = useGame((g) => g.materials);
  const openedIds = useGame((g) => (g.state ? openedOf(g.state) : NONE));
  const close = () => useGame.getState().hold(null);
  const titles = new Map(materials.map((m) => [m.id, m.title]));

  if (held.type === 'bag') return <BagHeld id={held.id} inBox={!!held.inBox} />;

  if (held.type === 'container') {
    const c = CONTAINERS.find((x) => x.id === held.id);
    if (!c) return null;
    const inside = containerContents(c).filter((m) => titles.has(m));
    const box = held.id === 'personal' || held.id === 'bank' || held.id === 'seized';
    const folder = FOLDER_IDS.has(held.id);
    if (openedIds.includes(held.id) && spilling !== held.id)
      return <Opened key={`opened-${held.id}`} id={held.id} inside={inside} box={box} />;
    const items = inside.map((m) => ({ id: m, title: short(titles.get(m) ?? '') }));
    // Вскрыли конверт архива (DC-B, автор 25.11; вместо OP-D): из рук — содержимое стопкой на стол,
    // читать — щелчком по стопке. Коробки — как прежде: вскрытая в руках (EB-A).
    const open = () => {
      // Папка (автор 27.11): открыл — сразу чтение её стопки с верхнего листа («N из M», стрелки).
      // Папка остаётся в руках под листом, пока лист открыт; листы тем временем уже легли на стол.
      // Закрыл лист — папки в руках нет, стол разложен (раскладку игрок не видит).
      if (folder) {
        const id = held.id;
        spilling = id;
        const g = useGame.getState();
        g.openContainer(id);
        g.readFolder(id);
        const done = () => {
          spilling = null;
          const now = useGame.getState();
          if (now.held?.type === 'container' && now.held.id === id) now.hold(null);
        };
        if (!useGame.getState().viewerId) {
          // Читать нечего (все листы уже вынуты) — как прежде: стол под папкой, потом из рук.
          setTimeout(() => afterLeaving(done), SPILL_HIDE_MS);
          return;
        }
        const stop = useGame.subscribe((s) => {
          if (s.viewerId) return;
          stop();
          done();
        });
        return;
      }
      // Папка и короб вещдоков (автор 26.11: «мы это не должны видеть»): листы и вещи ложатся на стол,
      // пока вскрытое ещё в руках, — и только потом оно уходит из рук: под ним уже готовый стол, без
      // пустой папки и без листов, выскакивающих на место.
      if (SPILL_CONTAINERS.has(held.id)) {
        spilling = held.id;
        useGame.getState().openContainer(held.id);
        setTimeout(
          () =>
            afterLeaving(() => {
              spilling = null;
              useGame.getState().hold(null);
            }),
          SPILL_HIDE_MS,
        );
        return;
      }
      afterLeaving(() => useGame.getState().openContainer(held.id));
    };
    return (
      <Held3D
        key={`sealed-${held.id}`}
        mode={box ? 'free' : 'flip'}
        half={[1.6, 1.2]}
        label={
          held.id === 'seized'
            ? `Короб вещдоков «${c.label}»`
            : box
              ? `Коробка «${c.label}»`
              : folder
                ? `Папка «${c.label}»`
                : `Конверт «${c.label}»`
        }
        onClose={close}
      >
        {held.id === 'bank' ? (
          // Коробка вещдоков из банка (A-272, L460): бирка бюро, ячейка вскрыта в банке.
          <Box
            items={items}
            onOpen={open}
            title="Aspen Bank"
            note="Ячейка № 845 · вскрыта 17.11.2009"
          />
        ) : held.id === 'seized' ? (
          // Короб вещдоков (автор 25.11, вместо пакета): ленту с крышкой тянут вверх.
          <Box items={items} onOpen={open} title="Изъятое" note="При осмотре места · 5 предметов" />
        ) : box ? (
          <Box items={items} onOpen={open} />
        ) : folder ? (
          <CaseFolder title={c.label} items={items} onOpen={open} />
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

/**
 * Вскрыто (OP-D, EB-A — автор 22.11, на пробу): конверт или коробка в руках, содержимое стоит
 * внутри на ребре. Щелчок по ярлыку — лист читают (закрыли — снова конверт в руках), пакет
 * личных вещей — в руки. Положили — всё на стене группой под ярлыком (A-260), со свечением.
 * Изъятые устройства в конверте не стоят: они на столе (RS-A).
 */
function Opened({ id, inside, box }: { id: ContainerId; inside: string[]; box: boolean }) {
  const c = CONTAINERS.find((x) => x.id === id);
  const materials = useGame((g) => g.materials);
  const items = useMemo<UnpackItem[]>(
    () =>
      inside
        .filter((m) => !DEVICE_IDS.has(m))
        .flatMap((m) => {
          const mat = materials.find((x) => x.id === m);
          if (!mat) return [];
          return [
            {
              id: m,
              title: short(mat.title),
              kind: mat.kind,
              ...(mat.kind === 'bag' ? { bag: bagLabel(mat.title, mat.body) } : {}),
            },
          ];
        }),
    [inside, materials],
  );
  if (!c) return null;
  const devices = inside.some((m) => DEVICE_IDS.has(m));
  const back = { type: 'container', id } as const;
  return (
    <Held3D
      mode="free"
      half={[1.6, 1.2]}
      label={`${box ? 'Коробка' : 'Конверт'} «${c.label}» · вскрыт${box ? 'а' : ''}`}
      caption={devices ? 'Изъятые вещи — на столе' : undefined}
      onClose={() => useGame.getState().hold(null)}
    >
      <Unpacked
        vessel={box ? 'box' : 'envelope'}
        title={c.label}
        items={items}
        onPick={(it) =>
          afterLeaving(() => {
            const g = useGame.getState();
            if (it.kind === 'bag') g.hold({ type: 'bag', id: it.id, inBox: true });
            else g.readFrom(it.id, back);
          })
        }
      />
    </Held3D>
  );
}

/**
 * Пакет личных вещей в руках (EB-A): ярлык «чьи и откуда» из заголовка описи, сквозь плёнку —
 * вещи по строкам описи. Щелчок — опись и вещи листом (блокнот, записка, обгоревший лист…);
 * закрыли — снова пакет. Положили — назад в коробку (если взят из неё) или на место.
 */
function BagHeld({ id, inBox }: { id: string; inBox: boolean }) {
  const mat = useGame((g) => g.materials.find((m) => m.id === id));
  const g = useGame.getState;
  const label = useMemo(() => (mat ? bagLabel(mat.title, mat.body) : null), [mat]);
  const rows = useMemo(() => (mat ? inventoryRows(mat.body) : []), [mat]);
  if (!mat || !label) return null;
  return (
    <Held3D
      mode="free"
      half={[1.6, 1.2]}
      label={`Пакет · ${mat.title}`}
      onClose={() => g().hold(inBox ? { type: 'container', id: 'personal' } : null)}
    >
      <BagInHands
        label={label}
        rows={rows}
        onOpen={() => afterLeaving(() => g().readFrom(id, { type: 'bag', id, inBox }))}
      />
    </Held3D>
  );
}

/** На конверте пишут кратко: до скобки или «;», не длиннее 40 знаков (по целым словам). */
export const short = (title: string) => {
  const t = title.split(/[(;]/)[0]?.trim() ?? title;
  if (t.length <= 40) return t;
  return `${t.slice(0, 40).replace(/\s+\S*$/, '')}…`;
};
