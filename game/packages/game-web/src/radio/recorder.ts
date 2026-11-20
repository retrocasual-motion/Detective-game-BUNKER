import { create } from 'zustand';
import { postAction } from '../api.ts';
import { zoomFactor } from '../input.ts';
import { useGame } from '../store.ts';
import {
  captionAt,
  clusters,
  fromClock,
  listenLine,
  parseRecord,
  RECORD_LENGTH,
  type RecEvent,
  soundStarts,
  windows,
} from './record.ts';

/**
 * Регистратор радиопоста — одно состояние для экрана (DOM поверх модели) и клавиш на модели
 * (этап 4d-1; «работать прямо на модели» — автор 12.11). Звука в сборке нет: часы виртуальные.
 */

/** Самая подробная видимая часть шкалы — минута. */
const MIN_VIEW = 60;
type Mark = { t: number; label: string };
type View = { from: number; to: number };

interface Recorder {
  events: RecEvent[];
  sounds: number[];
  win: View;
  pos: number;
  playing: boolean;
  view: View;
  marks: Mark[];
  /** Ответ движка «прослушать» для точки at. */
  heard: { at: number; text: string } | null;
  labeling: string | null;
  photo: number | null;
  /** Ширина шкалы на экране, px — для «звук ⏮/⏭» по видимым полосам. */
  stripPx: number;
  /** Стрелка приёмника: доля шкалы 0…1 (приёмник обесточен — только механика). */
  needle: number;
  mode: 'ПОИСК' | 'РУЧН.';
  init(body50: string): void;
  seek(t: number): void;
  toggle(): void;
  prevSound(): void;
  nextSound(): void;
  setView(v: View): void;
  /** `zoom` — сила прокрутки в пикселях (> 0 — мельче). */
  zoom(k: number, zoom: number): void;
  setLabeling(s: string | null): void;
  saveMark(): void;
  removeMark(m: Mark): void;
  setPhoto(k: number | null): void;
  turnKnob(d: number): void;
  flip(): void;
  setMode(m: 'ПОИСК' | 'РУЧН.'): void;
}

const clampView = (win: View, from: number, to: number): View => {
  const len = Math.max(MIN_VIEW, Math.min(win.to - win.from, to - from));
  const f = Math.max(win.from, Math.min(win.to - len, from));
  return { from: f, to: f + len };
};

/** Стрелка при изъятии — у метки «гражд.» (A-267). */
export const NEEDLE_AT_SEIZURE = 0.38;

let timer: ReturnType<typeof setInterval> | null = null;
let saveT: ReturnType<typeof setTimeout> | null = null;
let listenT: ReturnType<typeof setTimeout> | null = null;

export const useRecorder = create<Recorder>((set, get) => {
  const persist = () => {
    if (saveT) clearTimeout(saveT);
    saveT = setTimeout(() => {
      const { pos, marks } = get();
      useGame.getState().updateState((s) => ({ ...s, radio: { pos: Math.round(pos), marks } }));
    }, 500);
  };
  // На паузе — «прослушать» эту точку (движок; общий ответ — молча).
  const listen = () => {
    if (listenT) clearTimeout(listenT);
    if (get().playing) return;
    const at = Math.round(get().pos);
    listenT = setTimeout(async () => {
      const r = await postAction('ОСМОТР', '50', listenLine(at)).catch(() => null);
      if (Math.round(get().pos) !== at || get().playing) return;
      set({ heard: r && !r.quiet && r.reply ? { at, text: r.reply } : null });
    }, 500);
  };
  const follow = (pos: number) => {
    const { view, win } = get();
    if (pos >= view.from && pos <= view.to) return;
    const len = view.to - view.from;
    set({ view: clampView(win, pos - len * 0.2, pos + len * 0.8) });
  };
  return {
    events: [],
    sounds: [],
    win: { from: 0, to: 1 },
    pos: 0,
    playing: false,
    view: { from: 0, to: 1 },
    marks: [],
    heard: null,
    labeling: null,
    photo: null,
    stripPx: 1000,
    needle: NEEDLE_AT_SEIZURE,
    mode: 'ПОИСК',

    init(body50) {
      const events = parseRecord(body50);
      const w = windows()[0];
      const win = w ? { from: w.from, to: w.to } : { from: 0, to: 1 };
      const saved = useGame.getState().state?.radio;
      set({
        events,
        sounds: soundStarts(events),
        win,
        view: win,
        pos: saved?.pos ?? fromClock(13, 7 * 3600 + 30 * 60),
        marks: saved?.marks ?? [],
        playing: false,
        heard: null,
        labeling: null,
        photo: null,
        // Взяли стойку снова — ручка и переключатель как при изъятии (RS-A).
        needle: NEEDLE_AT_SEIZURE,
        mode: 'ПОИСК',
      });
      listen();
    },
    seek(t) {
      const pos = Math.max(0, Math.min(RECORD_LENGTH - 1, t));
      set({ pos, photo: null });
      follow(pos);
      persist();
      listen();
    },
    toggle() {
      const playing = !get().playing;
      set({ playing });
      if (timer) clearInterval(timer);
      timer = null;
      if (playing)
        timer = setInterval(() => {
          const n = Math.min(RECORD_LENGTH, get().pos + 0.25);
          set({ pos: n });
          follow(n);
          if (n >= RECORD_LENGTH) get().toggle();
        }, 250);
      else {
        persist();
        listen();
      }
    },
    prevSound() {
      const { sounds, view, stripPx, pos } = get();
      const s = [...clusters(sounds, (6 * (view.to - view.from)) / stripPx)]
        .reverse()
        .find((t) => t < pos - 1);
      if (s !== undefined) get().seek(s);
    },
    nextSound() {
      const { sounds, view, stripPx, pos } = get();
      const s = clusters(sounds, (6 * (view.to - view.from)) / stripPx).find((t) => t > pos + 0.5);
      if (s !== undefined) get().seek(s);
    },
    setView(v) {
      set({ view: clampView(get().win, v.from, v.to) });
    },
    zoom(k, zoom) {
      const { view, win } = get();
      const len = view.to - view.from;
      const at = view.from + k * len;
      const next = len / zoomFactor(zoom, 1.4);
      set({ view: clampView(win, at - k * next, at + (1 - k) * next) });
    },
    setLabeling(s) {
      set({ labeling: s });
    },
    saveMark() {
      const { pos, labeling, marks } = get();
      set({
        marks: [...marks, { t: Math.round(pos), label: (labeling ?? '').trim().slice(0, 60) }].sort(
          (a, b) => a.t - b.t,
        ),
        labeling: null,
      });
      persist();
    },
    removeMark(m) {
      set({ marks: get().marks.filter((x) => x !== m) });
      persist();
    },
    setPhoto(k) {
      set({ photo: k });
      // Снимок стойки вплотную — крупный план фото (L906, F4): как «увеличить» у листа 50.
      if (k !== null && !useGame.getState().materials.some((m) => m.id === 'L906'))
        void postAction('ОСМОТР', '50', 'увеличить')
          .then((r) => {
            if (r.released.length) useGame.getState().addFound(r.released, '50', []);
          })
          .catch(() => undefined);
    },
    turnKnob(d) {
      // Стрелка ходит в пределах шкалы (риски — от 0,1 до 0,96 её ширины).
      set({ needle: Math.max(0.1, Math.min(0.96, get().needle + d)) });
    },
    flip() {
      set({ mode: get().mode === 'ПОИСК' ? 'РУЧН.' : 'ПОИСК' });
    },
    setMode(mode) {
      set({ mode });
    },
  };
});

/** Остановить ход записи (отложили стойку). */
export function stopRecorder() {
  if (timer) clearInterval(timer);
  timer = null;
  useRecorder.setState({ playing: false });
}

/** Что слышно сейчас — для подписи и индикаторов. */
export const captionNow = (r: Pick<Recorder, 'events' | 'pos'>) => captionAt(r.events, r.pos);
