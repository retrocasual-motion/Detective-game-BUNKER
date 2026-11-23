import type { Viewport } from '../room/camera.ts';

/**
 * Прототип: стена дела — упрощённая DOM-доска (в игре — наша настоящая стена, `WallView`). Она
 * лежит в той же CSS-перспективе, что и раньше; 3D-стол — холстом поверх, с дырой в стене.
 * Здесь важно одно: брошенный со стола лист прилетает в группу конверта и становится карточкой
 * ровно там, где его довёл полёт.
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
  slot: number;
  fresh: boolean;
}

/** Ширина карточки на доске, px доски (доска — копия экрана). */
export const cardW = (vp: Viewport) => Math.round(vp.width * 0.058);
/** Высота карточки по виду вещи: лист — как A4, половина — ниже, диск — квадрат. */
export const cardH = (vp: Viewport, kind: string) =>
  Math.round(
    cardW(vp) *
      (kind === 'disc' ? 1 : kind === 'half' ? 0.714 : kind === 'photos' ? 0.67 : Math.SQRT2),
  );

const groupTop = (vp: Viewport) => vp.height * 0.56;
const groupLeft = (vp: Viewport) => vp.width * 0.3;

/** Центр места № slot в группе конверта, px доски. */
export function slotCenter(vp: Viewport, slot: number) {
  const w = cardW(vp);
  const h = cardH(vp, 'sheet');
  const col = slot % 6;
  const row = Math.floor(slot / 6);
  return {
    x: groupLeft(vp) + col * (w + 12) + w / 2,
    y: groupTop(vp) + 30 + row * (h + 10) + h / 2,
  };
}

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
      {cards.length > 0 && (
        <div className="proto-group" style={{ left: groupLeft(vp), top: groupTop(vp) }}>
          {GROUP_LABEL}
        </div>
      )}
      {cards.map((c) => {
        const at = slotCenter(vp, c.slot);
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
