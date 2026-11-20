import { create } from 'zustand';
import { phoneCall } from '../api.ts';
import { reducedMotion } from '../motion.ts';
import { dtmf, startTone, type ToneKind } from './tones.ts';

/**
 * Звонок с телефона на столе (6a-3, DP-A): что набрано, снята ли трубка, что слышно. Общий для
 * верха телефона в 3D-сцене (`PhoneFace`) и строки «В трубке» внизу экрана (`DeskPhone`).
 *
 * Как у офисных телефонов конца 2000-х: номер набирают, не снимая трубку (он на экранчике), и
 * снимают трубку — звонок; или снимают трубку — гудок — набирают: через паузу номер пошёл сам. В
 * разговоре цифры — линии (меню: 4 цифры, «#» или пауза). Кнопки под экранчиком: «Стереть»,
 * «Повтор» (последний номер). Положили трубку — отбой. Линии — сервер (`/api/phone`).
 */

export type Phase = 'idle' | 'dialtone' | 'ringing' | 'connected' | 'dead';

interface CallState {
  offHook: boolean;
  dialed: string;
  phase: Phase;
  /** Номер текущего (или последнего) звонка. */
  number: string;
  /** Цифры, набранные в меню линии и ещё не ушедшие. */
  keys: string;
  menu: boolean;
  /** Что слышно (реплики линии и «Набрано: …»). */
  heard: string[];
  talkFrom: number;
  /** Кнопка, утопленная прямо сейчас (на столе — ниже на мгновение). */
  pressed: string | null;
  /** Игрок уже нажимал кнопки или трубку — подсказка «как звонить» больше не нужна (UX-12). */
  used: boolean;
  press(k: string): void;
  handset(): void;
  redial(): void;
  erase(): void;
  hangUp(): void;
}

/** Длина набора на экранчике. */
const MAX = 16;
/** Номер не короче — набор идёт сам через паузу; короче — после долгой паузы (UX-5). */
const MIN = 7;

const ms = () => {
  const fast = reducedMotion();
  return {
    ring: fast ? 250 : 3200,
    autoDial: fast ? 500 : 3000,
    // Недонабранный номер: ждём дольше — вдруг игрок ещё набирает; потом линия отвечает (UX-5).
    shortDial: fast ? 800 : 5000,
    keysSend: fast ? 500 : 2500,
    busy: fast ? 300 : 3000,
  };
};

const digits = (s: string) => s.replace(/\D/g, '').length;
const sleep = (t: number) => new Promise((r) => setTimeout(r, t));

let tone: (() => void) | null = null;
let pressTimer: ReturnType<typeof setTimeout> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Номер звонка: ответ сервера на оборванный звонок не применяется. */
let callNo = 0;
/** Последний набранный номер — для «Повтор» (до перезагрузки, PH-2). */
let lastNumber = '';

function setTone(k: ToneKind | null) {
  tone?.();
  tone = k ? startTone(k) : null;
}
function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

export const useCall = create<CallState>((set, get) => {
  const place = async (n: string) => {
    if (!digits(n)) return;
    lastNumber = n;
    const my = ++callNo;
    clearTimer();
    set({ phase: 'ringing', number: n, heard: [], keys: '', menu: false });
    setTone('ring');
    const t = ms();
    const [r] = await Promise.all([phoneCall(n).catch(() => null), sleep(t.ring)]);
    if (my !== callNo) return;
    if (!r) {
      setTone(null);
      set({ phase: 'dead', heard: ['Нет связи с сервером игры — попробуйте ещё раз.'] });
      return;
    }
    if (!r.connected) {
      set({ phase: 'dead', heard: [r.text] });
      setTone('busy');
      timer = setTimeout(() => setTone(null), t.busy);
      return;
    }
    setTone(null);
    set({ phase: 'connected', menu: r.menu, heard: [r.text], talkFrom: Date.now() });
  };

  const sendKeys = async (k: string) => {
    if (!k) return;
    const my = callNo;
    const r = await phoneCall(get().number, k).catch(() => null);
    if (my !== callNo || !r) return;
    set((s) => ({ heard: [...s.heard, `Набрано: ${k}`, r.text], menu: r.menu }));
  };

  return {
    offHook: false,
    dialed: '',
    phase: 'idle',
    number: '',
    keys: '',
    menu: false,
    heard: [],
    talkFrom: 0,
    pressed: null,
    used: false,

    press(k) {
      dtmf(k);
      set({ pressed: k, used: true });
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = setTimeout(() => set({ pressed: null }), 160);
      const s = get();
      if (s.phase === 'connected') {
        if (!s.menu) return;
        clearTimer();
        if (k === '#') {
          set({ keys: '' });
          void sendKeys(s.keys);
          return;
        }
        const nk = (s.keys + k).slice(0, 8);
        // Номер партии и номер заказа в деле — четыре цифры; можно и «#», и подождать.
        if (digits(nk) >= 4) {
          set({ keys: '' });
          void sendKeys(nk);
        } else {
          set({ keys: nk });
          timer = setTimeout(() => {
            set({ keys: '' });
            void sendKeys(nk);
          }, ms().keysSend);
        }
        return;
      }
      if (s.phase === 'ringing' || s.phase === 'dead') return;
      const nd = (s.dialed + k).slice(0, MAX);
      set({ dialed: nd, phase: s.phase === 'dialtone' ? 'idle' : s.phase });
      if (s.offHook) {
        // Трубка снята: гудок стих с первой цифрой; пауза — номер пошёл.
        if (s.phase === 'dialtone') setTone(null);
        clearTimer();
        // Короткий набор — тоже звонок, но после долгой паузы: линия ответит «не обслуживается»,
        // а не тишина без конца (UX-5, VF-1).
        const wait = digits(nd) >= MIN ? ms().autoDial : ms().shortDial;
        if (digits(nd)) timer = setTimeout(() => void place(nd), wait);
      }
    },

    handset() {
      const s = get();
      if (s.offHook) {
        get().hangUp();
        return;
      }
      set({ offHook: true, used: true });
      if (digits(s.dialed) >= MIN) void place(s.dialed);
      else {
        set({ phase: 'dialtone' });
        setTone('dial');
        // Набрано меньше номера и трубку сняли — ждём остальные цифры, потом звонок (UX-5).
        const nd = s.dialed;
        clearTimer();
        if (digits(nd)) timer = setTimeout(() => void place(nd), ms().shortDial);
      }
    },

    redial() {
      const s = get();
      if (!lastNumber || s.phase === 'ringing' || s.phase === 'connected') return;
      clearTimer();
      set({ dialed: lastNumber });
      // Трубка снята — сразу звонок; лежит — номер на экранчике, звонок — снять трубку.
      if (s.offHook) {
        setTone(null);
        void place(lastNumber);
      }
    },

    erase() {
      const s = get();
      if (s.phase !== 'idle' && s.phase !== 'dialtone') return;
      clearTimer();
      set({ dialed: s.dialed.slice(0, -1) });
    },

    hangUp() {
      callNo++;
      clearTimer();
      setTone(null);
      set({ phase: 'idle', offHook: false, dialed: '', keys: '', menu: false });
    },
  };
});
