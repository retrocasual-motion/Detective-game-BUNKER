import type { PcWindow } from '@bunker/shared';
import { useEffect, useRef, useState } from 'react';
import { ddmmyyyy, gameNow, hhmm } from '../clock.ts';
import { useFreeArea, useSelectionPetition } from '../device/deviceView.tsx';
import { FileIcon } from '../laptop/apps.tsx';
import { DesktopIcon, gridAt, settle, snapToGrid, Window } from '../laptop/Desktop.tsx';
import '../laptop/laptop.css';
import { useGame } from '../store.ts';
import {
  ArchiveBox,
  DocWindow,
  IncomingFolder,
  Mail,
  PasswordBox,
  PcBrowser,
  Terminal,
} from './apps.tsx';
import type { Incoming } from './content.ts';
import './pc.css';

/** Экран монитора, логические px. */
const SCREEN_W = 1280;
const SCREEN_H = 800;
const BEZEL = 30;

type Kind = 'incoming' | 'terminal' | 'browser' | 'doc' | 'mbx' | 'enc';
interface Win {
  id: string;
  kind: Kind;
  /** Документ (doc), вкладка терминала (terminal) — материал. */
  ref?: string;
}
interface Placed {
  win: Win;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  min: boolean;
  max: boolean;
}

const ICONS: { key: string; name: string; type: string; win: Win }[] = [
  {
    key: 'incoming',
    name: 'Поступления',
    type: 'folder',
    win: { id: 'incoming', kind: 'incoming' },
  },
  {
    key: 'terminal',
    name: 'Экспорт сервера VL-31',
    type: 'server',
    win: { id: 'terminal', kind: 'terminal' },
  },
  { key: 'browser', name: 'Браузер', type: 'browser', win: { id: 'browser', kind: 'browser' } },
];

/**
 * Компьютер следователя (4c-3; решения автора 11.11 — CO-A, DI-A, TM-A; вид — полицейский):
 * рабочее место специалиста Окружного бюро расследований. Та же мини-ОС, что у ноутбука, —
 * свой рабочий стол: герб бюро на обоях, служебная полоса, «Поступления», «Экспорт сервера
 * VL-31», браузер. Окна и значки сохраняются (`state.pc`). Esc или щелчок мимо монитора —
 * отойти от компьютера.
 */
export function PcView() {
  const open = useGame((g) => g.computerOpen);
  const material = useGame((g) => g.pcMaterial);
  const area = useFreeArea();
  const scale = Math.min(
    (area.width - 40) / (SCREEN_W + BEZEL * 2),
    (area.height - 40) / (SCREEN_H + BEZEL * 2 + 18),
  );
  const { onUp, button } = useSelectionPetition('pc-to-petition');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useGame.getState().setComputerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <section className="computer pc-view" data-testid="computer" aria-label="Компьютер следователя">
      <button
        type="button"
        className="laptop-backdrop"
        aria-label="Отойти от компьютера"
        data-testid="computer-close"
        onClick={() => useGame.getState().setComputerOpen(false)}
      />
      <div
        className="pc-monitor"
        style={{
          width: SCREEN_W + BEZEL * 2,
          height: SCREEN_H + BEZEL * 2 + 18,
          left: area.center || undefined,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: выделение текста мышью на экране */}
        <div
          className="lap-screen pc-screen"
          style={{ width: SCREEN_W, height: SCREEN_H }}
          onMouseUp={onUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          <PcDesktop material={material} />
        </div>
        <div className="pc-monitor-chin" aria-hidden>
          <span className="pc-power" />
        </div>
      </div>
      {button}
    </section>
  );
}

/** Окно — в сохранение и обратно. */
const toSaved = (p: Placed): PcWindow => ({
  id: p.win.id,
  kind: p.win.kind,
  path: p.win.ref,
  x: p.x,
  y: p.y,
  w: p.w,
  h: p.h,
  z: p.z,
  min: p.min,
  max: p.max,
});
const fromSaved = (w: PcWindow): Placed => ({
  win: { id: w.id, kind: w.kind as Kind, ref: w.path },
  x: w.x,
  y: w.y,
  w: w.w,
  h: w.h,
  z: w.z,
  min: w.min,
  max: w.max,
});

function PcDesktop({ material }: { material: string | null }) {
  const saved = useGame.getState().state?.pc;
  const [wins, setWins] = useState<Placed[]>(() => (saved?.windows ?? []).map(fromSaved));
  const [iconPos, setIconPos] = useState<Record<string, { x: number; y: number }>>(() =>
    settle(
      ICONS.map((i) => i.key),
      saved?.icons ?? {},
    ),
  );
  const [selIcon, setSelIcon] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const z = useRef(wins.reduce((m, p) => Math.max(m, p.z), 1));
  const materials = useGame((g) => g.materials);
  const has = (id: string) => materials.some((m) => m.id === id);
  const title = (id: string) => materials.find((m) => m.id === id)?.title ?? id;
  const started = useGame((g) => g.state?.started);
  const [now, setNow] = useState(() => gameNow(started));
  useEffect(() => {
    const t = setInterval(() => setNow(gameNow(started)), 10_000);
    return () => clearInterval(t);
  }, [started]);
  // Значки и окна — в сохранение с задержкой (перетаскивание не пишет на каждый сдвиг); отошли
  // от компьютера раньше — дописываем сразу.
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    const save = () => {
      pending.current = null;
      useGame.getState().updateState((st) => ({
        ...st,
        pc: { icons: iconPos, windows: wins.map(toSaved) },
      }));
    };
    pending.current = save;
    const t = setTimeout(save, 400);
    return () => clearTimeout(t);
  }, [wins, iconPos]);
  useEffect(() => () => pending.current?.(), []);

  const openWin = (win: Win) => {
    setStartOpen(false);
    setWins((list) => {
      z.current += 1;
      const same = list.find((p) => p.win.id === win.id);
      if (same) return list.map((p) => (p === same ? { ...p, win, z: z.current, min: false } : p));
      const k = list.length % 6;
      // Пароль — маленьким окном; открытый ящик или архив — обычным.
      const small = (win.kind === 'mbx' && !has('L453')) || (win.kind === 'enc' && !has('L736'));
      return [
        ...list,
        {
          win,
          x: 170 + k * 28,
          y: 60 + k * 26,
          w: small ? 460 : win.kind === 'terminal' || win.kind === 'mbx' ? 1000 : 780,
          h: small ? 300 : 600,
          z: z.current,
          min: false,
          max: false,
        },
      ];
    });
  };
  const openIncoming = (it: Incoming) => {
    if (it.kind === 'letter') openWin({ id: `doc:${it.material}`, kind: 'doc', ref: it.material });
    else if (it.kind === 'server') openWin({ id: 'terminal', kind: 'terminal', ref: it.material });
    else openWin({ id: it.kind, kind: it.kind });
  };
  // Из поиска — сразу туда, где лежит материал.
  // biome-ignore lint/correctness/useExhaustiveDependencies: только при входе с материалом
  useEffect(() => {
    if (!material) return;
    if (/^L(21[45]|38[789]|390)$/.test(material))
      openWin({ id: 'terminal', kind: 'terminal', ref: material });
    else if (material === 'L453') openWin({ id: 'mbx', kind: 'mbx' });
    else if (
      /^L73[678]$/.test(material) ||
      /^L83\d$/.test(material) ||
      material === 'L452' ||
      material === 'L735'
    )
      openWin({ id: `doc:${material}`, kind: 'doc', ref: material });
  }, [material]);

  const close = (id: string) => setWins((l) => l.filter((p) => p.win.id !== id));
  const patch = (id: string, d: Partial<Placed>) =>
    setWins((l) => l.map((p) => (p.win.id === id ? { ...p, ...d } : p)));
  const front = (id: string) => {
    z.current += 1;
    patch(id, { z: z.current, min: false });
  };
  const top = wins.reduce((m, p) => (!p.min && p.z > m ? p.z : m), 0);
  const winTitle = (w: Win) =>
    w.kind === 'incoming'
      ? 'Поступления'
      : w.kind === 'terminal'
        ? 'Экспорт сервера VL-31'
        : w.kind === 'browser'
          ? 'Браузер'
          : w.kind === 'mbx'
            ? has('L453')
              ? 'Почта — экспорт ящика e.pierce.uk@mailbridge.net'
              : 'mailbox_export_e.pierce.uk.mbx'
            : w.kind === 'enc'
              ? 'VL-31_project_archive.enc'
              : title(w.ref ?? '');
  const winIcon = (w: Win) =>
    w.kind === 'incoming'
      ? 'folder'
      : w.kind === 'terminal'
        ? 'server'
        : w.kind === 'browser'
          ? 'browser'
          : w.kind === 'doc'
            ? 'doc'
            : 'lock';

  return (
    <div className="lap-desktop pc-desktop" data-testid="pc-desktop">
      <div
        className="lap-wall pc-wall"
        onPointerDown={() => {
          setSelIcon(null);
          setStartOpen(false);
        }}
      >
        <BureauSeal />
      </div>
      <div className="pc-banner" aria-hidden>
        <span>ОКРУЖНОЕ БЮРО РАССЛЕДОВАНИЙ · ОКРУГ СИЛЬВЕР-РИДЖ</span>
        <span>Рабочее место специалиста · дело № 09-1128</span>
        <span className="pc-banner-dsp">ДЛЯ СЛУЖЕБНОГО ПОЛЬЗОВАНИЯ</span>
      </div>
      <div className="lap-icons pc-icons">
        {ICONS.map((i, k) => (
          <DesktopIcon
            key={i.key}
            name={i.name}
            type={i.type}
            at={iconPos[i.key] ?? gridAt(k)}
            selected={selIcon === i.key}
            onSelect={() => setSelIcon(i.key)}
            onOpen={() => openWin(i.win)}
            onMove={(at) => setIconPos((m) => ({ ...m, [i.key]: at }))}
            onDrop={() =>
              setIconPos((m) => {
                const taken = ICONS.map((o, j) =>
                  o.key === i.key ? null : (m[o.key] ?? gridAt(j)),
                ).filter((p): p is { x: number; y: number } => p !== null);
                return { ...m, [i.key]: snapToGrid(m[i.key] ?? gridAt(k), taken) };
              })
            }
          />
        ))}
      </div>

      {wins.map((p) =>
        p.min ? null : (
          <Window
            key={p.win.id}
            p={p}
            active={p.z === top}
            title={winTitle(p.win)}
            icon={winIcon(p.win)}
            onFront={() => front(p.win.id)}
            onMove={(x, y) => patch(p.win.id, { x, y })}
            onMin={() => patch(p.win.id, { min: true })}
            onMax={() => patch(p.win.id, { max: !p.max })}
            onClose={() => close(p.win.id)}
          >
            {p.win.kind === 'incoming' ? (
              <IncomingFolder open={openIncoming} />
            ) : p.win.kind === 'terminal' ? (
              <Terminal key={p.win.ref ?? ''} start={p.win.ref} />
            ) : p.win.kind === 'browser' ? (
              <PcBrowser />
            ) : p.win.kind === 'doc' ? (
              <DocWindow id={p.win.ref ?? ''} />
            ) : p.win.kind === 'mbx' ? (
              has('L453') ? (
                <Mail />
              ) : (
                <PasswordBox
                  label="Пароль ящика"
                  field="экспорт ящика"
                  file="mailbox_export_e.pierce.uk.mbx"
                  open={false}
                  onOpen={() => patch(p.win.id, { w: 900, h: 560 })}
                />
              )
            ) : has('L736') ? (
              <ArchiveBox openDoc={(id) => openWin({ id: `doc:${id}`, kind: 'doc', ref: id })} />
            ) : (
              <PasswordBox
                label="Пароль архива"
                field="архив проекта"
                file="VL-31_project_archive.enc"
                open={false}
                onOpen={() => patch(p.win.id, { w: 620, h: 360 })}
              />
            )}
          </Window>
        ),
      )}

      {startOpen && (
        <div className="lap-start pc-start" data-testid="pc-start">
          <div className="lap-start-user pc-start-user">Специалист · дело № 09-1128</div>
          <div className="lap-start-cols">
            <div className="lap-start-left">
              {ICONS.map((i) => (
                <button key={i.key} type="button" onClick={() => openWin(i.win)}>
                  <FileIcon type={i.type} size={24} /> {i.name}
                </button>
              ))}
            </div>
          </div>
          <div className="lap-start-foot">
            <button type="button" onClick={() => useGame.getState().setComputerOpen(false)}>
              Отойти от компьютера
            </button>
          </div>
        </div>
      )}

      <div className="lap-taskbar pc-taskbar">
        <button
          type="button"
          className={`lap-startbtn pc-startbtn${startOpen ? ' lap-startbtn-on' : ''}`}
          data-testid="pc-startbtn"
          onClick={() => setStartOpen((o) => !o)}
        >
          ★ Бюро
        </button>
        <div className="lap-tasks">
          {wins.map((p) => (
            <button
              key={p.win.id}
              type="button"
              className={!p.min && p.z === top ? 'lap-task-on' : undefined}
              onClick={() =>
                p.min || p.z !== top ? front(p.win.id) : patch(p.win.id, { min: true })
              }
            >
              <FileIcon type={winIcon(p.win)} size={16} />
              <span>{winTitle(p.win)}</span>
            </button>
          ))}
        </div>
        <div className="lap-tray" data-testid="pc-clock">
          <span>{hhmm(now)}</span>
          <span className="lap-tray-date">{ddmmyyyy(now)}</span>
        </div>
      </div>
    </div>
  );
}

/** Герб бюро на обоях: щит со звездой в кольце с названием (своё, без настоящих эмблем). */
function BureauSeal() {
  return (
    <svg className="pc-seal" viewBox="0 0 200 200" aria-hidden>
      <defs>
        <path id="pc-ring" d="M100 100 m-74 0 a74 74 0 1 1 148 0 a74 74 0 1 1 -148 0" />
      </defs>
      <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="4" />
      <circle cx="100" cy="100" r="60" fill="none" stroke="currentColor" strokeWidth="2" />
      <text fontSize="13" fontWeight="700" letterSpacing="2" fill="currentColor">
        <textPath href="#pc-ring" startOffset="0">
          ОКРУЖНОЕ БЮРО РАССЛЕДОВАНИЙ · СИЛЬВЕР-РИДЖ ·
        </textPath>
      </text>
      <path
        d="M100 52 L140 66 L136 112 Q130 138 100 152 Q70 138 64 112 L60 66 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        d="M100 76 l7 15 16 2 -12 11 3 16 -14 -8 -14 8 3 -16 -12 -11 16 -2 Z"
        fill="currentColor"
      />
    </svg>
  );
}
