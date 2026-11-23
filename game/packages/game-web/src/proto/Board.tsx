import type { Viewport } from '../room/camera.ts';
import { sizeOf } from './deskWorld.ts';

/**
 * Прототип: стена дела — упрощённая DOM-доска (в игре — наша настоящая стена, `WallView`). Она
 * лежит в той же CSS-перспективе, что и раньше; 3D-стол — холстом поверх, с дырой в стене.
 * Здесь важно одно: брошенная со стола вещь висит там, где её отпустили (автор 23.11), и становится
 * карточкой ровно там, где её довёл полёт.
 */

export const GROUP_LABEL = 'Осмотр места происшествия и изъятое';

const PEOPLE = [
  'Адам Коул',
  'Эмма Пирс',
  'Дэн Миллер',
  'Кейт Уолш',
  'Лея Моро',
  'Мика Сато',
  'Ник Харт',
  'Габриэль Силва',
];

export interface WallCard {
  id: string;
  title: string;
  kind: string;
  /** Центр карточки на доске, px доски: там, где вещь отпустили. */
  x: number;
  y: number;
  fresh: boolean;
}

/** Ширина карточки на доске, px доски (доска — копия экрана). */
export const cardW = (vp: Viewport) => Math.round(vp.width * 0.058);
/** Высота карточки — по пропорциям самой вещи (лист, половина, диск, устройство). */
export const cardH = (vp: Viewport, kind: string) => {
  const [w, d] = sizeOf(kind);
  return Math.round(cardW(vp) * Math.min(1.5, Math.max(0.55, d / w)));
};

export function Board({
  vp,
  starting,
  cards,
}: {
  vp: Viewport;
  starting: { id: string; title: string }[];
  cards: WallCard[];
}) {
  const w = cardW(vp);
  const h = cardH(vp, 'sheet');
  const rowX = (k: number, n: number) => vp.width / 2 + (k - (n - 1) / 2) * (w * 1.35);
  return (
    <div className="proto-board">
      <div className="proto-cork" />
      {PEOPLE.map((name, k) => (
        <div
          key={name}
          className="proto-card proto-person"
          style={{
            left: rowX(k, PEOPLE.length) - w / 2,
            top: vp.height * 0.07,
            width: w,
            height: h * 0.8,
          }}
        >
          <span className="proto-face" />
          <span>{name}</span>
        </div>
      ))}
      {starting.map((m, k) => (
        <div
          key={m.id}
          className="proto-card"
          style={{
            left: rowX(k, starting.length) - w / 2,
            top: vp.height * 0.3,
            width: w,
            height: h,
          }}
        >
          <b>{m.id}</b>
          <span>{m.title}</span>
        </div>
      ))}
      {cards.map((c) => {
        const at = c;
        const ch = cardH(vp, c.kind);
        return (
          <div
            key={c.id}
            className={`proto-card${c.fresh ? ' proto-fresh' : ''}`}
            data-testid={`wall-${c.id}`}
            style={{ left: at.x - w / 2, top: at.y - ch / 2, width: w, height: ch }}
          >
            <b>{c.id}</b>
            <span>{c.title}</span>
          </div>
        );
      })}
    </div>
  );
}
