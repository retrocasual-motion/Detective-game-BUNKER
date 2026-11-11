import { useEffect, useRef, useState } from 'react';
import type { PhoneContent, Voicemail } from './content.ts';

/**
 * Приложения телефона (4c-2, PH-A, по референсам смартфонов 2009 года): «Phone» — вкладки внизу
 * (Recents, Contacts, Voicemail), «Messages» — список переписок, внутри пузыри, «Contacts» —
 * список и карточка. Звонить нельзя (CALL-A): кнопок вызова нет, номера только читают. Текст
 * выделяется для ходатайства (data-material = L540).
 */

export type Screen =
  | 'home'
  | 'recents'
  | 'contacts'
  | 'voicemail'
  | 'messages'
  | 'thread'
  | `contact:${string}`;

const MAT = 'L540';

/** Шкала проигрывания записи: звука в сборке нет — под шкалой расшифровка. */
function PlayBar({ duration, onDone }: { duration: string; onDone?: () => void }) {
  const [m, s] = duration.split(':').map(Number);
  const total = (m ?? 0) * 60 + (s ?? 0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      setT((v) => {
        const next = v + (now - last.current) / 1000;
        last.current = now;
        if (next >= total) {
          setPlaying(false);
          onDone?.();
          return total;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total, onDone]);
  const clock = (v: number) =>
    `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
  return (
    <div className="ph-play">
      <button
        type="button"
        className="ph-play-btn"
        data-testid="phone-play"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={() => setPlaying((p) => !p)}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="ph-play-track">
        <span style={{ width: `${total ? (t / total) * 100 : 0}%` }} />
      </div>
      <span className="ph-play-time">
        {clock(t)} / {duration}
      </span>
    </div>
  );
}

export function Recents({ p }: { p: PhoneContent }) {
  // Сверху — последние: по дням, с числом пропущенных (L540).
  const days = [...p.missed].reverse();
  return (
    <ul className="ph-list" data-material={MAT} data-testid="phone-recents">
      {days.map((d, k) => (
        <li key={d.day} className="ph-row">
          <span className="ph-row-main ph-missed">Ana{d.count > 1 ? ` (${d.count})` : ''}</span>
          <span className="ph-row-sub">missed</span>
          <span className="ph-row-side">{k === 0 && p.lastMissed ? p.lastMissed : d.day}</span>
        </li>
      ))}
    </ul>
  );
}

export function VoicemailList({ p }: { p: PhoneContent }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ul className="ph-list" data-material={MAT} data-testid="phone-voicemail">
      {p.voicemail.map((v: Voicemail, i) => (
        <li key={v.when} className={`ph-row ph-row-tall${open === i ? ' ph-row-open' : ''}`}>
          <button
            type="button"
            className="ph-row-hit"
            data-testid={`phone-vm-${i}`}
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span className="ph-row-main">Ana</span>
            <span className="ph-row-side">
              {v.when} · {v.duration}
            </span>
          </button>
          {open === i && (
            <div className="ph-vm-body">
              <PlayBar duration={v.duration} />
              <p className="ph-transcript">
                <span className="ph-note">Звука в сборке пока нет — расшифровка:</span> {v.text}
              </p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ContactList({ p, go }: { p: PhoneContent; go: (s: Screen) => void }) {
  return (
    <ul className="ph-list" data-testid="phone-contacts">
      {p.contacts.map((c) => (
        <li key={c.name} className="ph-row">
          <button
            type="button"
            className="ph-row-hit"
            data-testid={`phone-contact-${c.name}`}
            onClick={() => go(`contact:${c.name}`)}
          >
            <span className="ph-row-main">{c.name}</span>
            <span className="ph-chevron">›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ContactCard({ p, name }: { p: PhoneContent; name: string }) {
  const c = p.contacts.find((x) => x.name === name);
  if (!c) return null;
  const ice = p.ice.startsWith(name);
  return (
    <div className="ph-card" data-material={MAT} data-testid="phone-contact-card">
      <div className="ph-card-pic" aria-hidden>
        {name.slice(0, 1)}
      </div>
      <div className="ph-card-name">{c.name}</div>
      {/* CALL-A: номер только читают — звонить с изъятого телефона нельзя (P-7). */}
      <div className="ph-card-field">
        <span>mobile</span>
        {c.number}
      </div>
      {ice && (
        <div className="ph-card-field">
          <span>ICE</span>
          {p.ice}
        </div>
      )}
    </div>
  );
}

export function Conversations({ p, go }: { p: PhoneContent; go: (s: Screen) => void }) {
  const last = p.thread[0];
  return (
    <ul className="ph-list" data-testid="phone-conversations">
      <li className="ph-row ph-row-tall">
        <button
          type="button"
          className="ph-row-hit"
          data-testid="phone-thread-Ana"
          onClick={() => go('thread')}
        >
          <span className="ph-row-main">Ana</span>
          <span className="ph-row-side">{last?.when.split(',')[0]}</span>
          <span className="ph-row-snippet">{last?.text}</span>
        </button>
      </li>
    </ul>
  );
}

export function Thread({ p }: { p: PhoneContent }) {
  const [voiceOpen, setVoiceOpen] = useState(false);
  // Порядок — как в каноне: последние сверху (L540).
  return (
    <div className="ph-thread" data-material={MAT} data-testid="phone-thread">
      {p.thread.map((m) => {
        const mine = m.from === 'Gabriel';
        return (
          <div key={m.when} className={`ph-msg${mine ? ' ph-msg-mine' : ''}`}>
            <div className="ph-bubble">
              {m.voice ? (
                <>
                  <button
                    type="button"
                    className="ph-voice"
                    data-testid="phone-voice"
                    onClick={() => setVoiceOpen((o) => !o)}
                  >
                    ▶ Voice message · {m.voice.duration}
                  </button>
                  {voiceOpen && (
                    <div className="ph-voice-body">
                      <PlayBar duration={m.voice.duration} />
                      <p className="ph-transcript">
                        <span className="ph-note">Звука в сборке пока нет — расшифровка:</span>{' '}
                        {m.voice.transcript}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                m.text
              )}
            </div>
            <div className="ph-msg-when">{m.when}</div>
          </div>
        );
      })}
    </div>
  );
}
