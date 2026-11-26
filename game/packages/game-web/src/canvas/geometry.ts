/** Размер листа в мировых координатах — общий со стеной (shared); совпадает с tokens.css. */
export { CARD_H, CARD_W } from '@bunker/shared';

/** Кнопка листа на стене: нить крепится к верху листа, а не к центру. */
export const PIN_Y = 10;

/**
 * Новый номер записки, нити, выписки. `crypto.randomUUID` есть только в защищённом окружении (https
 * или localhost): по http с адреса домашней сети его нет — номер из случайных байт (RV-59).
 */
export const newId = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  // Версия 4 и вариант — как у настоящего UUID.
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
