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
  soundStarts,
  windows,
} from './record.ts';
import './radio.css';

/** Панель, логические px; на окне — масштабом. */
const W = 1060;
const H = 640;
type Mark = { t: number; label: string };

/**
 * Регистратор радиопоста лицом к игроку (этап 4d-1; решения автора 12.11 — PL-A, ST-A, NV-A с
 * правками «сразу нужный отрезок», «волна», «без лишних дней», «переключаться между звуками»,
 * PM-A, K8). По канону изъят регистратор RL-2 с записью; стойка — только на двух снимках (файл 50).
 * На экране — время и шкала размеченного отрезка 12.10 21:43 — 13.10 11:00 с полосами там, где
 * что-то слышно; клавиши «◂ звук», «пуск», «звук ▸», «перейти», «метка». Звука в сборке пока нет:
 * под панелью — описание той точки, где стоит перемотка; на паузе — ответ движка «прослушать».
 */
export function RadioView() {
  const open = useGame((g) => g.radio);
  const area = useFreeArea();
  const scale = Math.min((area.width - 40) / W, (area.height - 40) / H, 1.25);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if ((e.target as HTMLElement | null)?.closest('input')) return;
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
  const sounds = useMemo(() => soundStarts(events), [events]);
  // Только размеченный отрезок с тревоги (правка автора 12.11: «остальные дни — фон, хлам»).
  const win = useMemo(() => windows()[0] ?? { key: 'alarm', label: '', from: 0, to: 1 }, []);
  const saved = useGame.getState().state?.radio;
  const [pos, setPos] = useState(saved?.pos ?? fromClock(13, 7 * 3600 + 30 * 60));
  const [marks, setMarks] = useState<Mark[]>(saved?.marks ?? []);
  const [playing, setPlaying] = useState(false);
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
        const n = Math.min(RECORD_LENGTH, p + 0.25);
        if (n >= RECORD_LENGTH) setPlaying(false);
        return n;
      });
    }, 250);
    return () => clearInterval(t);
  }, [playing]);
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
  const active = !!cap && !cap.background;
  const span = win.to - win.from;
  const inWin = pos >= win.from && pos <= win.to;
  const x = (t: number) => `${((t - win.from) / span) * 100}%`;
  const seek = (t: number) => {
    setPhoto(null);
    setPos(Math.max(0, Math.min(RECORD_LENGTH - 1, t)));
  };
  // «◂ звук» / «звук ▸» — к соседнему месту, где что-то слышно (как «след. фрагмент» у регистраторов).
  const prevSound = () => {
    const s = [...sounds].reverse().find((t) => t < pos - 1);
    if (s !== undefined) seek(s);
  };
  const nextSound = () => {
    const s = sounds.find((t) => t > pos + 0.5);
    if (s !== undefined) seek(s);
  };
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
  const ticks = useMemo(() => hourTicks(win.from, win.to, 1), [win]);
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
      <div className="rl2-unit">
        <span className="rl2-screw rl2-screw-tl" />
        <span className="rl2-screw rl2-screw-tr" />
        <span className="rl2-screw rl2-screw-bl" />
        <span className="rl2-screw rl2-screw-br" />
        <div className="rl2-plate">
          <div className="rl2-brand">
            <b>FIELDWORKS RADIO</b>
            <span>RL-2 · регистратор</span>
          </div>
          <span className="rl2-sticker">непрерывная запись · без стирания</span>
          <div className="rl2-leds" title="Индикаторы каналов">
            <span className="rl2-led-cell">
              <span className={`rl2-led${active ? ' rl2-led-on' : ''}`} />1
            </span>
            <span className="rl2-led-cell">
              <span className={`rl2-led${active ? ' rl2-led-on' : ''}`} />2
            </span>
          </div>
        </div>

        <div className="rl2-screen">
          <div className="rl2-screen-head">
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: щелчок по времени — «перейти»; клавиша «перейти» делает то же */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: время на экране регистратора */}
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
                    // biome-ignore lint/a11y/noAutofocus: ввод времени открыт щелчком по времени
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
            <span className={`rl2-state${playing ? ' rl2-state-on' : ''}`}>
              {playing ? '▶ ВОСПР.' : '❚❚ СТОП'}
            </span>
            <span className="rl2-span">{win.label}</span>
          </div>
          {gotoMsg && (
            <div className="rl2-msg" role="status" data-testid="radio-goto-msg">
              {gotoMsg}
            </div>
          )}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: шкала — щелчок ставит перемотку; с клавиатуры — «◂ звук», «звук ▸», «перейти» */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: шкала записи */}
          <div
            className="rl2-strip"
            data-testid="radio-strip"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              seek(win.from + ((e.clientX - r.left) / r.width) * span);
            }}
          >
            {ticks.map((t) => (
              <span key={t} className="rl2-tick" style={{ left: x(t) }}>
                <span>{clock(t, false).slice(6)}</span>
              </span>
            ))}
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
            {inWin && <span className="rl2-head" style={{ left: x(pos) }} />}
          </div>
        </div>

        <div className="rl2-keys">
          <button type="button" data-testid="radio-prev" onClick={prevSound}>
            <span className="rl2-key">⏮</span>
            <small>звук</small>
          </button>
          <button
            type="button"
            className="rl2-play"
            data-testid="radio-play"
            aria-label={playing ? 'Пауза' : 'Пуск'}
            onClick={() => setPlaying((p) => !p)}
          >
            <span className="rl2-key">{playing ? '❚❚' : '▶'}</span>
            <small>{playing ? 'пауза' : 'пуск'}</small>
          </button>
          <button type="button" data-testid="radio-next" onClick={nextSound}>
            <span className="rl2-key">⏭</span>
            <small>звук</small>
          </button>
          <span className="rl2-keys-gap" />
          <button
            type="button"
            data-testid="radio-goto-btn"
            onClick={() => setGoto(clock(pos, false))}
          >
            <span className="rl2-key">⇥</span>
            <small>перейти</small>
          </button>
          <button type="button" data-testid="radio-mark-add" onClick={() => setLabeling('')}>
            <span className="rl2-key">✎</span>
            <small>метка</small>
          </button>
        </div>
      </div>

      {(labeling !== null || marks.length > 0) && (
        <div className="rl2-marks">
          {labeling !== null && (
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
                // biome-ignore lint/a11y/noAutofocus: подпись метки открыта клавишей
                autoFocus
                aria-label="Подпись метки"
                data-testid="radio-mark-label"
                placeholder={`${clock(pos)} — подпись`}
                value={labeling}
                maxLength={60}
                onChange={(e) => setLabeling(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setLabeling(null);
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
              onClick={() => setPhoto(photo === k ? null : k)}
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
