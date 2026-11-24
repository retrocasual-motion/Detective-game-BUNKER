import type { PlayerState } from './schemas.ts';

/**
 * Архив дела на столе (A-260, решения автора 09.11): со старта на стене — персонажи и 01–07,
 * остальные стартовые материалы — в опечатанных конвертах и в коробке «Личные вещи».
 * Конверты упаковал следователь при передаче дела специалисту 16.11.2009. Замков нет:
 * всё вскрывается одним действием в любой момент; содержимое ложится на стену группой под
 * названием конверта.
 */

export type ContainerId = 'protocols' | 'scene' | 'bunker' | 'personal' | 'bank';

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
    files: [...range(8, 14), '28', '37', '38', '39'],
    // Пачки бумаг из помещений (29) — коробка с девятью пачками, физическая улика (PH-B, решение
    // автора 10.11): берут в руки, а не читают листом.
    devices: ['29'],
  },
  { id: 'personal', label: 'Личные вещи', files: range(40, 46) },
  /**
   * Коробка из банка (A-272, AC-4): появляется на столе после формы «Сообщить о смерти
   * арендатора» (L460 открыт). Опись и лист акта — на стену; микрокассета с проигрывателем бюро
   * (L462) — на стол, слушают на проигрывателе.
   */
  {
    id: 'bank',
    label: 'Aspen Bank · ячейка № 845 · вскрыта 17.11.2009',
    files: ['L460', 'L461'],
    devices: ['L462'],
  },
];

export const CONTAINER_IDS = CONTAINERS.map((c) => c.id) as [ContainerId, ...ContainerId[]];

/** Изъятые вещи (24, 47–50, коробка пачек 29, кассета с проигрывателем L462): берут в руки. */
export const DEVICE_IDS: ReadonlySet<string> = new Set(CONTAINERS.flatMap((c) => c.devices ?? []));

/**
 * 3D-стол (автор 24.11, вместо A-260 п. 3): эти конверты при вскрытии высыпаются на стол —
 * листы и устройства из DESK_DEVICES ложатся свободно; игрок сам вешает их на стену. Коробки
 * «Личные вещи» и из банка — пока как раньше, на стену.
 */
export const SPILL_CONTAINERS: ReadonlySet<ContainerId> = new Set(['protocols', 'scene', 'bunker']);
/**
 * Изъятые устройства, которые лежат на столе свободно и двигаются, как листы (автор 24.11: «все
 * устройства… ноутбук и радиопост тоже»): камера 24, ноутбук 47, телефон 48, ручка 49,
 * радиопост 50. Коробка пачек 29 и проигрыватель с кассетой L462 — пока на своих местах.
 */
export const DESK_DEVICES: ReadonlySet<string> = new Set(['24', '47', '48', '49', '50']);
/**
 * Можно ли повесить устройство на стену (автор 24.11: «не хочу… наверное… нужно подумать» —
 * пока нет): устройство всегда на столе, к нему возвращаются. Карточка устройства на стене из
 * старого сохранения уходит — устройство ложится на стол.
 */
export const DEVICES_ON_WALL = false;

/** Газета на столе — бумажный номер (E44, A-260): видна, но на стене со старта не висит. */
export const NEWSPAPER_ID = '15';
/** Сайт газеты — только архив номеров, закладка браузера на компьютере следователя (E44, A-262). */
export const BOOKMARK_IDS = ['17'] as const;
/**
 * Конверт «Прил. 7 · Сервер VL-31» с диском (A-272, AC-2): лежит на столе, пока диск не вставлен
 * в дисковод компьютера; на стену не попадает никогда — это носитель, а не лист.
 */
export const SERVER_DISC_ID = '52';
/** Журналы сервера (L214) открываются, когда диск вставлен: по ним видно, что он в компьютере. */
export const SERVER_LOG_ID = 'L214';
/** Не висят на стене ни при каком сохранении. */
export const NEVER_ON_WALL = new Set<string>([SERVER_DISC_ID]);
/** Есть у игрока со старта, но не на стене: газета на столе, закладки браузера, конверт с диском. */
export const OFF_WALL_IDS = new Set<string>([NEWSPAPER_ID, ...BOOKMARK_IDS, SERVER_DISC_ID]);

/** Что лежит в конверте — материалы и устройства. */
export const containerContents = (c: Container) => [...c.files, ...(c.devices ?? [])];

/**
 * Сохранение без поля `opened` — из времени до конвертов (A-260): у такого игрока всё уже
 * на стене, считаем все конверты вскрытыми.
 */
export const openedOf = (s: Pick<PlayerState, 'opened'>): readonly ContainerId[] =>
  s.opened ?? CONTAINER_IDS;

/** Коробка банка на столе: её содержимое открыто движком (A-272). */
export const BANK_BOX_ID: ContainerId = 'bank';
export const BANK_LIST_ID = 'L460';

export const isOpened = (s: Pick<PlayerState, 'opened'>, id: ContainerId) =>
  openedOf(s).includes(id);

/** Стартовые материалы в невскрытых конвертах: их не видно, их не находит поиск (A-196). */
export function sealedIds(s: Pick<PlayerState, 'opened'>): Set<string> {
  const opened = openedOf(s);
  return new Set(CONTAINERS.filter((c) => !opened.includes(c.id)).flatMap(containerContents));
}
