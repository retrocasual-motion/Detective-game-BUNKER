import {
  DELIVERY,
  DELIVERY_CALL,
  deliveredBySave,
  deliveryDue,
  type Material,
  type PlayerState,
  PORTION_2,
  PORTION_2_CONTAINERS,
} from '@bunker/shared';
import { askDelivery } from './api.ts';
import { useCall } from './deskphone/call.ts';
import { useMenu } from './menu/menu-store.ts';
import { useGame } from './store.ts';

/**
 * Поэтапная выдача (SD5-A, A-288 п. 10; автор 26.11). Дело приходит двумя порциями: сначала бумаги,
 * потом — вещественные доказательства из камеры хранения бюро («Изъятое при осмотре места» и «Личные
 * вещи»). Игра считает время игры (`playMs`: идёт, пока дело открыто и видно) и, когда пора
 * (`deliveryDue`), спрашивает сервер; сервер проверяет сам и отдаёт вещдоки. Тогда звонит телефон на
 * столе — дежурный камеры хранения; трубку можно не брать. Короба появляются у стола, когда игрок на
 * стол не смотрит (`boxesIn`: false — несут, true — внесли).
 */

/** Шаг часов игры. */
const TICK_MS = 15_000;

/** Вторая порция уже у игрока (материалы пришли). */
export const hasSecond = (materials: readonly Material[]) =>
  materials.some((m) => PORTION_2.has(m.id));

/**
 * Вещдоки ещё «в камере хранения» (опись — карандашная пометка у строк, коробов на столе нет): не
 * пришли или пришли, но короба ещё несут.
 */
export const inStorage = (s: PlayerState | null, materials: readonly Material[]) =>
  !!s && !deliveredBySave(s) && (!hasSecond(materials) || s.boxesIn === false);

/** Каких коробов камеры хранения на столе пока нет. */
export function absentBoxes(s: PlayerState | null, materials: readonly Material[]) {
  if (!s) return [];
  return inStorage(s, materials)
    ? PORTION_2_CONTAINERS.filter((c) => !(s.opened ?? []).includes(c))
    : [];
}

let asking = false;

/** Пора — спросить сервер; пришло — звонок и «несут» (короба появятся, когда игрок отвернётся). */
export async function checkDelivery(): Promise<void> {
  const g = useGame.getState();
  const s = g.state;
  if (!s || asking || g.elsewhere || hasSecond(g.materials) || deliveredBySave(s)) return;
  if (!deliveryDue(s)) return;
  asking = true;
  try {
    // Сервер проверяет по сохранённому делу — сначала дослать своё.
    await g.flushSave();
    const list = await askDelivery().catch(() => null);
    if (!list) return;
    const now = useGame.getState();
    now.updateState((st) => ({ ...st, boxesIn: false }));
    now.addReleased(list);
    useCall.getState().incoming(DELIVERY_CALL);
  } finally {
    asking = false;
  }
}

/** Прибавить время игры (часы игры; в разработке — `window.__play(мс)` для автотестов). */
export function addPlayTime(ms: number): void {
  useGame
    .getState()
    .updateState((s) => ({ ...s, playMs: Math.min(1e11, (s.playMs ?? 0) + Math.round(ms)) }));
  void checkDelivery();
}

let started = false;

/**
 * Только в разработке — проверять звонок, не дожидаясь 40 минут (автор 27.11), через адресную строку:
 * `?call` — звонок через несколько секунд после того, как дело открыто (и после «Новое дело»);
 * `?fast=60` — часы игры в 60 раз быстрее (20 минут — 20 секунд, 40 минут — 40 секунд): проверить
 * сами правила 70 % / 20 / 40.
 */
function devClock(): { call: boolean; fast: number } {
  if (!import.meta.env.DEV) return { call: false, fast: 1 };
  const q = new URLSearchParams(window.location.search);
  const fast = Number(q.get('fast'));
  return { call: q.has('call'), fast: fast >= 1 && fast <= 600 ? fast : 1 };
}

/** Через сколько после открытия дела звонит `?call`, мс. */
const DEV_CALL_MS = 5000;

/** `?call`: как только дело открыто и вещдоков ещё нет — через пару секунд время «40 минут». */
function callSoon(): void {
  let timer = 0;
  const arm = () => {
    const g = useGame.getState();
    const s = g.state;
    const waiting =
      !!s &&
      !g.elsewhere &&
      useMenu.getState().screen === 'game' &&
      !hasSecond(g.materials) &&
      !deliveredBySave(s);
    if (!waiting) {
      window.clearTimeout(timer);
      timer = 0;
      return;
    }
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      const s2 = useGame.getState().state;
      if (s2) addPlayTime(Math.max(0, DELIVERY.maxMs - (s2.playMs ?? 0)));
    }, DEV_CALL_MS);
  };
  useGame.subscribe(arm);
  useMenu.subscribe(arm);
  arm();
}

/** Часы игры и «внести короба» — один раз на страницу. */
export function startDelivery(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const dev = devClock();
  setInterval(() => {
    const g = useGame.getState();
    // Время — пока дело открыто и видно: не в меню, не в фоне, не в другой вкладке.
    if (document.hidden || !g.state || g.elsewhere || useMenu.getState().screen !== 'game') return;
    addPlayTime(TICK_MS);
  }, TICK_MS / dev.fast);
  if (dev.call) callSoon();
  // Короба несут — внести, как только игрок не смотрит на стол (стена, лист, вещь, устройство).
  useGame.subscribe((g) => {
    const s = g.state;
    if (!s || s.boxesIn !== false) return;
    const away =
      s.view !== 'desk' ||
      !!g.viewerId ||
      !!g.held ||
      g.computerOpen ||
      g.deskPhone ||
      g.notebookOpen ||
      g.searchOpen;
    if (away) g.updateState((st) => ({ ...st, boxesIn: true }));
  });
  if (import.meta.env.DEV)
    (window as unknown as { __play?: (ms: number) => void }).__play = addPlayTime;
}
