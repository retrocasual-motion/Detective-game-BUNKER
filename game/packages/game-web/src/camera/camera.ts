import { create } from 'zustand';
import { postAction } from '../api.ts';
import { useGame } from '../store.ts';
import { FRAME_COUNT } from './frames.ts';

/**
 * Камера инженера в режиме просмотра (24; A-268, решения автора 17.11 — «как телефон»: вплотную
 * экран живой, кнопки на корпусе). Устроена по референсам компактных камер 2009 года (Canon
 * PowerShot SD1200 / IXUS 95, Sony W290): ◀ ▶ — кадр, DISP — информация (простая → подробная с
 * датой и временем → без информации), рычажок T — увеличить (×2…×10), W — уменьшить и таблица по
 * девять кадров, MENU — меню: «Slideshow» и настройки (только то, что работает — A-269).
 * «Подробная» — это «свойства» (ОСМОТР 24 свойства → L973), увеличение — «увеличить»
 * (ОСМОТР 24 увеличить → L905): движок открывает их при первом нажатии.
 */

export type CamMode = 'single' | 'index' | 'menu';
/** 0 — простая информация, 1 — подробная (дата и время), 2 — без информации. */
export type Disp = 0 | 1 | 2;

export const MENU = [
  // Только то, что работает (автор 17.11: «всё остальное можно убрать»).
  { tab: 'play', items: ['Slideshow'] },
  { tab: 'setup', items: ['Mute', 'LCD Brightness', 'Language'] },
] as const;
const ZOOMS = [1, 2, 4, 6, 8, 10];

/** Язык экрана камеры (Set up → Language): как у камер того времени — английский или русский. */
export type Lang = 'en' | 'ru';
const WORDS: Record<string, string> = {
  Slideshow: 'Слайд-шоу',
  Mute: 'Без звука',
  'LCD Brightness': 'Яркость экрана',
  Language: 'Язык',
  'Set up': 'Настройка',
  'MENU Exit': 'MENU Выход',
  On: 'Вкл.',
  Off: 'Выкл.',
  English: 'English',
};
/** Надпись на экране камеры на выбранном языке. */
export const say = (lang: Lang, s: string) => (lang === 'ru' ? (WORDS[s] ?? s) : s);

interface Cam {
  frame: number;
  mode: CamMode;
  /** Ступень увеличения (индекс ZOOMS): 0 — без увеличения. */
  zoom: number;
  disp: Disp;
  tab: 0 | 1;
  item: number;
  slideshow: boolean;
  /** Set up: без звука, яркость экрана (1…5), язык. */
  mute: boolean;
  bright: number;
  lang: Lang;
  reset(): void;
  /** Мышью по меню: вкладка или пункт (пункт — выбрать и нажать SET). */
  pickTab(t: 0 | 1): void;
  pick(item: number): void;
  left(): void;
  right(): void;
  up(): void;
  down(): void;
  set(): void;
  display(): void;
  menu(): void;
  tele(): void;
  wide(): void;
}

let showT: ReturnType<typeof setInterval> | null = null;

const has = (id: string) => useGame.getState().materials.some((m) => m.id === id);
/** Открыть материал камеры движком (один раз). */
async function ask(value: string, id: string) {
  if (has(id)) return;
  const r = await postAction('ОСМОТР', '24', value).catch(() => null);
  if (r?.released.length) useGame.getState().addFound(r.released, '24', []);
}

export const zoomOf = (k: number) => ZOOMS[k] ?? 1;

export const useCamera = create<Cam>((set, get) => {
  const stopShow = () => {
    if (showT) clearInterval(showT);
    showT = null;
    if (get().slideshow) set({ slideshow: false });
  };
  const step = (d: number) =>
    set({ frame: ((get().frame - 1 + d + FRAME_COUNT) % FRAME_COUNT) + 1, zoom: 0 });
  return {
    // Камера открывается на последнем снятом кадре — как настоящая в режиме просмотра.
    frame: FRAME_COUNT,
    mode: 'single',
    zoom: 0,
    disp: 0,
    tab: 0,
    item: 0,
    slideshow: false,
    mute: true,
    bright: 3,
    lang: 'en',
    pickTab(t) {
      set({ tab: t, item: 0 });
    },
    pick(item) {
      set({ item });
      get().set();
    },
    reset() {
      stopShow();
      set({ mode: 'single', zoom: 0, tab: 0, item: 0 });
    },
    left() {
      stopShow();
      const { mode, zoom } = get();
      if (mode === 'menu') set({ tab: get().tab === 0 ? 1 : 0, item: 0 });
      else if (mode === 'index') step(-1);
      else if (!zoom) step(-1);
    },
    right() {
      stopShow();
      const { mode, zoom } = get();
      if (mode === 'menu') set({ tab: get().tab === 0 ? 1 : 0, item: 0 });
      else if (mode === 'index') step(1);
      else if (!zoom) step(1);
    },
    up() {
      stopShow();
      const { mode, tab, item } = get();
      if (mode === 'menu')
        set({ item: (item - 1 + MENU[tab].items.length) % MENU[tab].items.length });
      else if (mode === 'index') step(-3);
    },
    down() {
      stopShow();
      const { mode, tab, item } = get();
      if (mode === 'menu') set({ item: (item + 1) % MENU[tab].items.length });
      else if (mode === 'index') step(3);
    },
    set() {
      stopShow();
      const { mode, tab, item } = get();
      if (mode === 'index') {
        set({ mode: 'single' });
        return;
      }
      if (mode !== 'menu') return;
      const name = MENU[tab].items[item];
      if (name === 'Slideshow') {
        set({ mode: 'single', zoom: 0, slideshow: true });
        showT = setInterval(() => step(1), 3000);
      } else if (name === 'Mute') set({ mute: !get().mute });
      else if (name === 'LCD Brightness') set({ bright: (get().bright % 5) + 1 });
      else if (name === 'Language') set({ lang: get().lang === 'en' ? 'ru' : 'en' });
    },
    display() {
      stopShow();
      const disp = ((get().disp + 1) % 3) as Disp;
      set({ disp });
      if (disp === 1) void ask('свойства', 'L973');
    },
    menu() {
      stopShow();
      set({ mode: get().mode === 'menu' ? 'single' : 'menu', zoom: 0, tab: 0, item: 0 });
    },
    tele() {
      stopShow();
      const { mode, zoom } = get();
      if (mode === 'menu') return;
      if (mode === 'index') {
        set({ mode: 'single' });
        return;
      }
      set({ zoom: Math.min(ZOOMS.length - 1, zoom + 1) });
      void ask('увеличить', 'L905');
    },
    wide() {
      stopShow();
      const { mode, zoom } = get();
      if (mode === 'menu') return;
      if (zoom) set({ zoom: zoom - 1 });
      else if (mode === 'single') set({ mode: 'index' });
    },
  };
});

/** Отложили камеру — просмотр с начала (кадр остаётся). */
export const stopCamera = () => useCamera.getState().reset();
