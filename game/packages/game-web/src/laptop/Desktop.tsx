import type { LapWindow } from '@bunker/shared';
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { ddmmyyyy, gameNow, hhmm } from '../clock.ts';
import { useGame } from '../store.ts';
import {
  Browser,
  DocView,
  Explorer,
  FileIcon,
  Notepad,
  Player,
  Printer,
  Properties,
  SheetView,
} from './apps.tsx';
import { fileOfMaterial, findFile, type LapFile, type Laptop } from './files.ts';

/**
 * Рабочий стол ноутбука (4c-1, UI-A): обои со знаком VAULTLINE, значки слева столбцом (только из
 * канона), окна с заголовком и тремя кнопками, панель задач с меню, кнопками окон и часами
 * (CL-D: время игрока, дата игры). Значки двигают куда угодно; окна и места значков
 * сохраняются в деле (правка автора 10.11): вышел из ноутбука, вернулся — всё как было.
 */

type Win =
  | { id: string; kind: 'folder'; path: string }
  | { id: string; kind: 'file'; file: LapFile }
  | { id: string; kind: 'props'; file: LapFile }
  | { id: string; kind: 'browser'; saved?: LapFile; url?: string }
  | { id: string; kind: 'printer' };

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

const APP: Record<string, string> = {
  txt: 'Блокнот',
  doc: 'Документ',
  xls: 'Таблица',
  wav: 'Проигрыватель',
  htm: 'Браузер',
};

const titleOf = (w: Win) =>
  w.kind === 'folder'
    ? w.path || 'Рабочий стол'
    : w.kind === 'file'
      ? `${w.file.name} — ${APP[w.file.type] ?? 'Файл'}`
      : w.kind === 'props'
        ? `Свойства: ${w.file.name}`
        : w.kind === 'browser'
          ? w.saved
            ? `${w.saved.name} — Браузер`
            : 'Браузер'
          : 'Принтер кабинета руководителя';

const iconOf = (w: Win) =>
  w.kind === 'folder'
    ? w.path === 'Корзина'
      ? 'trash'
      : 'folder'
    : w.kind === 'file' || w.kind === 'props'
      ? w.file.type
      : w.kind;

/** Окно — в сохранение: вид и путь (или адрес), место и размер. */
const toSaved = (p: Placed): LapWindow => {
  const { win } = p;
  const base = {
    id: win.id,
    kind: win.kind,
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    z: p.z,
    min: p.min,
    max: p.max,
  };
  if (win.kind === 'folder') return { ...base, path: win.path };
  if (win.kind === 'file' || win.kind === 'props') return { ...base, path: win.file.path };
  if (win.kind === 'browser') return { ...base, path: win.saved?.path, url: win.url };
  return base;
};

/** Окно из сохранения; файла больше нет — окна нет. */
function fromSaved(w: LapWindow, lap: Laptop): Placed | null {
  const at = { x: w.x, y: w.y, w: w.w, h: w.h, z: w.z, min: w.min, max: w.max };
  if (w.kind === 'folder') return { ...at, win: { id: w.id, kind: 'folder', path: w.path ?? '' } };
  if (w.kind === 'printer') return { ...at, win: { id: w.id, kind: 'printer' } };
  if (w.kind === 'browser') {
    const saved = w.path ? (findFile(lap, w.path) ?? undefined) : undefined;
    return { ...at, win: { id: w.id, kind: 'browser', saved, url: w.url } };
  }
  const file = w.path ? findFile(lap, w.path) : null;
  return file ? { ...at, win: { id: w.id, kind: w.kind, file } } : null;
}

/** Сетка значков по умолчанию: столбцами сверху вниз, слева направо (px экрана ноутбука). */
const ICON_W = 100;
const ICON_H = 80;
const ICONS_PER_COL = 8;
const GRID_COLS = 12;
const GRID_ROWS = 9;
const cellAt = (c: number, r: number) => ({ x: 12 + c * ICON_W, y: 10 + r * ICON_H });

/**
 * Невидимая сетка рабочего стола (правка автора 10.11, как в настоящих системах): отпущенный
 * значок встаёт в ближайшую клетку; занята — в ближайшую свободную.
 */
function snapToGrid(at: { x: number; y: number }, taken: { x: number; y: number }[]) {
  const busy = new Set(
    taken.map((p) => `${Math.round((p.x - 12) / ICON_W)}:${Math.round((p.y - 10) / ICON_H)}`),
  );
  const want = { c: (at.x - 12) / ICON_W, r: (at.y - 10) / ICON_H };
  let best: { x: number; y: number } | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (let c = 0; c < GRID_COLS; c++)
    for (let r = 0; r < GRID_ROWS; r++) {
      if (busy.has(`${c}:${r}`)) continue;
      const d = (c - want.c) ** 2 + (r - want.r) ** 2;
      if (d < bestD) {
        bestD = d;
        best = cellAt(c, r);
      }
    }
  return best ?? cellAt(0, 0);
}

const gridAt = (k: number) => ({
  x: 12 + Math.floor(k / ICONS_PER_COL) * ICON_W,
  y: 10 + (k % ICONS_PER_COL) * ICON_H,
});

export function Desktop({
  lap,
  material,
  onLogout,
}: {
  lap: Laptop;
  /** Открыть файл из этого материала сразу (поиск). */
  material: string | null;
  onLogout: () => void;
}) {
  const saved = useGame.getState().state?.laptop;
  const [wins, setWins] = useState<Placed[]>(() =>
    (saved?.windows ?? []).flatMap((w) => fromSaved(w, lap) ?? []),
  );
  const [iconPos, setIconPos] = useState<Record<string, { x: number; y: number }>>(
    () => saved?.icons ?? {},
  );
  const [selIcon, setSelIcon] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const z = useRef(wins.reduce((m, p) => Math.max(m, p.z), 1));
  // В сохранение — не на каждом шаге перетаскивания, а когда всё замерло.
  useEffect(() => {
    const t = setTimeout(() => {
      useGame.getState().updateState((st) => ({
        ...st,
        laptop: { icons: iconPos, windows: wins.map(toSaved) },
      }));
    }, 400);
    return () => clearTimeout(t);
  }, [wins, iconPos]);
  const started = useGame((g) => g.state?.started);
  const [now, setNow] = useState(() => gameNow(started));
  useEffect(() => {
    const t = setInterval(() => setNow(gameNow(started)), 10_000);
    return () => clearInterval(t);
  }, [started]);

  const open = (win: Win) => {
    setStartOpen(false);
    setWins((list) => {
      const same = list.find((p) => p.win.id === win.id);
      z.current += 1;
      if (same) return list.map((p) => (p === same ? { ...p, z: z.current, min: false } : p));
      const k = list.length % 6;
      const big = win.kind !== 'props';
      return [
        ...list,
        {
          win,
          x: 150 + k * 28,
          y: 40 + k * 26,
          w: big ? 760 : 340,
          h: big ? 520 : 300,
          z: z.current,
          min: false,
          max: false,
        },
      ];
    });
  };
  const openFile = (f: LapFile) => {
    if (f.type === 'folder') open({ id: `dir:${f.path}`, kind: 'folder', path: f.path });
    else if (f.type === 'htm') open({ id: `web:${f.path}`, kind: 'browser', saved: f });
    else open({ id: `file:${f.path}`, kind: 'file', file: f });
  };
  const close = (id: string) => setWins((l) => l.filter((p) => p.win.id !== id));
  const patch = (id: string, d: Partial<Placed>) =>
    setWins((l) => l.map((p) => (p.win.id === id ? { ...p, ...d } : p)));
  const front = (id: string) => {
    z.current += 1;
    patch(id, { z: z.current, min: false });
  };

  // Из поиска — сразу нужный файл.
  // biome-ignore lint/correctness/useExhaustiveDependencies: только при входе с материалом
  useEffect(() => {
    if (!material) return;
    const f = fileOfMaterial(lap, material);
    if (f) openFile(f);
  }, [material]);

  const icons: { key: string; name: string; type: string; act: () => void }[] = [
    ...lap.desktop.map((f) => ({
      key: f.path,
      name: f.name,
      type: f.type,
      act: () => openFile(f),
    })),
    {
      key: 'Корзина',
      name: 'Корзина',
      type: 'trash',
      act: () => open({ id: 'dir:Корзина', kind: 'folder', path: 'Корзина' }),
    },
    {
      key: 'Браузер',
      name: 'Браузер',
      type: 'browser',
      act: () => open({ id: 'browser', kind: 'browser' }),
    },
    {
      key: 'Принтер',
      name: 'Принтер',
      type: 'printer',
      act: () => open({ id: 'printer', kind: 'printer' }),
    },
  ];

  const top = wins.reduce((m, p) => (!p.min && p.z > m ? p.z : m), 0);

  return (
    <div className="lap-desktop" data-testid="laptop-desktop">
      <div
        className="lap-wall"
        onPointerDown={() => {
          setSelIcon(null);
          setStartOpen(false);
        }}
      >
        {/* Знак VAULTLINE — «три горизонтальные полосы, вписанные в арку» (сайт, L101). */}
        <div className="lap-wall-mark">
          <svg viewBox="0 0 120 120" aria-hidden>
            <defs>
              <clipPath id="lap-arch">
                <path d="M14 112 V60 A46 46 0 0 1 106 60 V112 Z" />
              </clipPath>
            </defs>
            <path
              d="M14 112 V60 A46 46 0 0 1 106 60 V112"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
            />
            <g clipPath="url(#lap-arch)" fill="currentColor">
              <rect x="0" y="52" width="120" height="10" />
              <rect x="0" y="72" width="120" height="10" />
              <rect x="0" y="92" width="120" height="10" />
            </g>
          </svg>
          <span>VAULTLINE</span>
        </div>
      </div>
      <div className="lap-icons">
        {icons.map((i, k) => (
          <DesktopIcon
            key={i.key}
            name={i.name}
            type={i.type}
            at={iconPos[i.key] ?? gridAt(k)}
            selected={selIcon === i.key}
            onSelect={() => setSelIcon(i.key)}
            onOpen={i.act}
            onMove={(at) => setIconPos((m) => ({ ...m, [i.key]: at }))}
            onDrop={() =>
              setIconPos((m) => {
                const taken = icons
                  .map((o, j) => (o.key === i.key ? null : (m[o.key] ?? gridAt(j))))
                  .filter((p): p is { x: number; y: number } => p !== null);
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
            title={titleOf(p.win)}
            icon={iconOf(p.win)}
            onFront={() => front(p.win.id)}
            onMove={(x, y) => patch(p.win.id, { x, y })}
            onMin={() => patch(p.win.id, { min: true })}
            onMax={() => patch(p.win.id, { max: !p.max })}
            onClose={() => close(p.win.id)}
          >
            {p.win.kind === 'folder' ? (
              <Explorer
                lap={lap}
                path={p.win.path}
                go={(path) => {
                  const id = p.win.id;
                  setWins((l) =>
                    l.map((q) =>
                      q.win.id === id ? { ...q, win: { id: q.win.id, kind: 'folder', path } } : q,
                    ),
                  );
                }}
                open={openFile}
                props={(f) => open({ id: `props:${f.path}`, kind: 'props', file: f })}
              />
            ) : p.win.kind === 'file' ? (
              p.win.file.type === 'txt' ? (
                <Notepad f={p.win.file} />
              ) : p.win.file.type === 'xls' ? (
                <SheetView f={p.win.file} />
              ) : p.win.file.type === 'wav' ? (
                <Player f={p.win.file} />
              ) : (
                <DocView f={p.win.file} />
              )
            ) : p.win.kind === 'props' ? (
              <Properties f={p.win.file} />
            ) : p.win.kind === 'browser' ? (
              <Browser
                lap={lap}
                saved={p.win.saved}
                url={p.win.url}
                onUrl={(url) => {
                  const id = p.win.id;
                  setWins((l) =>
                    l.map((q) =>
                      q.win.id === id && q.win.kind === 'browser'
                        ? { ...q, win: { ...q.win, url } }
                        : q,
                    ),
                  );
                }}
              />
            ) : (
              <Printer lap={lap} />
            )}
          </Window>
        ),
      )}

      {startOpen && (
        // Меню в две колонки, как у систем тех лет: сверху — картинка и имя учётной записи,
        // слева — программы, справа — места, внизу — «Завершить сеанс».
        <div className="lap-start" data-testid="lap-start">
          <div className="lap-start-user">
            <span className="lap-start-pic" aria-hidden>
              <svg viewBox="0 0 100 100" aria-hidden>
                <path d="M-10 38 H62 V112" fill="none" stroke="#d9e2ee" strokeWidth="9" />
              </svg>
            </span>
            a.cole
          </div>
          <div className="lap-start-cols">
            <div className="lap-start-left">
              <button type="button" onClick={() => open({ id: 'browser', kind: 'browser' })}>
                <FileIcon type="browser" size={24} /> Браузер
              </button>
              <button type="button" onClick={() => open({ id: 'printer', kind: 'printer' })}>
                <FileIcon type="printer" size={24} /> Принтер
              </button>
            </div>
            <div className="lap-start-right">
              <button type="button" onClick={() => open({ id: 'dir:', kind: 'folder', path: '' })}>
                <FileIcon type="folder" size={20} /> Рабочий стол
              </button>
              <button
                type="button"
                onClick={() => open({ id: 'dir:Корзина', kind: 'folder', path: 'Корзина' })}
              >
                <FileIcon type="trash" size={20} /> Корзина
              </button>
            </div>
          </div>
          <div className="lap-start-foot">
            <button type="button" data-testid="lap-logout" onClick={onLogout}>
              Завершить сеанс
            </button>
          </div>
        </div>
      )}

      <div className="lap-taskbar">
        <button
          type="button"
          className={`lap-startbtn${startOpen ? ' lap-startbtn-on' : ''}`}
          data-testid="lap-startbtn"
          onClick={() => setStartOpen((o) => !o)}
        >
          Меню
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
              <FileIcon type={iconOf(p.win)} size={16} />
              <span>{titleOf(p.win)}</span>
            </button>
          ))}
        </div>
        <div className="lap-tray" data-testid="lap-clock" title={ddmmyyyy(now)}>
          <span>{hhmm(now)}</span>
          <span className="lap-tray-date">{ddmmyyyy(now)}</span>
        </div>
      </div>
    </div>
  );
}

/** Масштаб экрана ноутбука на окне игрока (экран вписан в окно). */
const screenScale = (el: Element) => {
  const screen = el.closest('.lap-screen') as HTMLElement | null;
  return screen ? screen.getBoundingClientRect().width / screen.offsetWidth : 1;
};

/** Значок на рабочем столе: щелчок — выделить, двойной — открыть, протянуть — переставить. */
function DesktopIcon({
  name,
  type,
  at,
  selected,
  onSelect,
  onOpen,
  onMove,
  onDrop,
}: {
  name: string;
  type: string;
  at: { x: number; y: number };
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onMove: (at: { x: number; y: number }) => void;
  onDrop: () => void;
}) {
  const drag = useRef<{
    sx: number;
    sy: number;
    x: number;
    y: number;
    scale: number;
    moved: boolean;
  } | null>(null);
  return (
    <button
      type="button"
      className={`lap-icon${selected ? ' lap-icon-sel' : ''}`}
      style={{ left: at.x, top: at.y }}
      data-testid={`lap-icon-${name}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        onSelect();
        drag.current = {
          sx: e.clientX,
          sy: e.clientY,
          x: at.x,
          y: at.y,
          scale: screenScale(e.currentTarget),
          moved: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = (e.clientX - d.sx) / d.scale;
        const dy = (e.clientY - d.sy) / d.scale;
        if (!d.moved && Math.hypot(dx, dy) < 5) return;
        d.moved = true;
        onMove({
          x: Math.round(Math.min(1280 - ICON_W, Math.max(0, d.x + dx))),
          y: Math.round(Math.min(800 - 34 - ICON_H, Math.max(0, d.y + dy))),
        });
      }}
      onPointerUp={() => {
        // Отпустили — значок встаёт в клетку невидимой сетки (как в системах тех лет).
        if (drag.current?.moved) onDrop();
        drag.current = null;
      }}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
    >
      <FileIcon type={type} size={36} />
      <span>{name}</span>
    </button>
  );
}

function Window({
  p,
  active,
  title,
  icon,
  children,
  onFront,
  onMove,
  onMin,
  onMax,
  onClose,
}: {
  p: Placed;
  active: boolean;
  title: string;
  icon: string;
  children: ReactNode;
  onFront: () => void;
  onMove: (x: number, y: number) => void;
  onMin: () => void;
  onMax: () => void;
  onClose: () => void;
}) {
  const drag = useRef<{ dx: number; dy: number; scale: number } | null>(null);
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || p.max || (e.target as Element).closest('button')) return;
    const screen = e.currentTarget.closest('.lap-screen') as HTMLElement | null;
    const scale = screen ? screen.getBoundingClientRect().width / screen.offsetWidth : 1;
    drag.current = { dx: e.clientX / scale - p.x, dy: e.clientY / scale - p.y, scale };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    onMove(
      Math.min(1180, Math.max(-p.w + 120, e.clientX / d.scale - d.dx)),
      Math.min(720, Math.max(0, e.clientY / d.scale - d.dy)),
    );
  };
  return (
    <section
      className={`lap-win${active ? ' lap-win-active' : ''}${p.max ? ' lap-win-max' : ''}`}
      style={
        p.max ? { zIndex: p.z } : { left: p.x, top: p.y, width: p.w, height: p.h, zIndex: p.z }
      }
      data-testid={`lap-win-${title}`}
      aria-label={title}
      onPointerDown={onFront}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: окно тянут за заголовок (как в ОС) */}
      <div
        className="lap-title"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => {
          drag.current = null;
        }}
        onDoubleClick={onMax}
      >
        <FileIcon type={icon} size={16} />
        <span className="lap-title-text">{title}</span>
        <button type="button" aria-label="Свернуть" onClick={onMin}>
          _
        </button>
        <button type="button" aria-label="Развернуть" onClick={onMax}>
          □
        </button>
        <button
          type="button"
          className="lap-x"
          aria-label="Закрыть"
          data-testid="lap-close"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="lap-win-body">{children}</div>
    </section>
  );
}
