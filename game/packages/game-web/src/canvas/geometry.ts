/** Размер листа в мировых координатах — общий со стеной (shared); совпадает с tokens.css. */
export { CARD_H, CARD_W } from '@bunker/shared';

/** Кнопка листа на стене: нить крепится к верху листа, а не к центру. */
export const PIN_Y = 10;

export const newId = (): string => crypto.randomUUID();
