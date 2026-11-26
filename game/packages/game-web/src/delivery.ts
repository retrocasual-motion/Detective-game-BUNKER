import {
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

/** Часы игры и «внести короба» — один раз на страницу. */
export function startDelivery(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  setInterval(() => {
    const g = useGame.getState();
    // Время — пока дело открыто и видно: не в меню, не в фоне, не в другой вкладке.
    if (document.hidden || !g.state || g.elsewhere || useMenu.getState().screen !== 'game') return;
    addPlayTime(TICK_MS);
  }, TICK_MS);
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
