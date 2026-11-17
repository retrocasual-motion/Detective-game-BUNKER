import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { postAction } from '../api.ts';
import { gameNow, hhmm } from '../clock.ts';
import { useSelectionPetition } from '../device/deviceView.tsx';
import { useGame } from '../store.ts';
import { lockContent, phoneContent } from './content.ts';
import {
  ContactCard,
  ContactList,
  Conversations,
  Recents,
  type Screen,
  Thread,
  VoicemailList,
} from './PhoneApps.tsx';
import { Passcode, Slider } from './PhoneLock.tsx';
import { phoneHome } from './phoneHome.ts';
import './phone.css';

/** Экран телефона, логические px (как у смартфонов 2009 года, 320 × 480); на модели — масштабом. */
export const PHONE_PX: [number, number] = [320, 480];
const [SCREEN_W, SCREEN_H] = PHONE_PX;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const APPS = [
  { id: 'phone', label: 'Phone', screen: 'recents' as Screen },
  { id: 'messages', label: 'Messages', screen: 'messages' as Screen },
  { id: 'contacts', label: 'Contacts', screen: 'contacts' as Screen },
];

/** Рисунки значков: трубка, облачко сообщения, силуэт контакта. */
const ICONS: Record<string, React.ReactNode> = {
  phone: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#fff"
        d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z"
      />
    </svg>
  ),
  messages: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#fff"
        d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6L4 21l4.6-2.4c1.1.3 2.2.4 3.4.4 5.5 0 10-3.6 10-8s-4.5-8-10-8Z"
      />
    </svg>
  ),
  contacts: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="4.2" fill="#5a4a32" />
      <path fill="#5a4a32" d="M3.5 21c.6-4.6 4-7.5 8.5-7.5s7.9 2.9 8.5 7.5Z" />
    </svg>
  ),
};

const TITLE: Record<string, string> = {
  recents: 'Recents',
  contacts: 'Contacts',
  voicemail: 'Voicemail',
  messages: 'Messages',
  thread: 'Ana',
};
/** Куда «назад»: вкладки «Phone» и списки — домой, переписка — к списку, карточка — к контактам. */
const parentOf = (s: Screen): Screen =>
  s === 'thread' ? 'messages' : s.startsWith('contact:') ? 'contacts' : 'home';
const tabsOf = (s: Screen) => s === 'recents' || s === 'voicemail' || s === 'contacts';

/**
 * Живой экран телефона Габриэля (4c-2; решения автора 11.11 — PH-A, PN-A, CALL-A, EM-A; WM-B —
 * автор 17.11): разметка приклеена к экрану 3D-телефона в руках (Held3D, useScreenAnchor) —
 * щелчок по экрану, камера подъезжает, телефон остаётся той же вещью. Первый раз — код
 * (Passcode), дальше — «slide to unlock» (Slider). Домашний экран — значки только из канона;
 * приложение раскрывается из значка, экраны въезжают сбоку, «назад»; кнопка «домой» — на корпусе
 * модели (phoneHome). Что открыто — сохраняется (`state.phone`). Esc, правая кнопка мимо экрана
 * или щелчок мимо — снова вещь в руках; сеанс живёт, пока экран вплотную.
 */
export function PhoneLive() {
  const materials = useGame((g) => g.materials);
  const body540 = materials.find((m) => m.id === 'L540')?.body ?? null;
  const body48 = materials.find((m) => m.id === '48')?.body ?? '';
  const content = useMemo(() => (body540 ? phoneContent(body540) : null), [body540]);
  const lock = useMemo(() => lockContent(body48), [body48]);
  const [session, setSession] = useState(false);
  const saved = useGame((g) => g.state?.phone?.screen) as Screen | undefined;
  const [screen, setScreen] = useState<Screen>(saved ?? 'home');
  const [dir, setDir] = useState<'open' | 'push' | 'back' | 'none'>('none');
  const [origin, setOrigin] = useState('50% 50%');
  const started = useGame((g) => g.state?.started);
  const [now, setNow] = useState(() => gameNow(started));
  useEffect(() => {
    const t = setInterval(() => setNow(gameNow(started)), 10_000);
    return () => clearInterval(t);
  }, [started]);
  const { onUp, button } = useSelectionPetition('phone-to-petition');
  const zoomed = useRef(false);
  useEffect(
    () => () => {
      phoneHome.go = null;
    },
    [],
  );

  // Что открыто — в сохранение.
  useEffect(() => {
    if (!content) return;
    useGame.getState().updateState((s) => ({ ...s, phone: { screen } }));
  }, [screen, content]);

  const go = (s: Screen, how: 'open' | 'push' | 'back' = 'push') => {
    setDir(how);
    setScreen(s);
  };
  const unlocked = !!content && session;
  // Кнопка «домой» на корпусе (3D) — на главный экран.
  phoneHome.go = () => unlocked && screen !== 'home' && go('home', 'back');
  const date = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;

  // Крупный план обоев экрана блокировки (L949) — на самом телефоне (DV-A).
  const zoomWallpaper = () => {
    if (zoomed.current) return;
    zoomed.current = true;
    void postAction('ОСМОТР', '48 экран блокировки', 'увеличить')
      .then((r) => r.released.length && useGame.getState().addFound(r.released, '48', []))
      .catch(() => undefined);
  };

  let inner: React.ReactNode;
  if (!unlocked) {
    inner = (
      <div className="ph-lock" data-testid="phone-lock">
        <button
          type="button"
          className="ph-wallpaper"
          aria-label="Обои экрана блокировки"
          tabIndex={-1}
          onDoubleClick={zoomWallpaper}
          onWheel={(e) => e.deltaY < 0 && zoomWallpaper()}
        />
        <div className="ph-lock-clock">
          <div className="ph-lock-time">{hhmm(now)}</div>
          <div className="ph-lock-date">{date}</div>
        </div>
        <ul className="ph-notes" data-testid="phone-notifications">
          {lock.notifications.map((n) => (
            <li key={n.title}>
              <b>{n.title}</b>
              {n.when && <span>{n.when}</span>}
            </li>
          ))}
        </ul>
        {content ? (
          <div className="ph-lock-bottom">
            <Slider onUnlock={() => setSession(true)} />
          </div>
        ) : (
          <Passcode onUnlock={() => setSession(true)} />
        )}
      </div>
    );
  } else if (screen === 'home' || !content) {
    inner = (
      <div className={`ph-home ph-anim-${dir}`} data-testid="phone-home">
        <div className="ph-grid">
          {APPS.map((a) => (
            <button
              key={a.id}
              type="button"
              className="ph-app"
              data-testid={`phone-app-${a.label}`}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const s = e.currentTarget.closest('.ph-screen')?.getBoundingClientRect();
                if (s)
                  setOrigin(
                    `${(((r.left + r.width / 2 - s.left) / s.width) * 100).toFixed(0)}% ${(((r.top + r.height / 2 - s.top) / s.height) * 100).toFixed(0)}%`,
                  );
                go(a.screen, 'open');
              }}
            >
              <span className={`ph-icon ph-icon-${a.id}`} aria-hidden>
                {ICONS[a.id]}
              </span>
              <span className="ph-app-label">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  } else {
    const contact = screen.startsWith('contact:') ? screen.slice(8) : null;
    inner = (
      <div
        key={screen}
        className={`ph-app-screen ph-anim-${dir}`}
        style={{ transformOrigin: origin }}
        data-testid={`phone-screen-${contact ? 'contact' : screen}`}
      >
        <div className="ph-nav">
          <button
            type="button"
            className="ph-back"
            data-testid="phone-back"
            onClick={() => go(parentOf(screen), 'back')}
          >
            ‹ {parentOf(screen) === 'home' ? 'Home' : TITLE[parentOf(screen)]}
          </button>
          <span className="ph-nav-title">{contact ?? TITLE[screen]}</span>
        </div>
        <div className="ph-content">
          {screen === 'recents' && <Recents p={content} />}
          {screen === 'voicemail' && <VoicemailList p={content} />}
          {screen === 'contacts' && <ContactList p={content} go={(s) => go(s)} />}
          {contact && <ContactCard p={content} name={contact} />}
          {screen === 'messages' && <Conversations p={content} go={(s) => go(s)} />}
          {screen === 'thread' && <Thread p={content} />}
        </div>
        {tabsOf(screen) && (
          <div className="ph-tabs">
            {(['recents', 'contacts', 'voicemail'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={screen === t ? 'ph-tab-on' : undefined}
                data-testid={`phone-tab-${t}`}
                onClick={() => {
                  setDir('none');
                  setScreen(t);
                }}
              >
                <span className={`ph-tab-ico ph-tab-${t}`} aria-hidden />
                {TITLE[t]}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: выделение текста мышью на экране телефона
    <div
      className="ph-screen"
      data-testid="phone-view"
      style={{ width: SCREEN_W, height: SCREEN_H }}
      onMouseUp={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="ph-status" aria-hidden>
        <span className="ph-signal">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="ph-status-time" data-testid="phone-clock">
          {hhmm(now)}
        </span>
        <span className="ph-battery" />
      </div>
      <div className="ph-stage">{inner}</div>
      {/* Кнопка «В запрос» — поверх страницы: внутри экрана её бы масштабировало. */}
      {button && createPortal(button, document.body)}
    </div>
  );
}
