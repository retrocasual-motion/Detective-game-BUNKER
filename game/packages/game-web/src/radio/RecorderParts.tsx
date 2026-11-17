import { useEffect, useMemo, useRef } from 'react';
import { useInputMode, wheelIntent } from '../input.ts';
import { useGame } from '../store.ts';
import { clock, ticksFor } from './record.ts';
import { captionNow, useRecorder } from './recorder.ts';
import './radio.css';

/**
 * Регистратор радиопоста — разметка поверх модели (этап 4d-1; решения автора 12.11 — PL-A, ST-A,
 * NV-A с правками, PM-A, K8; «работать прямо на модели»). Экран RL-2 приклеен к плоскости экрана
 * стойки (Held3D, useScreenAnchor): время и шкала отрезка 12.10 21:43 — 13.10 11:00; колесо —
 * масштаб у курсора, зажать — сдвиг, двойной щелчок — весь отрезок; сверху — обзор всего отрезка с
 * рамкой видимой части. Клавиши — на корпусе (radioStand.tsx). Звука в сборке нет: под стойкой —
 * лист описания точки; на паузе — ответ движка «прослушать».
 */

/** Высота разметки экрана, px (ширина — SCREEN_PX; пропорции — как у плоскости 1,5 × 0,42). */
export const SCREEN_PX_H = 280;

export function RecorderLcd() {
  const trackpad = useInputMode() === 'trackpad';
  const pos = useRecorder((r) => r.pos);
  const playing = useRecorder((r) => r.playing);
  const view = useRecorder((r) => r.view);
  const win = useRecorder((r) => r.win);
  const events = useRecorder((r) => r.events);
  const marks = useRecorder((r) => r.marks);
  const rec = useRecorder.getState;
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; from: number; to: number; moved: boolean } | null>(null);

  // Колесо над шкалой — масштаб у точки под курсором (слушатель не пассивный — страница стоит).
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    useRecorder.setState({ stripPx: el.offsetWidth || 1000 });
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      // Тачпад (TP-C): два пальца — сдвинуть шкалу по времени, щипок — крупнее / мельче.
      const intent = wheelIntent(e);
      if ('pan' in intent) {
        const { view } = useRecorder.getState();
        const d = intent.pan[0] || intent.pan[1];
        const dt = (d / r.width) * (view.to - view.from);
        rec().setView({ from: view.from + dt, to: view.to + dt });
        return;
      }
      rec().zoom(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), intent.zoom);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const span = view.to - view.from;
  const inView = pos >= view.from && pos <= view.to;
  const x = (t: number) => `${((t - view.from) / span) * 100}%`;
  const ox = (t: number) => `${((t - win.from) / (win.to - win.from)) * 100}%`;
  const ticks = useMemo(() => ticksFor(view.from, view.to), [view]);
  const sounds = useMemo(() => events.filter((e) => !e.background), [events]);

  return (
    <div className="rl2-screen" data-testid="radio-recorder" style={{ height: SCREEN_PX_H }}>
      <div className="rl2-screen-head">
        <div className="rl2-lcd" data-testid="radio-counter">
          {clock(pos)}
        </div>
        <span className={`rl2-state${playing ? ' rl2-state-on' : ''}`}>
          {playing ? '▶ ВОСПР.' : '❚❚ СТОП'}
        </span>
        <span className="rl2-span" data-testid="radio-view-range">
          {clock(view.from, span < 600)} — {clock(view.to, span < 600)}
        </span>
      </div>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: обзор — щелчок показывает это место крупно; с клавиатуры — «звук ⏮ / ⏭» */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: обзор всего отрезка записи */}
      <div
        className="rl2-overview"
        data-testid="radio-overview"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const at = win.from + ((e.clientX - r.left) / r.width) * (win.to - win.from);
          rec().setView({ from: at - span / 2, to: at + span / 2 });
        }}
      >
        {sounds.map((e) => (
          <span
            key={`o${e.start}-${e.text.slice(0, 8)}`}
            className="rl2-obar"
            style={{ left: ox(e.start) }}
          />
        ))}
        <span
          className="rl2-oview"
          style={{ left: ox(view.from), width: `${(span / (win.to - win.from)) * 100}%` }}
        />
        <span className="rl2-ohead" style={{ left: ox(pos) }} />
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: шкала — щелчок ставит перемотку, зажать — сдвиг; с клавиатуры — «звук ⏮ / ⏭» */}
      <div
        ref={strip}
        className="rl2-strip"
        data-testid="radio-strip"
        data-view-from={Math.round(view.from)}
        data-view-to={Math.round(view.to)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = { x: e.clientX, from: view.from, to: view.to, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > 4) d.moved = true;
          if (!d.moved) return;
          const r = e.currentTarget.getBoundingClientRect();
          const dt = (-dx / r.width) * (d.to - d.from);
          rec().setView({ from: d.from + dt, to: d.to + dt });
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.moved) return;
          const r = e.currentTarget.getBoundingClientRect();
          rec().seek(view.from + ((e.clientX - r.left) / r.width) * span);
        }}
        onDoubleClick={() => rec().setView(win)}
      >
        {ticks.at.map((t) => (
          <span key={t} className="rl2-tick" style={{ left: x(t) }}>
            <span>{clock(t, ticks.seconds).slice(6)}</span>
          </span>
        ))}
        {sounds
          .filter((e) => e.end > view.from && e.start < view.to)
          .map((e) => (
            <span
              key={`${e.start}-${e.text.slice(0, 12)}`}
              className="rl2-bar"
              style={{
                left: x(Math.max(view.from, e.start)),
                width: `max(2px, ${((Math.min(view.to, e.end) - Math.max(view.from, e.start)) / span) * 100}%)`,
              }}
            />
          ))}
        {marks
          .filter((m) => m.t >= view.from && m.t < view.to)
          .map((m) => (
            <span
              key={`${m.t}-${m.label}`}
              className="rl2-mark"
              style={{ left: x(m.t) }}
              title={m.label}
            />
          ))}
        {inView && <span className="rl2-head" style={{ left: x(pos) }} />}
      </div>
      <div className="rl2-hint">
        {trackpad
          ? 'щипок — крупнее / мельче · два пальца или зажать и тянуть — сдвиг · двойной щелчок — весь отрезок'
          : 'колесо — крупнее / мельче · зажать и тянуть — сдвиг · двойной щелчок — весь отрезок'}
      </div>
    </div>
  );
}

/**
 * Лист под стойкой вплотную. У регистратора — метки, описание точки (серый прототип, K8) и
 * снимки стойки на месте до изъятия; у приёмника — только подсказка жестов.
 */
export function RadioSheet({ part }: { part: 'recorder' | 'receiver' }) {
  const needle = useRecorder((r) => r.needle);
  const mode = useRecorder((r) => r.mode);
  if (part === 'receiver')
    return (
      <div
        className="rl2-sheet rl2-sheet-hint"
        data-testid="radio-receiver-hint"
        data-needle={needle.toFixed(3)}
        data-mode={mode}
        onPointerDown={(e) => e.stopPropagation()}
      >
        ручка настройки — тянуть, колесо или щелчок по краю (← →) · переключатель — щелчок · Esc —
        отойти
      </div>
    );
  return <RecorderSheet />;
}

function RecorderSheet() {
  const body = useGame((g) => g.materials.find((m) => m.id === '50')?.body ?? '');
  const pos = useRecorder((r) => r.pos);
  const events = useRecorder((r) => r.events);
  const marks = useRecorder((r) => r.marks);
  const labeling = useRecorder((r) => r.labeling);
  const heard = useRecorder((r) => r.heard);
  const photo = useRecorder((r) => r.photo);
  const rec = useRecorder.getState;
  const cap = captionNow({ events, pos });
  const photos = useMemo(() => {
    const part = body.split(/^## Стойка \(фото\)/m)[1]?.split(/^## /m)[0] ?? '';
    return part
      .split(/\n(?=\d+\.\s)/)
      .map((p) => p.trim())
      .filter((p) => /^\d+\./.test(p))
      .map((p) => {
        const m = /^\d+\.\s*\*\*([^*]+)\*\*\s*([\s\S]*)$/.exec(p);
        return {
          title: (m?.[1] ?? '').replace(/\.$/, ''),
          text: (m?.[2] ?? p).replace(/\s*\n\s*/g, ' '),
        };
      });
  }, [body]);

  return (
    <div className="rl2-sheet" data-testid="radio-sheet" onPointerDown={(e) => e.stopPropagation()}>
      {(labeling !== null || marks.length > 0) && (
        <div className="rl2-marks">
          {labeling !== null && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                rec().saveMark();
              }}
            >
              <input
                // biome-ignore lint/a11y/noAutofocus: подпись метки открыта клавишей
                autoFocus
                aria-label="Подпись метки"
                data-testid="radio-mark-label"
                placeholder={`${clock(pos)} — подпись`}
                value={labeling}
                maxLength={60}
                onChange={(e) => rec().setLabeling(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    rec().setLabeling(null);
                  }
                }}
              />
              <button type="submit" data-testid="radio-mark-save">
                Поставить
              </button>
            </form>
          )}
          {marks.map((m, k) => (
            <span
              key={`${m.t}-${m.label}`}
              className="rl2-mark-chip"
              data-testid={`radio-mark-${k}`}
            >
              <button type="button" onClick={() => rec().seek(m.t)}>
                {clock(m.t)}
                {m.label ? ` · ${m.label}` : ''}
              </button>
              <button type="button" aria-label="Убрать метку" onClick={() => rec().removeMark(m)}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="rl2-bottom">
        <div className="rl2-caption" data-testid="radio-caption" data-material="50">
          <div className="rl2-caption-note">
            {photo !== null
              ? 'Снимка в сборке пока нет — описание того, что на нём видно.'
              : 'Звука в сборке пока нет — описание того, что слышно в этой точке.'}
          </div>
          {photo !== null ? (
            <p data-testid="radio-photo-text">
              <b>
                Снимок {photo + 1}. {photos[photo]?.title}.
              </b>{' '}
              {photos[photo]?.text}
            </p>
          ) : cap ? (
            <p>
              <span className="rl2-caption-time">
                {clock(cap.start)}
                {cap.point ? '' : ` — ${clock(cap.end)}`}
              </span>{' '}
              {cap.text}
            </p>
          ) : (
            <p>—</p>
          )}
          {heard && photo === null && Math.abs(heard.at - pos) < 2 && (
            <p className="rl2-heard" data-testid="radio-heard">
              {heard.text}
            </p>
          )}
        </div>
        <div className="rl2-photos">
          <span className="rl2-photos-title">Стойка — снимки следствия</span>
          {photos.map((p, k) => (
            <button
              key={p.title}
              type="button"
              className={photo === k ? 'rl2-photo rl2-photo-on' : 'rl2-photo'}
              data-testid={`radio-photo-${k + 1}`}
              onClick={() => rec().setPhoto(photo === k ? null : k)}
            >
              <span className="rl2-photo-img" aria-hidden />
              <span>
                {k + 1}. {p.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
