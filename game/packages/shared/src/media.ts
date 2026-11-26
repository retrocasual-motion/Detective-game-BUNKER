/**
 * Медиа из папки `bunker-media` (T-…, автор 25.11): тяжёлые файлы (текстуры, звук, видео) лежат вне
 * git (ART-10). Сервер игры отдаёт их по `/api/media/<имя>` — только из этого списка, не всю папку:
 * в ней черновики, маски и запасные сборки (у P-A по клею проступают лишние клетки знака — A-226).
 * Нет папки или файла (CI, чужая машина) — 404; игра рисует вместо текстуры заглушку.
 */
/**
 * `material` — что должно быть у игрока, чтобы файл отдавался (RV-67, P-10): медиа — по открытому, а
 * не любому вошедшему.
 */
export const MEDIA: Readonly<Record<string, { path: string; type: string; material: string }>> = {
  /** Наклейка на дне ноутбука Адама (A-283, ART-58, L947): T-B, PNG с прозрачностью 1652 × 1302. */
  'sticker-47': {
    path: 'assets/07_evidence_3d/47_laptop_sticker/sticker_47_v3_rgba.png',
    type: 'image/png',
    material: '47',
  },
};

/** Адрес файла медиа для игры. */
export const mediaUrl = (name: keyof typeof MEDIA & string) => `/api/media/${name}`;
