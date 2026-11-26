import { getMaterials, openSiteAddress } from './api.ts';
import { useGame } from './store.ts';

/**
 * Перейти на сайт дела (A-272, AC-3; A-288 п. 9): сервер спрашивает движок (АДРЕС) и отвечает
 * адресом страницы — она откроется в окне браузера устройства, внутри игры; не открылось — ответ
 * («Страница не найдена (404)…»). Настоящая вкладка браузера не открывается.
 */
export async function goToSite(address: string): Promise<{ address: string } | { reply: string }> {
  const r = await openSiteAddress(address).catch(() => null);
  if (!r) return { reply: 'Нет связи с сервером игры.' };
  await refreshMaterials();
  return r.address ? { address: r.address } : { reply: r.reply ?? 'Страница не найдена (404).' };
}

/** Открытое на сайте (кабинет, коробка банка) — сразу в деле. */
export async function refreshMaterials(): Promise<void> {
  const list = await getMaterials().catch(() => null);
  if (list) useGame.getState().addReleased(list);
}

/** Домен адреса: без протокола, www и пути. */
export const domainOf = (address: string) =>
  (
    address
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split(/[/?#]/)[0] ?? ''
  ).replace(/^www\./, '');
