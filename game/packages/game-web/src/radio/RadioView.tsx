import { useEffect, useMemo, useState } from 'react';
import { postAction } from '../api.ts';
import { useFreeArea } from '../device/deviceView.tsx';
import { useGame } from '../store.ts';
import {
  captionAt,
  clock,
  fromClock,
  hourTicks,
  listenLine,
  parseRecord,
  RECORD_LENGTH,
  type RecWindow,
  windows,
} from './record.ts';
import './radio.css';

/** Панель, логические px; на окне — масштабом. */
const W = 1060;
const H = 620;
const SPEEDS = [1, 16, 60] as const;
type Mark = { t: number; label: string };

/**
 * Регистратор радиопоста лицом к игроку (этап 4d-1; решения автора 12.11 — PL-A, ST-A, NV-A с
 * правкой «сразу нужный отрезок» и «волной», PM-A, K8). По канону изъят регистратор RL-2 с
 * записью; стойка — только на двух снимках (файл 50). Счётчик — часы регистратора; «▶», перемотка,
 * скорость, «перейти к» по дате и времени; шкала — отрезок с тревоги (по умолчанию) или сутки, на
 * ней полосы там, где что-то слышно, и метки игрока. Звука в сборке пока нет: под панелью —
 * описание той точки, где стоит перемотка; на паузе — что ещё слышно (ответ движка «прослушать»).
 */
export function RadioView() {
  const open = useGame((g) => g.radio);
  const area = useFreeArea();
  const scale = Math.min((area.width - 40) / W, (area.height - 40) / H, 1.25);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input')) return;
      useGame.getState().closeRadio();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="radio-view" data-testid="radio-view">
      <button
        type="button"
        className="laptop-backdrop"
        aria-label="Отойти от регистратора"
        data-testid="radio-away"
        onClick={() => useGame.getState().closeRadio()}
      />
      <div
        className="radio-frame"
        style={{
          width: W,
          height: H,
          left: area.center || undefined,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <Recorder />
      </div>
    </div>
  );
}

function Recorder() {
  const body = useGame((g) => g.materials.find((m) => m.id === '50')?.body ?? '');
  const events = useMemo(() => parseRecord(body), [body]);
  const wins = useMemo(() => windows(), []);
  const saved = useGame.getState().state?.radio;
  const [pos, setPos] = useState(saved?.pos ?? fromClock(13, 7 * 3600 + 30 * 60));
  const [marks, setMarks] = useState<Mark[]>(saved?.marks ?? []);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [win, setWin] = useState<RecWindow>(
    () => wins.find((w) => pos >= w.from && pos < w.to) ?? (wins[0] as RecWindow),
  );
  const [goto, setGoto] = useState<string | null>(null);
  const [gotoMsg, setGotoMsg] = useState('');
  const [heard, setHeard] = useState<{ at: number; text: string } | null>(null);
  const [labeling, setLabeling] = useState<string | null>(null);
  const [photo, setPhoto] = useState<number | null>(null);

  // Ход записи: виртуальные часы (звука в сборке нет).
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setPos((p) => {
        const n = Math.min(RECORD_LENGTH, p + 0.25 * speed);
        if (n >= RECORD_LENGTH) setPlaying(false);
        return n;
      });
    }, 250);
    return () => clearInterval(t);
  }, [playing, speed]);
  // Шкала идёт за перемоткой: вышли из окна — окно, где сейчас точка.
  useEffect(() => {
    if (pos >= win.from && pos < win.to) return;
    const w = wins.find((x) => pos >= x.from && pos < x.to);
    if (w) setWin(w);
  }, [pos, win, wins]);
  // Сохранение положения и меток.
  useEffect(() => {
    const t = setTimeout(
      () =>
        useGame.getState().updateState((s) => ({ ...s, radio: { pos: Math.round(pos), marks } })),
      500,
    );
    return () => clearTimeout(t);
  }, [pos, marks]);
  // На паузе — «прослушать» эту точку: что ещё слышно (движок; общий ответ — молча).
  useEffect(() => {
    if (playing) return;
    const at = Math.round(pos);
    const t = setTimeout(async () => {
      const r = await postAction('ОСМОТР', '50', listenLine(at)).catch(() => null);
      setHeard(r && !r.quiet && r.reply ? { at, text: r.reply } : null);
    }, 500);
    return () => clearTimeout(t);
  }, [playing, pos]);

  const cap = captionAt(events, pos);
  const active = cap && !cap.background;
  const span = win.to - win.from;
  const x = (t: number) => `${((t - win.from) / span) * 100}%`;
  const seek = (t: number) => setPos(Math.max(0, Math.min(RECORD_LENGTH - 1, t)));
  const jump = () => {
    const m = /^\s*(\d{1,2})[./](\d{1,2})\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*$/.exec(
      goto ?? '',
    );
    if (!m || Number(m[2]) !== 10) {
      setGotoMsg('Формат: ДД.ММ ЧЧ:ММ — например 13.10 08:44');
      return;
    }
    const t = fromClock(Number(m[1]), Number(m[3]) * 3600 + Number(m[4]) * 60 + Number(m[5] ?? 0));
    if (t < 0 || t >= RECORD_LENGTH) {
      setGotoMsg(`Запись — с ${clock(0, false)} до ${clock(RECORD_LENGTH - 60, false)}`);
      return;
    }
    seek(t);
    setGoto(null);
    setGotoMsg('');
  };
  const ticks = useMemo(
    () => hourTicks(win.from, win.to, span > 30 * 3600 ? 6 : span > 16 * 3600 ? 2 : 1),
    [win, span],
  );
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
    <div className="rl2" data-testid="radio-recorder">
      <div className="rl2-top">
        <div className="rl2-brand">
          <b>Fieldworks Radio · RL-2</b>
          <span className="rl2-sticker">RL-2 · непрерывная запись · без стирания</span>
        </div>
        <div className="rl2-photos">
          <span>Стойка (снимки следствия):</span>
          {photos.map((p, k) => (
            <button
              key={p.title}
              type="button"
              className={photo === k ? 'rl2-photo rl2-photo-on' : 'rl2-photo'}
              data-testid={`radio-photo-${k + 1}`}
              onClick={() => setPhoto(photo === k ? null : k)}
            >
              {k + 1}. {p.title}
            </button>
          ))}
        </div>
      </div>

      <div className="rl2-face">
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: счётчик — щелчок открывает «перейти к»; кнопка рядом делает то же */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: счётчик — часть панели регистратора */}
        <div
          className="rl2-lcd"
          data-testid="radio-counter"
          title="Перейти к времени"
          onClick={() => setGoto(clock(pos, false))}
        >
          {goto === null ? (
            clock(pos)
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                jump();
              }}
            >
              <input
                // biome-ignore lint/a11y/noAutofocus: ввод времени открыт щелчком по счётчику
                autoFocus
                aria-label="Перейти к: ДД.ММ ЧЧ:ММ"
                data-testid="radio-goto"
                value={goto}
                onChange={(e) => {
                  setGoto(e.target.value);
                  setGotoMsg('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setGoto(null);
                    setGotoMsg('');
                  }
                }}
              />
            </form>
          )}
        </div>
        <div className="rl2-leds" title="Индикаторы каналов">
          <span className={`rl2-led${active ? ' rl2-led-on' : ''}`}>1</span>
          <span className={`rl2-led${active ? ' rl2-led-on' : ''}`}>2</span>
        </div>
        <div className="rl2-keys">
          <button
            type="button"
            aria-label="Назад"
            data-testid="radio-back"
            onClick={() => seek(pos - 60 * speed)}
          >
            ◀◀
          </button>
          <button
            type="button"
            className="rl2-play"
            aria-label={playing ? 'Пауза' : 'Воспроизведение'}
            data-testid="radio-play"
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            aria-label="Вперёд"
            data-testid="radio-fwd"
            onClick={() => seek(pos + 60 * speed)}
          >
            ▶▶
          </button>
          <fieldset className="rl2-speed" aria-label="Скорость">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                className={speed === s ? 'rl2-speed-on' : undefined}
                data-testid={`radio-speed-${s}`}
                onClick={() => setSpeed(s)}
              >
                ×{s}
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            className="rl2-goto-btn"
            data-testid="radio-goto-btn"
            onClick={() => setGoto(clock(pos, false))}
          >
            Перейти к…
          </button>
        </div>
      </div>
      {gotoMsg && (
        <div className="rl2-msg" role="status" data-testid="radio-goto-msg">
          {gotoMsg}
        </div>
      )}

      <fieldset className="rl2-wins" aria-label="Отрезок записи">
        {wins.map((w) => (
          <button
            key={w.key}
            type="button"
            aria-pressed={w.key === win.key}
            className={w.key === win.key ? 'rl2-win-on' : undefined}
            data-testid={`radio-win-${w.key}`}
            onClick={() => {
              setWin(w);
              if (pos < w.from || pos >= w.to) seek(w.from);
            }}
          >
            {w.label}
          </button>
        ))}
      </fieldset>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: шкала — щелчок ставит перемотку; с клавиатуры — «Перейти к…» */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: шкала записи */}
      <div
        className="rl2-strip"
        data-testid="radio-strip"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          seek(win.from + ((e.clientX - r.left) / r.width) * span);
        }}
      >
        {events
          .filter((e) => !e.background && e.end > win.from && e.start < win.to)
          .map((e) => (
            <span
              key={`${e.start}-${e.text.slice(0, 12)}`}
              className="rl2-bar"
              style={{
                left: x(Math.max(win.from, e.start)),
                width: `max(2px, ${((Math.min(win.to, e.end) - Math.max(win.from, e.start)) / span) * 100}%)`,
              }}
            />
          ))}
        {ticks.map((t) => (
          <span key={t} className="rl2-tick" style={{ left: x(t) }}>
            {clock(t, false).slice(6)}
          </span>
        ))}
        {marks
          .filter((m) => m.t >= win.from && m.t < win.to)
          .map((m) => (
            <span
              key={`${m.t}-${m.label}`}
              className="rl2-mark"
              style={{ left: x(m.t) }}
              title={m.label}
            />
          ))}
        <span className="rl2-head" style={{ left: x(pos) }} />
      </div>

      <div className="rl2-marks">
        {labeling === null ? (
          <button type="button" data-testid="radio-mark-add" onClick={() => setLabeling('')}>
            Метка здесь
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setMarks((m) =>
                [...m, { t: Math.round(pos), label: (labeling ?? '').trim().slice(0, 60) }].sort(
                  (a, b) => a.t - b.t,
                ),
              );
              setLabeling(null);
            }}
          >
            <input
              // biome-ignore lint/a11y/noAutofocus: подпись метки открыта кнопкой
              autoFocus
              aria-label="Подпись метки"
              data-testid="radio-mark-label"
              placeholder={`${clock(pos)} — подпись`}
              value={labeling}
              maxLength={60}
              onChange={(e) => setLabeling(e.target.value)}
            />
            <button type="submit" data-testid="radio-mark-save">
              Поставить
            </button>
          </form>
        )}
        {marks.map((m, k) => (
          <span key={`${m.t}-${m.label}`} className="rl2-mark-chip" data-testid={`radio-mark-${k}`}>
            <button type="button" onClick={() => seek(m.t)}>
              {clock(m.t)}
              {m.label ? ` · ${m.label}` : ''}
            </button>
            <button
              type="button"
              aria-label="Убрать метку"
              onClick={() => setMarks((l) => l.filter((x2) => x2 !== m))}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      <div className="rl2-caption" data-testid="radio-caption" data-material="50">
        <div className="rl2-caption-note">
          Звука в сборке пока нет — описание того, что слышно в этой точке.
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
          <p>Фон: шум эфира.</p>
        )}
        {heard && photo === null && Math.abs(heard.at - pos) < 2 && (
          <p className="rl2-heard" data-testid="radio-heard">
            {heard.text}
          </p>
        )}
      </div>
    </div>
  );
}
