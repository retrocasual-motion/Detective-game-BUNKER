# Skills и инструменты для дизайна интерфейса, UX, геймдизайна и против «AI slop»

Проверка 2026-11-08. Звёзды, даты (`pushed_at`) и лицензии взяты из GitHub API
(`gh api repos/OWNER/REPO`) в этот день. Содержимое skills прочитано из самих
репозиториев (SKILL.md, README, деревья файлов). Ничего не устанавливалось.
«pushed_at» — последний push в репозиторий; где был релиз, указан и он.

Наш стек для сверки рисков: `game/packages/game-web` — React 19, Vite 8, zustand,
`@playwright/test`, **обычный CSS, без Tailwind и shadcn**.

---

## Ответ про «StagesHow»

**Почти наверняка это Stageshow** — skill дизайнера Benji Taylor,
`benjitaylor/skills` → папка `stageshow` (https://github.com/benjitaylor/skills).
Название пишется одним словом `stageshow` («stage show»), голосом «стейдж-шоу»
и даёт как раз «StagesHow». Репозиторий создан 2026-10-26, то есть skill совсем
свежий, и о нём писали (alphasignal, drweb.de). Автор мог встретить его там.

Есть оговорка, и она важна. Stageshow — **не общий дизайн сайтов и приложений**.
Он делает поддельный («faux») интерфейс продукта для маркетинговых страниц: окна,
телефоны, бенто-сетки, демо с курсором. Принципы «не нейрослопа» в нём сильные:
пять видов провала («слишком много», «вайрфрейм», «в коробке», «плоско», «пресно»),
запреты на блёстки, фиолетовый и выдуманные логотипы, пары «плохо/хорошо»,
независимое ревью по кадрам. Но предмет у него узкий. Если автор помнит именно
«общий дизайн, чтобы было по-человечески», возможно, он смешал Stageshow с одним
из этих skills:
- **Taste Skill** (`Leonxlnx/taste-skill`, «тейст-скил»): даёт агенту «вкус» для
  целых сайтов. По звучанию дальше, по смыслу ближе.
- **Stitch skills** (`google-labs-code/stitch-skills`, «стич-скилз»): в нём есть
  skill `taste-design` против шаблонности, но работает он через Google Stitch MCP.
- **Impeccable**: самый известный «против AI slop» на общий дизайн, на «StagesHow»
  не похож по звучанию.

Чисто созвучный ложный кандидат: **stagewise** (`stagewise-io/stagewise`). Это
агентная IDE, не skill дизайна, и лицензия у неё AGPL-3.0. Не он.

## Рекомендация: топ-3 для нас

1. **Impeccable** (`pbakaus/impeccable`). Это единственный инструмент с
   *детерминированным* детектором шаблонности (62 правила без LLM). Плюс команды
   ревью `critique` (оценка по эвристикам юзабилити, ранжирование) и `audit`
   (a11y, производительность, адаптивность; находки P0–P3) и команды правки одной
   цели (`quieter`, `distill`, `typeset`, `layout`). Он «сильнее всего на уже
   существующих интерфейсах», а у нас уже есть комната, стол и доска.
   Ставить только сам skill (ручное копирование), **без хука и без `live`**
   (см. риски).
2. **frontend-design от Anthropic** (`anthropics/skills`, есть и плагином в
   `claude-plugins-official`). Один SKILL.md без скриптов и зависимостей,
   Apache-2.0. Даёт метод: дизайн растёт из предмета и его материалов, сначала
   компактный план токенов, затем проверка плана «не дефолт ли это», затем сборка
   и самокритика по скриншотам. Перечислены пять конкретных кластеров ИИ-дизайна.
   Для диегетического интерфейса (бумага, архив, бункер) принцип «grounded in the
   subject matter» подходит лучше любого каталога стилей.
3. **Designer Skills Pack** (`Owl-Listener/designer-skills`), выборочно: плагины
   `prototyping-testing` (`parallel-concepts`, `concept-selection`,
   `heuristic-evaluation`, `accessibility-test-plan`), `visual-critique`
   (`critique-affordance`, `critique-visual-hierarchy`,
   `critique-information-density` и др.) и `interaction-design` (`feedback-patterns`,
   `state-machine`, `peak-end-rule` и др.). Это ровно «принимать решения,
   сравнивать варианты, проверять». Правило `parallel-concepts` («концепты должны
   отличаться тем, что *делает пользователь*, а не видом») совпадает с нашим
   правилом «разнообразие — в действиях игрока, не в оболочках». В скиллах нет
   скриптов и хуков, лицензия MIT.

Как справочник (не ставить целиком) стоит прочитать **Claude Code Game Studios**:
`ux-review` и `design-review` с вердиктами APPROVED / NEEDS REVISION — единственный
найденный UX-ревью именно для игр (HUD, уровни доступности). Сам репозиторий
тяжёлый: 49 агентов, хуки, statusline.

---

## Кандидаты

### 1. Impeccable
- Ссылка: https://github.com/pbakaus/impeccable, сайт impeccable.style
- Автор: Paul Bakaus (pbakaus)
- Звёзды: 105 860 (2026-11-08). Активность: push 2026-11-08, релиз skill-v4.8.1
  от 2026-11-08. Лицензия: Apache-2.0.
- Что делает: 24 команды через `/impeccable <команда> <цель>`.
  - Направить: `bolder`, `quieter`, `distill`, `colorize`, `typeset`, `layout`,
    `animate`, `delight`, `overdrive`.
  - Ревью: `critique` (оценка по эвристикам юзабилити, ранжированный список
    исправлений), `audit` (доступность, производительность, темы, адаптивность,
    P0–P3).
  - Довести: `polish`, `harden` (ошибки, i18n, переполнение), `clarify` (тексты
    интерфейса), `adapt`, `optimize`, `onboard` (первый запуск, пустые состояния).
  - Варианты: `live` (выбрать элемент в браузере и перебирать варианты),
    `generate`.
  - План: `shape` (UX до кода), `init` → `PRODUCT.md`, `document` → `DESIGN.md`,
    `extract`.
  - Детектор: 62 детерминированных правила (Inter, градиенты, карточки в карточках,
    серый текст на цветном, плитка-иконка над каждым заголовком, тесные отступы,
    пропущенные уровни заголовков). Работает в агенте через хук, из CLI
    (`npx impeccable detect src/` или URL dev-сервера) и расширением Chrome.
- Чем полезен нам: точечное ревью уже сделанного (`critique the board`,
  `audit the desk`); `quieter`/`distill` против перегруза; `onboard` для первого
  входа в комнату и пустых состояний; `harden` для переполнения длинных русских
  строк. Детектор по URL (`http://localhost:5173`) ловит контраст и мелкий текст на
  отрисованной странице.
- Риски:
  - Хук ставится на каждую правку UI-файла, и установщик настойчиво его предлагает.
    Это конфликтует с нашим порядком работы (своды и игра правятся пакетом). Хук —
    не ставить.
  - `live`: кнопка Apply при отсутствии активного чата запускает `codex`/`claude`
    с `--dangerously-bypass-approvals-and-sandbox` / `--permission-mode
    bypassPermissions`, а также скрипт из `package.json`. **Не использовать** или
    задать `IMPECCABLE_LIVE_COPY_AGENT=off`.
  - Skill запускает бинарник движка (лежит рядом или скачивается в
    `~/.impeccable/bin/`).
  - Пишет `PRODUCT.md` и `DESIGN.md` в корень. Нужно решить, где им лежать
    (например, в `game/`).
  - Правила и примеры заточены под веб-страницы и продуктовый UI. Для
    диегетических элементов (печатная бумага, моноширинный шрифт машинописи)
    отдельные правила дадут ложные срабатывания, их отключают через `ignores`.

### 2. frontend-design (Anthropic)
- Ссылки: https://github.com/anthropics/skills/tree/main/skills/frontend-design;
  плагин https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design
- Автор: Anthropic
- Звёзды: репозиторий `anthropics/skills` 189 103; `claude-plugins-official`
  46 415 (2026-11-08). Активность: последний коммит папки skill 2026-09-03, папки
  плагина 2026-10-26. Лицензия: у репозитория не указана, у skill — свой
  `LICENSE.txt` (Apache 2.0). Сам маркетплейс — Apache-2.0.
- Что делает: один SKILL.md, без скриптов.
  - Дизайн растёт из предмета: отрасль, материалы, словарь мира.
  - Два прохода: план (4–6 hex-цветов, шрифты и роли, ASCII-вайрфреймы раскладок,
    принципы), затем проверка плана «не получу ли я то же для любой похожей
    страницы» с правкой и объяснением.
  - Пять кластеров ИИ-дизайна: кремовый фон, засечки и терракота; чёрный фон с
    кислотно-зелёным; «газета» с волосяными линиями; набор SaaS-карточек; шаблонная
    обвязка: КАПС-«брови», «A · B · C», «→» в кнопках, моноширинный шрифт для
    подписей.
  - Анимация: одно продуманное движение вместо россыпи fade-in.
  - Самокритика по скриншотам; правило Шанель «сними один аксессуар».
- Чем полезен нам: метод «предмет → материалы → решения» прямо ложится на
  диегетический интерфейс (архив дела, бумага со следами обращения). Список
  кластеров годится как чек-лист для ревью. Ничего не тянет.
- Риски: текст написан под веб-страницы («hero»), об играх и пространственных
  интерфейсах в нём ничего. Часть «дефолтов» (моноширинный шрифт для данных,
  газетная вёрстка) у нас может быть оправданным выбором. Skill сам говорит, что
  это законно, если выбрано, а не по умолчанию. Риск низкий.

### 3. Designer Skills Pack
- Ссылка: https://github.com/Owl-Listener/designer-skills (плюс отдельные
  коллекции, например https://github.com/Owl-Listener/inclusive-design-skills)
- Автор: Owl-Listener
- Звёзды: 3 286 (2026-11-08); inclusive-design-skills — 108. Активность:
  push 2026-09-05 (inclusive — 2026-06-09). Лицензия: MIT.
- Что делает: 273 skill и 76 команд в 33 плагинах. Полезное нам:
  - `prototyping-testing`: `parallel-concepts` (несколько реально разных решений,
    различие по действию пользователя: последовательность, единица взаимодействия,
    кто решает, точка входа, точка необратимости), `concept-selection`,
    `heuristic-evaluation`, `click-test-plan`, `accessibility-test-plan`;
  - `visual-critique`: `critique-affordance`, `-composition`, `-visual-hierarchy`,
    `-information-density`, `-typography`, `-color`, `-brand-consistency`;
  - `interaction-design`: `feedback-patterns`, `state-machine`, `loading-states`,
    `error-handling-ux`, `onboarding-design`, `peak-end-rule`, `zeigarnik-effect`,
    `fitts-law`, `hicks-law`;
  - `design-ops/design-critique`;
  - отдельная коллекция inclusive design (когнитивная доступность и др.).
- Чем полезен нам: инструменты *решения и проверки*, а не генерации стиля.
  `parallel-concepts` + `concept-selection` формализуют наше правило «2–4 разных
  варианта». `critique-affordance` подходит для вопроса «понятно ли, что лист на
  столе можно взять». `zeigarnik`/`peak-end` — для ритма расследования.
- Риски: очень широко, много пересечений и шума. Ставить только 2–3 плагина.
  Примеры продуктовые, не игровые. Скрипты в репозитории служебные (линтеры
  маркетплейса), в самих skills скриптов нет. Риск низкий.

### 4. Stageshow (тот самый «StagesHow»)
- Ссылка: https://github.com/benjitaylor/skills/tree/main/stageshow; описание
  https://benji.org/stageshow
- Автор: Benji Taylor
- Звёзды: 2 566 (2026-11-08). Активность: репозиторий создан 2026-10-26, последний
  коммит 2026-11-05. Лицензия: у репозитория не определена GitHub; у
  `stageshow/LICENSE` — MIT. Иконки приложений и товарные знаки под MIT не
  подпадают (`NOTICE.md`).
- Что делает: faux product UI. Семь шагов (место и размер → стиль → история в 3–5
  тактов → начать с «золотого» примера → экран с бюджетом 3–7 настоящих строк →
  хореография через API `Act` → репетиция). Есть кит React-компонентов, около 40
  «золотых» примеров, пары «плохо/хорошо» (`teaching/`), references (`craft`,
  `framing`, `motion`, `review`, `verify`). Скрипт `film.mjs` снимает кадры и
  выносит вердикт `--gate`. Независимое ревью по кадрам: «каждая находка — кадр».
- Чем полезен нам: прямой пользы мало, это маркетинговые иллюстрации продукта. Как
  чтение полезны `references/craft.md` («ограничение: настоящие слова только там,
  куда смотрит глаз»), `review.md` (ревью по кадрам, без доступа к замыслу
  автора — тот же принцип, что у нашего detective-auditor) и пример
  `tilted-stack` («стопка бумаги под небольшими углами, слова только на верхнем
  листе» — близко к нашему столу).
- Риски: не тот предмет; тянет React 18, Vite 6, `playwright-core`, lucide-react
  (у нас React 19 и Vite 8). Скрипты запускают браузер. Стиль — глянец
  продуктовых лендингов.

### 5. Taste Skill
- Ссылка: https://github.com/Leonxlnx/taste-skill, сайт tasteskill.dev
- Автор: Leonxlnx
- Звёзды: 111 830 (2026-11-08). Активность: push 2026-11-07, релиз v2.5.1 от
  2026-11-07. Лицензия: MIT.
- Что делает: «вкус» для сайтов компаний уровня figma.com / x.ai. Одна дизайн-
  система, одна секция на экран, настоящие фото (из открытых архивов), настоящие
  иконки брендов, hero-вход и 1–2 «момента» на страницу. Проверка в настоящем
  браузере скриптами `gate.mjs`, `consistency.mjs`, `copy-lint.mjs`, `perf.mjs`,
  `shoot.mjs`. Раньше были «ручки» VARIANCE / MOTION / DENSITY и варианты
  (minimalist, brutalist и др.).
- Чем полезен нам: идея «проверить в браузере, а не на глаз в коде» и `copy-lint`
  для текстов интерфейса. В остальном слабо: явно заточен под корпоративные сайты.
- Риски: навязывает формат сайта (секции, hero, фото, бренд-иконки), а у нас 3D-
  комната. Нужны Node 22+, Chrome/Edge, по желанию ffmpeg. Скрипты ходят в сеть за
  фото и иконками. Рядом продвигается десктоп-приложение TasteCode.

### 6. Stitch skills (Google)
- Ссылка: https://github.com/google-labs-code/stitch-skills
- Автор: Google Labs (google-labs-code)
- Звёзды: 8 696 (2026-11-08). Активность: push 2026-08-17. Лицензия: Apache-2.0.
- Что делает: три плагина. `stitch-design`: `generate-design`, `code-to-design`,
  `extract-design-md`, `manage-design-system`. `stitch-build`: `react-components`,
  `react-vite-dashboard`, `shadcn-ui`, `remotion`. `stitch-utilities`:
  `design-md`, `enhance-prompt`, `stitch-loop`, `taste-design`. `taste-design`
  пишет `DESIGN.md` с «атмосферой», калибровкой цвета, типографикой и списком
  запрещённых ИИ-клише. Базовые ручки: Creativity 9, Variance 8, Motion 6,
  Density 5.
- Чем полезен нам: почти ничем. Генерация экранов в Google Stitch не подходит для
  CSS-3D-сцены. Как чтение годится список анти-паттернов в `taste-design`.
- Риски: нужен Google Stitch (аккаунт, MCP). `allowed-tools` у генерации включает
  Bash. Сборка ведёт к shadcn и дашбордам.

### 7. UI/UX Pro Max
- Ссылка: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (uupm.cc)
- Автор: nextlevelbuilder
- Звёзды: 146 704 (2026-11-08). Активность: push 2026-11-07. Лицензия: MIT.
- Что делает: «генератор дизайн-системы» на поиске (BM25) по CSV-базам: 80 стилей
  (51 активный: glassmorphism, neumorphism, bento…), 192 палитры по типам
  продуктов, 74 пары шрифтов, 120 UX-правил, 192 правила рассуждения, 22 стека.
  Есть предсдаточный чек-лист: без эмодзи вместо иконок, контраст 4.5:1, видимый
  фокус, `prefers-reduced-motion`, брейкпоинты. Работает через Python-скрипт и CLI
  `uipro`.
- Чем полезен нам: короткий предсдаточный чек-лист и 120 UX-правил как справочник.
- Риски: каталог стилей по сути и есть машина шаблонности — «тип продукта → стиль
  → палитра → шрифт». Для уникального диегетического интерфейса это обратное
  тому, что нужно. Нужны Python и npm-CLI. Звёзд больше всех, но популярность не
  совпадает с нашей задачей.

### 8. gstack (дизайн-команды)
- Ссылка: https://github.com/garrytan/gstack
- Автор: Garry Tan
- Звёзды: 140 716 (2026-11-08). Активность: push 2026-11-08. Лицензия: MIT.
- Что делает (дизайн-часть):
  - `/plan-design-review`: оценивает каждое измерение 0–10, объясняет, как
    выглядит 10, правит план; детекция AI slop; по одному вопросу на решение.
  - `/design-review`: то же плюс исправления с атомарными коммитами и скриншотами
    до/после; если стоит Impeccable, сначала гоняет его движок.
  - `/design-shotgun`: 4–6 вариантов-макетов, доска сравнения в браузере, «память
    вкуса».
  - `/design-consultation`: дизайн-система в `DESIGN.md`.
  - `/design-html`.
- Чем полезен нам: идея `/design-shotgun` (доска сравнения вариантов) и шкала
  «0–10 и как выглядит 10» в ревью.
- Риски: высокие. Это целая «команда» из 23 инструментов: клонирование в
  `~/.claude/skills`, `./setup` на Bun, компилируемые неподписанные бинарники
  (Windows Smart App Control их блокирует), хуки, автообновление при каждом
  запуске, просьба дописать в CLAUDE.md запрет на другие браузерные инструменты.
  Windows — «минимальная поддержка». Конфликтует с нашими правилами и skills.
  Брать только идеи.

### 9. design-review (OneRedOak)
- Ссылка: https://github.com/OneRedOak/claude-code-workflows/tree/main/design-review
- Автор: OneRedOak (Patrick Ellis)
- Звёзды: 3 918 (2026-11-08). Активность: push в репозиторий 2026-10-09; папка
  `design-review` последний раз менялась 2025-08-19. Лицензия: MIT.
- Что делает: субагент + slash-команда. Ревью UI-изменений по фазам: взаимодействие
  и поток → адаптивность (1440/768/375, скриншоты) → визуальная полировка →
  доступность WCAG 2.1 AA (Tab-порядок, фокус, контраст) → устойчивость (пустые и
  ошибочные состояния, переполнение) → здоровье кода. Работает через Playwright
  MCP. Есть пример `design-principles-example.md` и сниппет для CLAUDE.md.
- Чем полезен нам: готовый каркас фазового визуального ревью через живой браузер.
  Фазы 1, 4 и 5 переносятся на игру. Мы уже умеем гонять Playwright (webapp-testing).
- Риски: ориентир «Stripe, Airbnb, Linear», то есть SaaS. Нужен Playwright MCP.
  Папка не обновлялась больше года. Удобнее взять как образец для своего агента,
  чем ставить.

### 10. web-design-guidelines (Vercel)
- Ссылки: https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines;
  правила — https://github.com/vercel-labs/web-interface-guidelines
- Автор: Vercel
- Звёзды: agent-skills 33 703; web-interface-guidelines 1 135 (2026-11-08).
  Активность: папка skill менялась 2026-01-16, правила — push 2026-10-05.
  Лицензия: у agent-skills не указана GitHub; у web-interface-guidelines — MIT.
- Что делает: при каждом запуске скачивает свежие правила (`command.md`) и выдаёт
  находки в формате `file:line`.
- Чем полезен нам: быстрый механический проход по a11y, фокусу, формам и анимации
  в TSX/CSS.
- Риски: правила подгружаются из сети при каждом запуске (содержимое может
  измениться без нашего ведома). Ориентир — веб-приложения. Про «вкус» ничего нет.

### 11. UI Skills (ibelick)
- Ссылка: https://github.com/ibelick/ui-skills (ui-skills.com)
- Автор: ibelick
- Звёзды: 10 808 (2026-11-08). Активность: push 2026-11-07. Лицензия: MIT.
- Что делает: `baseline-ui` («быстро убрать слоп»: отступы, иерархия, типографика),
  `fixing-accessibility`, `fixing-motion-performance`, `improve-ui`,
  `create-design-md` и др. Формат ответа: нарушение (цитата) → почему важно → фикс.
- Чем полезен нам: `fixing-accessibility` и `fixing-motion-performance` как
  короткие чек-листы (анимации в CSS-3D-комнате — наша зона риска по
  производительности).
- Риски: `baseline-ui` жёстко требует Tailwind, `motion/react`, `cn`
  (clsx + tailwind-merge) и Radix/Base UI. **У нас нет Tailwind**, так что
  `baseline-ui` прямо противоречит стеку. Брать только skills без привязки к стеку.

### 12. Claude Code Game Studios
- Ссылка: https://github.com/Donchitos/Claude-Code-Game-Studios
- Автор: Donchitos
- Звёзды: 36 778 (2026-11-08). Активность: push и релиз v1.2.0 — 2026-10-19.
  Лицензия: MIT.
- Что делает: «игровая студия» из 49 агентов (game-designer, level-designer,
  narrative-director, ux-designer, ui-programmer…) и 72 skills. Нам интересны
  `ux-review` (проверка UX-спеки, HUD, библиотеки паттернов: доступность,
  соответствие GDD, готовность; вердикты APPROVED / NOT ASSESSED / NEEDS REVISION /
  MAJOR REVISION NEEDED), `ux-design`, `design-review`, `playtest-report`,
  `propagate-design-change`.
- Чем полезен нам: единственный найденный UX-ревью для **игр**. Полезны вердикты и
  «NOT ASSESSED, если не с чем сверять» — честная отметка непроверенного.
- Риски: высокие при установке. Свой `.claude/settings.json`, statusline, около
  10 хуков (session-start, pre-compact, detect-gaps…), skills вызывают bash-
  хелперы. Ориентир — движковые игры (Unity/Godot/Unreal) с GDD. Конфликт с
  нашими detective-skills и правилом «плейтест только по команде». Только читать.

### 13. superdesign
- Ссылки: skill https://github.com/superdesigndev/superdesign-skill (есть в
  `claude-plugins-official`); старое расширение https://github.com/superdesigndev/superdesign
- Автор: Superdesign dev, Inc.
- Звёзды: superdesign-skill 963; старый superdesign 7 595 (2026-11-08).
  Активность: skill — push 2026-08-21; старое расширение — 2026-06-29
  (архивировано). Лицензия: skill — MIT; старое — NOASSERTION.
- Что делает: читает код, ставит дизайн-систему, генерирует ветвящиеся черновики
  на «бесконечном холсте» сервиса superdesign.dev через CLI `@superdesign/cli`.
- Чем полезен нам: сравнение вариантов на холсте.
- Риски: облачный сервис (код уходит наружу), глобальный npm-CLI, коммерческий
  продукт. Для нас не нужен.

### 14. Playwright MCP и playground (официальный маркетплейс)
- Playwright MCP: https://github.com/microsoft/playwright-mcp. Microsoft;
  39 323 звезды; push 2026-11-06; Apache-2.0. Есть плагином `playwright` в
  `claude-plugins-official`.
- playground (Anthropic): https://github.com/anthropics/claude-plugins-official/tree/main/plugins/playground.
  Папка менялась 2026-02-20. Создаёт одностраничные HTML-«песочницы» с ручками и
  живым превью. Есть шаблоны `design-playground` (отступы, цвет, типографика,
  тени, взаимодействие) и `document-critique`.
- Чем полезны нам: Playwright MCP пересекается с уже установленным webapp-testing.
  Отдельно нужен, только если брать design-review от OneRedOak. `playground`
  удобен, чтобы автор *сам покрутил* варианты (например, размер, тень и наклон
  бумаги на столе) и вернул выбранные значения. Это нетекстовое сравнение
  вариантов, без зависимостей.
- Риски: низкие. Playwright MCP — ещё один браузерный инструмент рядом с
  webapp-testing.

### 15. Figma MCP — не нужен
- https://github.com/figma/mcp-server-guide (2 161 звезда, push 2026-11-03,
  лицензия не указана; в маркетплейсе как `figma`), а также
  https://github.com/GLips/Figma-Context-MCP (16 176, push 2026-10-27, MIT).
- Полезен, только если дизайн ведётся в Figma. У нас дизайн рождается в коде и
  сводах, поэтому пользы нет.

### Справочно: Anthropic «Prompting for frontend aesthetics» (cookbook)
- https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb.
  Репозиторий: 54 423 звезды, MIT; ноутбук менялся 2026-10-24.
- Исходник идей frontend-design: как промптом увести модель от дефолтной эстетики.
  Есть картинки «до/после» (дашборд, портфолио, SaaS). Читать, не ставить.

### Каталоги, где искать дальше
- `anthropics/claude-plugins-official` (46 415, Apache-2.0): официальный
  маркетплейс, есть категория design (figma, frontend-design, superdesign,
  playground, playwright, unity).
- `ComposioHQ/awesome-claude-skills` (79 023, push 2026-09-18),
  `travisvn/awesome-claude-skills` (15 742, push 2026-04-28),
  `hesreallyhim/awesome-claude-code` (57 515, push 2026-11-08),
  `sickn33/agentic-awesome-skills` (49 347, MIT, push 2026-11-06; 2 926+ skills).
- skills.sh / `vercel-labs/skills` (38 547, MIT): CLI `npx skills add`; через него
  ставятся Stageshow и Taste Skill.
- Мелкие анти-слоп skills (`wwewtech/anti-slop-design` — 4 звезды,
  `rshzrh/ui-design-skills` — 5 звёзд, у второго есть `ban-patterns.md` и
  `verification.md`): слишком мало пользователей, не рекомендую.
- Игровые skills на claudskills.com (game-design, game-design-review, game-designer
  про «game feel»): источники не проверены, качество неизвестно.

---

## Сводная таблица (проверено 2026-11-08)

| Название | Звёзды | Последняя активность | Лицензия | Польза нам | Риск |
|---|---|---|---|---|---|
| Impeccable (pbakaus/impeccable) | 105 860 | 2026-11-08 (релиз skill-v4.8.1) | Apache-2.0 | Высокая: детектор слопа, `critique`/`audit`, точечные правки готового UI | Средний: хук, бинарник, `live` с bypassPermissions; ставить без хука и live |
| frontend-design (Anthropic) | 189 103 (anthropics/skills) | папка 2026-09-03; плагин 2026-10-26 | Apache 2.0 (LICENSE.txt) | Высокая: метод «из предмета», проверка плана на дефолтность, 5 кластеров ИИ-дизайна | Низкий: веб-ориентир |
| Designer Skills Pack (Owl-Listener) | 3 286 | 2026-09-05 | MIT | Высокая выборочно: parallel-concepts, concept-selection, heuristic-evaluation, visual-critique | Низкий: шум, ставить 2–3 плагина |
| Stageshow (benjitaylor/skills) = «StagesHow» | 2 566 | 2026-11-05 | MIT (папка skill) | Низкая напрямую; полезно читать craft/review/teaching | Средний: React 18, Vite 6, playwright-core; узкий предмет |
| Taste Skill (Leonxlnx) | 111 830 | 2026-11-07 (v2.5.1) | MIT | Низкая: формат корпоративного сайта; идея проверки в браузере | Средний: Node 22, Chrome, сеть, навязывает формат |
| Stitch skills (google-labs-code) | 8 696 | 2026-08-17 | Apache-2.0 | Низкая: только список анти-паттернов | Высокий: нужен Google Stitch MCP |
| UI/UX Pro Max (nextlevelbuilder) | 146 704 | 2026-11-07 | MIT | Низкая: предсдаточный чек-лист | Средний: каталог стилей = шаблонность; Python и CLI |
| gstack (garrytan) | 140 716 | 2026-11-08 | MIT | Идеи: доска вариантов, шкала 0–10 | Высокий: хуки, бинарники, автообновление, Windows минимально |
| design-review (OneRedOak) | 3 918 | репо 2026-10-09; папка 2025-08-19 | MIT | Средняя: фазовое ревью через живой браузер | Низкий–средний: SaaS-ориентир, Playwright MCP, старое |
| web-design-guidelines (Vercel) | 33 703 / 1 135 | skill 2026-01-16; правила 2026-10-05 | не указана / MIT | Средняя: механический проход a11y `file:line` | Низкий: правила тянутся из сети при запуске |
| UI Skills (ibelick) | 10 808 | 2026-11-07 | MIT | Средняя: fixing-accessibility, motion-performance | Средний: baseline-ui требует Tailwind (у нас его нет) |
| Claude Code Game Studios (Donchitos) | 36 778 | 2026-10-19 (v1.2.0) | MIT | Средняя как чтение: игровой ux-review с вердиктами | Высокий при установке: хуки, settings, statusline |
| superdesign-skill | 963 | 2026-08-21 | MIT | Низкая | Высокий: облако, код уходит наружу |
| Playwright MCP (microsoft) | 39 323 | 2026-11-06 | Apache-2.0 | Пересекается с webapp-testing | Низкий |
| playground (Anthropic) | в составе claude-plugins-official (46 415) | 2026-02-20 | Apache-2.0 | Средняя: автор сам крутит варианты в песочнице | Низкий |
| Figma MCP | 2 161 / 16 176 | 2026-11-03 / 2026-10-27 | не указана / MIT | Нет (не работаем в Figma) | — |
| stagewise (ложный созвучный) | 6 831 | 2026-11-04 | AGPL-3.0 | Нет: это IDE, не skill | — |
