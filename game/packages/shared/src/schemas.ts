import { z } from 'zod';
import { CONTAINER_IDS } from './archive.ts';

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 3;

/**
 * Каким предметом материал лежит на столе (TECH_PLAN 4.2, UX-A1): форма по типу, не по значимости.
 * sheet — лист на бланке; stapled — скреплённые листы; half — половина листа; photos — отпечатки;
 * pack — пачка сканов; notebook — тетрадь; disc — диск в конверте; bag — пакет вещдоков;
 * folded — лист, сложенный вдвое (подлинник акта из ячейки, A-272): сгиб виден.
 */
export const MaterialKindSchema = z.enum([
  'sheet',
  'stapled',
  'half',
  'photos',
  'pack',
  'notebook',
  'disc',
  'bag',
  'folded',
]);
export type MaterialKind = z.infer<typeof MaterialKindSchema>;

export const MaterialSchema = z.object({
  /**
   * 01…52 — стартовые; L101…L999 — закрытые (открываются действиями игрока).
   */
  id: z.string().regex(/^(\d{2}|L\d{3})$/),
  title: z.string().min(1),
  placement: z.enum(['desk', 'evidence']),
  kind: MaterialKindSchema,
  body: z.string(),
  sourceFile: z.string(),
});
export type Material = z.infer<typeof MaterialSchema>;

export const CameraSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().min(ZOOM_MIN).max(ZOOM_MAX),
});
export type Camera = z.infer<typeof CameraSchema>;

/**
 * Что висит на стене: материал дела (01…51, L…), карточка персонажа («p:…») или записка
 * игрока («n:…»). Место, наклон на одной кнопке, порядок наложения.
 */
export const WallItemSchema = z.object({
  id: z.string().min(1).max(80),
  x: z.number(),
  y: z.number(),
  z: z.number().int(),
  rot: z.number().min(-180).max(180),
});
export type WallItem = z.infer<typeof WallItemSchema>;

/** Нить между двумя вещами на стене; игра её не читает и не проверяет (T-5-A). */
export const ThreadSchema = z.object({
  id: z.string().min(1).max(64),
  from: z.string(),
  to: z.string(),
  label: z.string().max(200),
});
export type Thread = z.infer<typeof ThreadSchema>;

/** Записка игрока (карточка) или ярлык (полоска — заголовок своей группы); игра их не читает. */
export const NoteSchema = z.object({
  id: z.string().regex(/^n:[\w-]{1,64}$/),
  kind: z.enum(['note', 'label']),
  text: z.string().max(500),
  /** Размер шрифта, px (по умолчанию — NOTE_STYLE). */
  size: z.number().int().min(10).max(64).optional(),
  /** Ширина, мировые px (по умолчанию — NOTE_STYLE). */
  width: z.number().min(80).max(900).optional(),
});
export type Note = z.infer<typeof NoteSchema>;

/**
 * Выписка на стену (A-272, AC-6; DB-B): выделенные слова с сайта, из почты, с экрана устройства —
 * карточкой-каталожкой рукой следователя; внизу источник, «открыть» — источник на этом месте.
 * Материал — откуда выписано (для формы заключения и P-10: только открытое игроком).
 */
export const ExcerptPlaceSchema = z.object({
  kind: z.enum(['site', 'pc', 'laptop', 'phone', 'camera']),
  /** Сайт: адрес с путём (`vaultline-program.com/cabinet`). */
  address: z.string().max(300).optional(),
  /** Веб-почта: номер письма. */
  letter: z.number().int().min(1).max(999).optional(),
});
export const ExcerptSchema = z.object({
  id: z.string().regex(/^x:[\w-]{1,64}$/),
  text: z.string().min(1).max(600),
  material: z.string().regex(/^(\d{2}|L\d{3})$/),
  source: z.string().max(160),
  place: ExcerptPlaceSchema,
});
export type WallExcerpt = z.infer<typeof ExcerptSchema>;

/**
 * Карточка (K-A): выделенная строка материала или материал целиком (тогда цитата — его
 * название) — опора в форме заключения (FM-A). У карточки нет типов, меток и подсветки (P-1).
 * M001… — письма-ответы на запросы, снятые A-272: номер остаётся допустимым, чтобы старое
 * сохранение с такой карточкой читалось (карточка просто не найдёт материала).
 */
export const CardSchema = z.object({
  file: z.string().regex(/^(\d{2}|L\d{3}|M\d{3})$/),
  quote: z.string().min(1).max(2000),
});
export type Card = z.infer<typeof CardSchema>;

/**
 * Ответ на вопрос формы заключения (A-270; FM-A): человек (id карточки или «nobody»), карточка
 * материала (как в запросе) или номер варианта. Своего текста нет. null — пусто.
 */
export const VerdictAnswerSchema = z
  .union([
    z.object({ person: z.string().min(1).max(40) }),
    z.object({ card: CardSchema }),
    z.object({ choice: z.number().int().min(0).max(9) }),
  ])
  .nullable();
export type VerdictAnswer = z.infer<typeof VerdictAnswerSchema>;
/** Сколько вопросов в форме L999 (A-270). */
export const VERDICT_QUESTIONS = 5;
export const VerdictSchema = z.object({
  answers: z.array(VerdictAnswerSchema).length(VERDICT_QUESTIONS),
});

/** Виды: стол (от первого лица) и стена (рабочая поверхность) — решение автора 08.11. */
export const ViewSchema = z.enum(['desk', 'wall']);
export type View = z.infer<typeof ViewSchema>;

/** Окно на рабочем столе ноутбука: что в нём (вид и путь или адрес), где, какого размера. */
export const LapWindowSchema = z.object({
  id: z.string().min(1).max(240),
  kind: z.enum(['folder', 'file', 'props', 'browser', 'printer']),
  /** Папка или файл: путь от рабочего стола («Тревога/vneshnee_take1.wav»). */
  path: z.string().max(240).optional(),
  /** Браузер: открытый адрес. */
  url: z.string().max(400).optional(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  z: z.number(),
  min: z.boolean(),
  max: z.boolean(),
});
export type LapWindow = z.infer<typeof LapWindowSchema>;

export const LaptopDeskSchema = z.object({
  /** Значки, которые игрок передвинул: имя → место (px экрана ноутбука). */
  icons: z.record(z.string().max(120), z.object({ x: z.number(), y: z.number() })).optional(),
  windows: z.array(LapWindowSchema).max(30).optional(),
});
export type LaptopDesk = z.infer<typeof LaptopDeskSchema>;

/** Окно компьютера следователя (4c-3): те же поля; path — материал (документ, вкладка терминала). */
export const PcWindowSchema = LapWindowSchema.extend({
  kind: z.enum(['incoming', 'terminal', 'browser', 'doc', 'mbx', 'enc']),
});
export type PcWindow = z.infer<typeof PcWindowSchema>;
export const PcDeskSchema = z.object({
  icons: z.record(z.string().max(120), z.object({ x: z.number(), y: z.number() })).optional(),
  windows: z.array(PcWindowSchema).max(30).optional(),
});

export const STATE_VERSION = 5;

export const PlayerStateSchema = z.object({
  version: z.literal(STATE_VERSION),
  view: ViewSchema,
  wall: z.object({
    camera: CameraSchema,
    items: z.array(WallItemSchema),
    threads: z.array(ThreadSchema),
    notes: z.array(NoteSchema),
  }),
  /** Диск сервера вынут из конверта 52 и лежит на столе (A-272, DD-A); вставлен — L214 открыт. */
  discOut: z.boolean().optional(),
  /** Выписки на стене (A-272, DB-B). Нет поля — выписок нет. */
  excerpts: z.array(ExcerptSchema).max(300).optional(),
  /**
   * Вскрытые конверты архива (A-260). Нет поля — сохранение из времени до конвертов: всё уже
   * на стене, конверты считаются вскрытыми (openedOf).
   */
  opened: z.array(z.enum(CONTAINER_IDS)).max(CONTAINER_IDS.length).optional(),
  /**
   * Папки, вынутые из пачек (RD-A, правка автора 10.11): «П-02/18» — папка, что лежала перед
   * листом 18 пачки П-02. Вынутая из пачки пропадает: её листов там больше нет.
   */
  taken: z
    .array(z.string().regex(/^П-0[1-9]\/\d{1,3}$/))
    .max(20)
    .optional(),
  /**
   * Листы, что лежали текстом вниз и перевёрнуты (П-05, листы 19–24): «П-05/19» — блок с листа 19.
   * После переворота они лежат лицом вверх — пачку листают дальше (правка автора 10.11).
   */
  turned: z.array(z.string()).max(20).optional(),
  /**
   * Обрывки, вынутые из материалов (SRC-A, правка автора 10.11): «42/1» — п. 1 личных вещей
   * Н. Харта, обгоревшая половина листа. На стене — своей карточкой «S:42/1».
   */
  pieces: z
    .array(z.string().regex(/^\d{2}\/\d{1,2}$/))
    .max(20)
    .optional(),
  /**
   * Первый день дела у игрока — его настоящая дата (ГГГГ-ММ-ДД). Часы устройств (CL-D, автор
   * 10.11): время — настоящее, дата — 16.11.2009 плюс столько дней, сколько прошло с этого дня.
   */
  started: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Блокнот следователя: записи игрока; игра их не читает (P-1, DV-A — автор 11.11). */
  notebook: z.string().max(20_000).optional(),
  /** Страницы блокнота (правка автора 11.11): прежний `notebook` — первой страницей. */
  notebookPages: z.array(z.string().max(4000)).max(300).optional(),
  /**
   * Рабочий стол ноутбука руководителя (4c-1, правка автора 10.11): где стоят значки и какие
   * окна открыты — как на настоящем ноутбуке, после выхода всё на месте.
   */
  laptop: LaptopDeskSchema.optional(),
  /** Телефон Габриэля (4c-2): какой экран открыт — после выхода телефон там же. */
  phone: z.object({ screen: z.string().max(80) }).optional(),
  /** Компьютер следователя (4c-3): значки и окна рабочего стола — после выхода всё на месте. */
  pc: PcDeskSchema.optional(),
  /**
   * Регистратор радиопоста (4d-1): где стоит перемотка (секунды от начала записи) и метки игрока
   * на шкале (PM-A, автор 12.11 — «пока сделать, потом посмотрю»).
   */
  radio: z
    .object({
      pos: z.number().min(0).max(2_000_000),
      marks: z
        .array(z.object({ t: z.number().min(0).max(2_000_000), label: z.string().max(60) }))
        .max(50),
    })
    .optional(),
  /**
   * Черновик заключения (A-270; RT-B): ответы по вопросам и вопрос, открытый в форме (5 —
   * «Проверьте заключение»). Отправленное заключение хранит сервер.
   */
  verdict: z
    .object({
      answers: z.array(VerdictAnswerSchema).max(VERDICT_QUESTIONS),
      step: z.number().int().min(0).max(VERDICT_QUESTIONS),
      /** Эпилог на столе открыт — конверт больше не подсвечен. */
      epilogueRead: z.boolean().optional(),
    })
    .optional(),
  /** Совмещённые на стене листы (WL-A, MG-A): «L990» — висит вместо своих половин. */
  joined: z
    .array(z.string().regex(/^L\d{3}$/))
    .max(20)
    .optional(),
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;
