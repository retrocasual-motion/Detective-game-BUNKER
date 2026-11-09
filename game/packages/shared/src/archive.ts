import type { PlayerState } from './schemas.ts';

/**
 * Архив дела на столе (A-260, решения автора 09.11): со старта на стене — персонажи и 01–07,
 * остальные стартовые материалы — в опечатанных конвертах и в коробке «Личные вещи».
 * Конверты упаковал следователь при передаче дела специалисту 16.11.2009. Замков нет:
 * всё вскрывается одним действием в любой момент; содержимое ложится на стену группой под
 * названием конверта.
 */

export type ContainerId = 'protocols' | 'scene' | 'bunker' | 'personal';

export interface Container {
  id: ContainerId;
  /** Надпись на конверте и ярлык группы на стене. */
  label: string;
  /** Что ложится на стену (по описи). */
  files: string[];
  /** Устройства: при вскрытии появляются и на столе (и висят карточками на стене). */
  devices?: string[];
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => String(from + i).padStart(2, '0'));

export const CONTAINERS: readonly Container[] = [
  { id: 'protocols', label: 'Протоколы опроса', files: range(30, 36) },
  {
    id: 'scene',
    label: 'Осмотр места происшествия и изъятое',
    files: ['22', '23', '25', '26', '27', '51', '18', '19', '20', '21'],
    devices: ['24', '47', '48', '49', '50'],
  },
  {
    id: 'bunker',
    label: 'Документация объекта и программы',
    files: [...range(8, 14), '28', '29', '37', '38', '39'],
  },
  { id: 'personal', label: 'Личные вещи', files: range(40, 46) },
];

export const CONTAINER_IDS = CONTAINERS.map((c) => c.id) as [ContainerId, ...ContainerId[]];

/** Газета на столе — бумажный номер (E44, A-260): видна, но на стене со старта не висит. */
export const NEWSPAPER_ID = '15';
/** Сайт газеты — только архив номеров, закладка браузера на компьютере следователя (E44, A-262). */
export const BOOKMARK_IDS = ['17'] as const;
/** Есть у игрока со старта, но не на стене: газета на столе и закладки браузера. */
export const OFF_WALL_IDS = new Set<string>([NEWSPAPER_ID, ...BOOKMARK_IDS]);

/** Что лежит в конверте — материалы и устройства. */
export const containerContents = (c: Container) => [...c.files, ...(c.devices ?? [])];

/**
 * Сохранение без поля `opened` — из времени до конвертов (A-260): у такого игрока всё уже
 * на стене, считаем все конверты вскрытыми.
 */
export const openedOf = (s: Pick<PlayerState, 'opened'>): readonly ContainerId[] =>
  s.opened ?? CONTAINER_IDS;

export const isOpened = (s: Pick<PlayerState, 'opened'>, id: ContainerId) =>
  openedOf(s).includes(id);

/** Стартовые материалы в невскрытых конвертах: их не видно, их не находит поиск (A-196). */
export function sealedIds(s: Pick<PlayerState, 'opened'>): Set<string> {
  const opened = openedOf(s);
  return new Set(CONTAINERS.filter((c) => !opened.includes(c.id)).flatMap(containerContents));
}
