/** Размер карточки в мировых координатах. Совпадает с --card-width/--card-height в tokens.css. */
export const CARD_W = 160;
export const CARD_H = 220;

/** Булавка копии на доске: нить крепится к верху карточки, а не к центру. */
export const PIN_Y = 12;

export const newId = (): string => crypto.randomUUID();
