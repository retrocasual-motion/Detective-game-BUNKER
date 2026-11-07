# M0, этап 1 «Комната и стол» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Для автора (коротко).** После этапа ты открываешь игру в браузере (`pnpm dev` →
`http://localhost:5173`) и видишь комнату следователя четырьмя вкладками. На столе
лежат 46 стартовых материалов серыми карточками: стол двигается и приближается,
карточки таскаются, двойной клик открывает текст на весь экран. В виде «Слева» —
компьютер следователя (разделы пока пустые) и 5 изъятых устройств с бирками. В виде
«Справа» — доска: прикрепил копию, протянул нить, подписал. Внизу всегда торчит
уголок папки ходатайства. Перезагрузил страницу — всё на месте.

**Goal:** играбельная оболочка комнаты следователя на настоящем каркасе (сервер, база,
сборка контента), готовая принять движок правил на этапе 2 без переделки.

**Architecture:** pnpm-монорепозиторий в `game/`. `content` собирает стартовые материалы
из пакета v3.3 в JSON; `api` (Hono + PostgreSQL через Drizzle) отдаёт материалы и
хранит состояние игрока; `game-web` (React + Vite) рисует комнату. В разработке Vite
проксирует `/api` на сервер; в Docker один Node-процесс отдаёт и API, и собранный клиент.

**Tech Stack:** TypeScript (strict), Node.js 26 LTS, pnpm 12, React 19, Vite 8, Zustand 5,
@use-gesture/react 10, react-markdown + remark-gfm, Hono 4 + @hono/node-server,
Drizzle ORM + drizzle-kit, PostgreSQL 18.6 (локально — `embedded-postgres` 18.6, на сервере —
образ `postgres:18.6`), Zod 4, Vitest 5, Playwright 1.65, Biome (линтер и формат).
Версии закрепляются в `package.json` при установке; перед кодом по каждой библиотеке —
сверка API через Context7.

**Spec:** `.planning/2026-11-07-m0-plan/m0-variants.md` (раздел 3 «Этап 1», выбор
автора 07.11: M0-B) + `game/docs/TECH_PLAN.md` разделы 4.0, 4.2, 4.6, 4.7, 4.11, 6.3–6.5,
9.1 + `game/docs/STACK.md` разделы 2–4, 8, 11 + `game/docs/DECISIONS.md` ST-1…ST-6.

## Global Constraints

- Весь код — в `game/`; медиа, ключи и `.env` в git не кладутся (ST-1, ST-5).
- Контент — только из `playtest/packs/v3.3-2026-10-29/player/`; тексты материалов
  показываются дословно, ничего не придумывается (`game/CLAUDE.md`). `locked/` и `gm/`
  на этапе 1 не читаются вовсе.
- `00_ВВОДНАЯ.md` — не материал стола (вводная, TECH_PLAN 4.17 — позже).
- Стартовых материалов 51: устройства `24, 47, 48, 49, 50` лежат в виде «Слева»
  (TECH_PLAN 4.0, 4.2), остальные 46 — на столе.
- Названия видов — ровно: «Стол», «Комната», «Слева», «Справа»; старт — «Стол»;
  стрелки ← → на клавиатуре переключают Слева ↔ Стол ↔ Справа, «Комната» — вкладкой.
- Тексты интерфейса — по-русски, ровно: «Прикрепить к доске», «Закрыть», «Поступления»,
  «Почта», «Приобщить страницу», «Пусто», «Кому», «Прошу», «На основании», «Не сохранено».
- Минимальный экран 1366×768 (T-17-A): без горизонтальной прокрутки страницы, уголок
  папки и вкладки видов видны.
- Внешний вид только через CSS-переменные в `game-web/src/theme/tokens.css`; в
  компонентах нет «зашитых» цветов и шрифтов (шкура меняется позже без переделки).
- Настройки — только из переменных окружения (`.env`, образец — `.env.example`) (ST-6).
- Схема базы — миграциями Drizzle в репозитории; миграции применяются при старте сервера.
- Состояние сохраняется на сервере; раскладка — с задержкой 500 мс после последнего
  изменения (TECH_PLAN 6.4).
- Масштаб стола и доски ограничен: 0.25…3.
- Доска — копии материалов (материал остаётся на столе), нити и подписи без проверки (B-A).

## Review Focus

1. Быстрые перетаскивания подряд → запросы сохранения могут прийти не по порядку; после
   перезагрузки должно стоять последнее положение (тест — Task 5).
2. Сервер недоступен при сохранении → игра продолжает работать, виден значок
   «Не сохранено», следующее изменение сохраняет всё состояние (тест — Task 5).
3. Пакет обновили: в сохранённом состоянии есть материал, которого больше нет, или нет
   нового → сервер выкидывает неизвестные, новые кладёт в сетку (тест — Task 3).
4. Двойной клик в конце перетаскивания не должен открывать просмотрщик; клик по фону во
   время открытого просмотрщика не двигает стол (тест — Task 6).
5. Длинный материал (`07` на столе, `50` — радиопост, ~10 КБ, в «Слева») в просмотрщике
   прокручивается, `Esc` закрывает (тесты — Task 6 и Task 8).

---

## Структура файлов

```
game/
  package.json  pnpm-workspace.yaml  tsconfig.base.json  biome.json  .env.example
  Dockerfile  compose.yml
  packages/
    shared/src/        schemas.ts (Zod: Material, PlayerState…), layout.ts (defaultState, reconcile)
    content/src/       build.ts (пакет → Material[]), cli.ts; dist/starting.json (в .gitignore)
    api/src/           env.ts, db/schema.ts, db/client.ts, app.ts (маршруты), server.ts
    api/drizzle/       SQL-миграции
    api/scripts/       dev-db.ts (embedded-postgres)
    api/test/          global-setup.ts (временная база), app.test.ts
    game-web/src/      main.tsx, App.tsx, api.ts, store.ts, theme/tokens.css,
                       room/ (RoomTabs, views), canvas/ (Canvas, math.ts), desk/, board/,
                       viewer/, left/, petition/
    game-web/e2e/      room.spec.ts, desk.spec.ts, board.spec.ts, left.spec.ts
.github/workflows/game.yml
game/docs/ARCHITECTURE.md (новый)
```

---

### Task 1: Каркас монорепозитория и проверки в CI

**Files:**
- Create: `game/package.json`, `game/pnpm-workspace.yaml`, `game/tsconfig.base.json`,
  `game/biome.json`, `game/.env.example`, `.github/workflows/game.yml`
- Modify: `.gitignore` (добавить `game/**/node_modules`, `game/**/dist`, `game/.data/`,
  `game/.env`, `game/**/test-results`, `game/**/playwright-report`)

**Interfaces:**
- Produces: скрипты корня `game/package.json`: `dev`, `build`, `test`, `typecheck`,
  `lint`, `e2e`, `content:build`; каждый пакет добавляет свои одноимённые скрипты,
  корень вызывает `pnpm -r <script>`.
- Produces: `.env.example` с ключами `DATABASE_URL`, `PG_DATA_DIR=.data/pg`,
  `PG_PORT=5433`, `API_PORT=8787`, `CONTENT_FILE=packages/content/dist/starting.json`,
  `NODE_ENV=development`.

- [ ] **Step 1:** создать файлы; `tsconfig.base.json` — `strict: true`,
  `noUncheckedIndexedAccess: true`, `module/moduleResolution: NodeNext`. Сверить через
  Context7, работает ли выбранная версия TypeScript с Vite, Drizzle и Vitest; при
  несовместимости закрепить последнюю совместимую и записать причину в DECISIONS.
- [ ] **Step 2:** `cd game && pnpm install && pnpm typecheck && pnpm lint` — без ошибок
  (пакетов ещё нет — команды проходят пусто).
- [ ] **Step 3:** CI `game.yml`: на PR с изменениями в `game/**` — Node 26, pnpm,
  `pnpm install --frozen-lockfile`, `typecheck`, `lint`, `test`; задания `e2e` и
  `docker` добавят Task 4 и Task 9.
- [ ] **Step 4: Commit** — `git commit -m "game: каркас монорепозитория и CI"`

### Task 2: Общие схемы и сборка стартовых материалов

**Files:**
- Create: `game/packages/shared/src/schemas.ts`, `game/packages/shared/src/layout.ts`,
  `game/packages/content/src/build.ts`, `game/packages/content/src/cli.ts`
- Test: `game/packages/shared/src/layout.test.ts`, `game/packages/content/src/build.test.ts`

**Interfaces:**
- Produces (`shared/schemas.ts`):
  - `Material = { id: string /* "01".."51" */; title: string; placement: 'desk' | 'evidence'; body: string /* markdown */; sourceFile: string }`
  - `Camera = { x: number; y: number; zoom: number }`
  - `DeskItem = { materialId: string; x: number; y: number; z: number }`
  - `BoardItem = { id: string; materialId: string; x: number; y: number }`
  - `BoardThread = { id: string; from: string /* BoardItem.id */; to: string; label: string }`
  - `View = 'desk' | 'room' | 'left' | 'right'`
  - `PlayerState = { version: 1; view: View; desk: { camera: Camera; items: DeskItem[] }; board: { camera: Camera; items: BoardItem[]; threads: BoardThread[] } }`
  - Zod-схемы с теми же именами и суффиксом `Schema`; `zoom` в 0.25…3.
- Produces (`shared/layout.ts`):
  - `defaultState(materials: Material[]): PlayerState` — вид `desk`; на столе только
    `placement === 'desk'`, сетка 10 колонок, шаг 200×260, порядок по `id`; доска пустая.
  - `reconcile(state: PlayerState, materials: Material[]): PlayerState` — убирает
    элементы стола, доски и нити с неизвестными `materialId`, добавляет недостающие
    материалы стола в свободные ячейки сетки.
- Produces (`content/build.ts`): `buildStartingMaterials(playerDir: string): Material[]` —
  файлы `NN__*.md`, `id` = `NN`, `title` — текст первого заголовка `# `, `body` — весь
  файл, `placement` — `'evidence'` для `24, 47, 48, 49, 50`, иначе `'desk'`.
- Produces (`content/cli.ts`): `pnpm content:build` пишет `packages/content/dist/starting.json`.

- [ ] **Step 1: тесты**
  - `build.test.ts`: по настоящему пакету — 51 материал; ids ровно `01`…`51`;
    `00_ВВОДНАЯ` нет; у `01` title `"Входящее письмо"`; 5 с `placement: 'evidence'`
    (`24, 47, 48, 49, 50`); все `sourceFile` из `player/`; повторная сборка даёт тот же JSON.
  - `layout.test.ts`: `defaultState` — 46 элементов стола, первый `01` в (0,0), 11-й с
    шагом по y = 260; `reconcile` — элемент `"99"` удаляется вместе с нитями на его
    копии; отсутствующий `"07"` появляется в свободной ячейке; корректное состояние
    не меняется.
- [ ] **Step 2:** `pnpm -F shared -F content test` — FAIL (функций нет).
- [ ] **Step 3:** реализовать по Interfaces.
- [ ] **Step 4:** тесты — PASS; `pnpm content:build` создаёт `starting.json`.
- [ ] **Step 5: Commit** — `"game: схемы состояния и сборка стартовых материалов"`

### Task 3: Сервер, база, API состояния

**Files:**
- Create: `game/packages/api/src/{env.ts,app.ts,server.ts}`, `src/db/{schema.ts,client.ts}`,
  `drizzle/*.sql`, `drizzle.config.ts`, `scripts/dev-db.ts`, `test/global-setup.ts`
- Test: `game/packages/api/test/app.test.ts`

**Interfaces:**
- Consumes: `Material`, `PlayerStateSchema`, `defaultState`, `reconcile` из Task 2.
- Produces: таблица `player_state(player_id text primary key, state jsonb not null, updated_at timestamptz not null default now())`;
  на этапе 1 один игрок `player_id = 'local'`.
- Produces: `createApp({ db, materials }): Hono` и маршруты:
  - `GET /api/health` → `200 {"ok":true}`
  - `GET /api/materials` → `200 Material[]`
  - `GET /api/state` → `200 PlayerState` (`reconcile` сохранённого или `defaultState`)
  - `PUT /api/state` → `204`; невалидное тело или неизвестный `materialId` → `400`
  - `DELETE /api/state` → `204`, только при `NODE_ENV !== 'production'` (иначе `404`) —
    сброс для автотестов.
- Produces: `scripts/dev-db.ts` — запускает `embedded-postgres` в `PG_DATA_DIR` на
  `PG_PORT`, создаёт базу `bunker` при первом запуске; `server.ts` применяет миграции и
  слушает `API_PORT`.
- Produces: `test/global-setup.ts` — временный `embedded-postgres` на свободном порту,
  миграции, `DATABASE_URL` для тестов; останавливается после прогона (так тесты идут
  одинаково локально и в CI).

- [ ] **Step 1: тесты** (`app.request()` Hono, настоящая база): health; materials — 51;
  state без сохранения = `defaultState`; PUT → GET возвращает то же; PUT с `zoom: 10` →
  400; PUT с `materialId: "L214"` → 400; в базе состояние с `"99"` → GET без `"99"`;
  DELETE → следующий GET = `defaultState`; DELETE при `NODE_ENV=production` → 404.
- [ ] **Step 2:** `pnpm -F api test` — FAIL.
- [ ] **Step 3:** реализовать; миграция — `drizzle-kit generate`.
- [ ] **Step 4:** тесты — PASS; `pnpm -F api dev` (база + сервер) → `curl localhost:8787/api/health` = `{"ok":true}`.
- [ ] **Step 5: Commit** — `"game: сервер, база и API состояния игрока"`

### Task 4: Клиент — комната, виды, уголок папки, автотесты в браузере

**Files:**
- Create: `game/packages/game-web/{index.html,vite.config.ts,playwright.config.ts}`,
  `src/{main.tsx,App.tsx,api.ts,store.ts}`, `src/theme/tokens.css`,
  `src/room/{RoomTabs.tsx,RoomView.tsx}`, `src/petition/PetitionCorner.tsx`
- Test: `game/packages/game-web/e2e/room.spec.ts`

**Interfaces:**
- Consumes: API из Task 3.
- Produces (`api.ts`): `getMaterials(): Promise<Material[]>`, `getState(): Promise<PlayerState>`,
  `putState(s: PlayerState): Promise<void>`, `resetState(): Promise<void>`.
- Produces (`store.ts`, Zustand): `materials`, `state`, `saveStatus: 'saved' | 'saving' | 'error'`,
  `setView(v: View)`, `updateState(fn: (s: PlayerState) => PlayerState)` — каждое изменение
  планирует сохранение (Task 5 делает его отложенным и упорядоченным).
- Produces: `pnpm dev` в корне `game/` — база + сервер + Vite (`/api` → `API_PORT`);
  Playwright `webServer` запускает `pnpm dev` и перед каждым тестом вызывает `resetState()`.
- Produces: корень приложения — вкладки видов сверху, текущий вид, уголок папки внизу
  справа; `data-testid`: `view-tab-<view>`, `view-<view>`, `petition-corner`, `petition-folder`.

- [ ] **Step 1: тест** `room.spec.ts` (окно 1366×768): старт — вид «Стол»; клик
  «Справа» → виден `view-right`; `←` с вида «Стол» → «Слева»; после перезагрузки вид
  тот же; «Комната» — видны три зоны-кнопки «Слева», «Стол», «Справа», каждая
  переключает вид; уголок папки виден на всех видах, клик открывает папку с полями
  «Кому», «Прошу», «На основании» (неактивны) и закрывается; `scrollWidth <= innerWidth`.
- [ ] **Step 2:** `pnpm -F game-web e2e` — FAIL.
- [ ] **Step 3:** реализовать; все цвета, шрифты и отступы — переменные `tokens.css`.
- [ ] **Step 4:** тест — PASS. Добавить задание `e2e` в CI (`playwright install --with-deps chromium`).
- [ ] **Step 5: Commit** — `"game: комната — виды, переключение, уголок папки"`

### Task 5: Холст и стол

**Files:**
- Create: `game/packages/game-web/src/canvas/{Canvas.tsx,math.ts}`,
  `src/desk/{DeskView.tsx,MaterialCard.tsx}`, `src/save.ts`
- Test: `src/canvas/math.test.ts`, `src/save.test.ts`, `e2e/desk.spec.ts`

**Interfaces:**
- Produces (`math.ts`): `screenToWorld(p: {x,y}, cam: Camera): {x,y}`,
  `zoomAt(cam: Camera, screenPoint: {x,y}, factor: number): Camera` (точка под курсором
  остаётся на месте, масштаб в 0.25…3).
- Produces (`Canvas.tsx`): `<Canvas camera onCameraChange>{children}</Canvas>` — фон
  тянется мышью, колесо масштабирует; дети в мировых координатах. Переиспользуется доской.
- Produces (`save.ts`): `createSaver(put: (s) => Promise<void>, delayMs = 500)` →
  `{ schedule(s: PlayerState): void; flush(): Promise<void> }` — отправляет только
  последнее состояние, не больше одного запроса одновременно; при ошибке `saveStatus = 'error'`,
  следующий `schedule` отправляет всё заново.
- Produces: карточка — серый прямоугольник с номером и названием, `data-testid="card-<id>"`;
  взятая карточка ложится поверх (`z = max + 1`); значок «Не сохранено» при `error`.

- [ ] **Step 1: тесты**
  - `math.test.ts`: `zoomAt` вокруг (100,100) — мировая точка под курсором та же;
    масштаб не ниже 0.25 и не выше 3; `screenToWorld` при zoom 2 и сдвиге.
  - `save.test.ts` (поддельные таймеры): три `schedule` за 100 мс → один `put` с последним
    состоянием; `put` ещё идёт, пришёл новый `schedule` → второй `put` после первого;
    ошибка `put` → статус `error`, следующий `schedule` → `put` и статус `saved`.
  - `desk.spec.ts`: на столе 46 карточек; перетащить `card-07` на +300 px → после
    перезагрузки на новом месте; два быстрых перетаскивания подряд → после перезагрузки
    последнее; колесо меняет масштаб; сервер отвечает ошибкой на PUT (`page.route`) →
    виден «Не сохранено», после снятия ошибки и нового перетаскивания значок исчезает,
    а после перезагрузки сохранено всё.
- [ ] **Step 2:** тесты — FAIL. **Step 3:** реализовать (жесты — `@use-gesture/react`,
  перемещение — CSS `transform`). **Step 4:** PASS.
- [ ] **Step 5: Commit** — `"game: стол — холст, карточки, сохранение раскладки"`

### Task 6: Просмотрщик материала

**Files:**
- Create: `game/packages/game-web/src/viewer/Viewer.tsx`
- Test: `e2e/viewer.spec.ts`

**Interfaces:**
- Consumes: `materials`, `updateState` (Task 4); `<MaterialCard>` (Task 5).
- Produces: `openViewer(materialId: string)` в store; окно на весь экран поверх вида
  (`data-testid="viewer"`), текст `body` через `react-markdown` + `remark-gfm`, без
  HTML из текста; кнопки «Закрыть» и «Прикрепить к доске» (Task 7 подключит действие);
  `Esc` закрывает.

- [ ] **Step 1: тест** `viewer.spec.ts`: двойной клик по `card-01` → в окне виден
  «Дело № 09-1128 — возобновление»; `Esc` закрывает; перетаскивание `card-02` с
  двойным кликом в конце движения окно не открывает; у самого длинного материала стола
  (`07`, план объекта) текст прокручивается до конца; при открытом окне колесо не
  меняет масштаб стола.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `"game: просмотрщик материала"`

### Task 7: Доска

**Files:**
- Create: `game/packages/game-web/src/board/{BoardView.tsx,BoardThreads.tsx}`
- Test: `e2e/board.spec.ts`

**Interfaces:**
- Consumes: `<Canvas>` (Task 5), просмотрщик (Task 6), `PlayerState.board` (Task 2).
- Produces: «Прикрепить к доске» добавляет `BoardItem` (новый `id`, позиция — центр
  обзора доски); материал остаётся на столе; один материал можно прикрепить несколько
  раз. На доске: перетаскивание копий; режим «Нить» — клик по копии А, затем Б → нить
  (SVG); двойной клик по нити — поле подписи; выделенная копия или нить удаляется
  клавишей `Delete` (вместе с нитями копии). `data-testid`: `board-item-<id>`,
  `board-thread-<id>`, `thread-mode`.

- [ ] **Step 1: тест** `board.spec.ts`: прикрепить `01` и `03` из просмотрщика → на
  доске две копии, на столе по-прежнему 46 карточек; нить между ними с подписью
  «одна дата» → после перезагрузки нить и подпись на месте; удалить копию `01` → её
  нить тоже исчезла.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `"game: доска — копии, нити, подписи"`

### Task 8: Вид «Слева» — компьютер следователя и устройства

**Files:**
- Create: `game/packages/game-web/src/left/{LeftView.tsx,InvestigatorComputer.tsx,EvidenceShelf.tsx}`
- Test: `e2e/left.spec.ts`

**Interfaces:**
- Consumes: `materials` с `placement: 'evidence'`; `openViewer` (Task 6).
- Produces: компьютер — экран с разделами «Поступления», «Почта», «Приобщить страницу»,
  в каждом «Пусто» (наполнят этапы 2, 3, 6); полка вещдоков — 5 серых предметов с биркой
  (номер и название материала), клик — просмотрщик. `data-testid`: `computer`,
  `computer-tab-<name>`, `evidence-<id>`.

- [ ] **Step 1: тест** `left.spec.ts`: в виде «Слева» 5 предметов (`24, 47, 48, 49, 50`),
  на столе их нет; клик по `evidence-47` открывает текст ноутбука; текст `50`
  прокручивается до конца; три раздела
  компьютера переключаются, в каждом «Пусто».
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `"game: вид Слева — компьютер следователя и устройства"`

### Task 9: Docker — так же, как на сервере (ST-6)

**Files:**
- Create: `game/Dockerfile`, `game/compose.yml`, `game/.dockerignore`
- Modify: `game/packages/api/src/server.ts` (в production отдаёт собранный клиент),
  `.github/workflows/game.yml` (задание `docker`)

**Interfaces:**
- Produces: образ собирает `content`, `game-web`, `api`; в образ попадает только
  `starting.json`, не пакет игрока (P-10: `gm/` и `locked/` в образе отсутствуют).
- Produces: `compose.yml` — `db` (`postgres:18.6`, том) и `app` (порт `8787`),
  настройки из `.env`.

- [ ] **Step 1:** CI-задание `docker`: `docker compose up -d --build`, затем
  `curl /api/health` = `{"ok":true}`, `curl /api/materials` — 51 элемент, `curl /` —
  страница игры; `docker compose run app sh -c 'test ! -d /app/playtest'`.
  Локально у автора Docker нет (решение 06.11) — проверяется только в CI.
- [ ] **Step 2:** реализовать; задание зелёное в PR.
- [ ] **Step 3: Commit** — `"game: Docker Compose, проверка в CI"`

### Task 10: Документы и сдача этапа

**Files:**
- Create: `game/docs/ARCHITECTURE.md` (карта пакетов, поток данных, где что менять)
- Modify: `game/docs/DEVELOPMENT.md` (раздел 3 «Запуск и проверки»; отметить шаг M0
  чек-листа: `pnpm install`, `pnpm exec playwright install chromium`, Python-пакет
  Playwright для webapp-testing), `game/README.md` (таблица структуры),
  `game/docs/DECISIONS.md` (стек STACK.md, подтверждённый при старте M0, и решения
  этапа: устройства в «Слева», `00` не на столе, Docker проверяется в CI),
  `game/docs/TECH_PLAN.md` раздел 12 (этапы M0 по варианту M0-B)

- [ ] **Step 1:** полный прогон: `pnpm typecheck && pnpm lint && pnpm test && pnpm e2e` — всё зелёное.
- [ ] **Step 2:** проверка в браузере (webapp-testing): скриншоты четырёх видов при
  1366×768 — приложить к PR.
- [ ] **Step 3:** `/code-review` по ветке; исправить найденное.
- [ ] **Step 4:** обновить документы; PR в `main` со списком «что открыть и сделать
  руками» для автора; спросить «мержим?».

---

## Что НЕ входит в этап 1

Движок правил и закрытые материалы (этап 2); содержимое папки ходатайства, карточки,
почта (этап 3); осмотр «увеличить/листать/перевернуть», замки, плеер, 3D (этап 4);
опись дела и поиск по документам, лоток «Входящие», поворот карточек, отрисованная
комната и переходы — позже, по ходу M0; вход и аккаунты, настоящая почта, сайты,
сервер в интернете (этап 6).
