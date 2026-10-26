# БУНКЕР: как работать со skills

Работаем на русском. Канон игры хранится в сводах `bunker/00–04`, `bunker/AGENTS.md`
и `bunker/docs/` (в облачных сессиях проекта: `/mnt/project-files/knowledge/bunker/`).
Этот файл описывает только инструменты, не сюжет.

## Story Skills без story.md

Skills из Story Skills (`.claude/skills/`, источники в `.claude/skills/SOURCES.md`)
рассчитаны на проект их собственного формата: `story.md`, `characters/`,
`continuity/` и т. д., создаваемые skill `story-init`. У БУНКЕРА такой структуры нет,
и это сознательно.

- Отсутствие `story.md` не повод останавливаться. Роль story bible играют своды
  `bunker/01–04`: персонажи и сюжет в 01, улики и связи в 02, знание игрока и маршруты в 03,
  статусы и открытые вопросы в 04.
- Используй методики, чек-листы и references этих skills, применяя их к сводам.
- Не создавай файлы и папки формата Story Skills и не запускай `story` CLI
  (`story-maintenance/scripts/story.js`), пока пользователь явно не решит перевести
  проект в этот формат.

## Собственные detective-skills (начинать с них)

Над Story Skills есть слой из четырёх собственных skills БУНКЕРА:

- **detective-orchestrator** — входная точка любой работы над игрой: определяет
  режим (DEVELOPMENT / AUDIT / PLAYTEST / FEEDBACK REVIEW) и ведёт workflow.
- **detective-architect** — придумывает и меняет элементы расследования
  («как сделать идею работающей?»), после решения автора вносит их в своды.
- **detective-auditor** — независимый критик («почему это не работает?»);
  исполняется в отдельном контексте, только отчёт находок.
- **detective-playtester** — симулированный игрок без доступа к решению; только
  командой `/detective-playtester`, изолированным процессом по пакету игрока.

Общие правила всех четырёх — `.claude/skills/detective-orchestrator/shared/`.
Роли не смешиваются: придумывание, проверка и игра — разные вызовы.

## Какие skills сочетать

Одна задача обычно требует нескольких skills. Таблица ниже — какие Story Skills
подключают detective-skills по предмету работы.

| Задача | Skills | После согласованного изменения |
|---|---|---|
| Персонаж | character-management, genre-craft, plot-structure, при необходимости worldbuilding | revision-continuity |
| Новая улика | genre-craft, plot-structure; character-management, если связана с человеком | revision-continuity, при необходимости assumption-challenger |
| Timeline | plot-structure, worldbuilding | revision-continuity |
| Интервью, переписка, документ персонажа | character-management, voice-style, genre-craft | revision-continuity |
| Сцена или событие (в том числе CCTV) | scene-craft, character-management, worldbuilding | revision-continuity |
| Тема, мотив, моральный конфликт | theme-craft, character-management | — |
| Систематизация улик, continuity, setup/payoff | story-maintenance (как методика), genre-craft | — |
| Реальные факты (медицина, радиация, CCTV, доступ, связь, процедуры) | research, только где ошибка повредит истории | — |
| Разбор итогов playtest или отзывов | feedback-triage, затем detective-auditor | — |

- **assumption-challenger**: почему игрок должен сделать этот вывод, откуда он или
  персонаж это знает, есть ли другое объяснение, не протекает ли авторское знание.
- **self-eval**: после крупной переработки персонажа, новой цепочки улик, большой
  сюжетной конструкции, continuity-аудита или отчёта playtest. Ищи слабые места,
  удобные совпадения и персонажей, действующих ради сюжета.
- **Planning with Files** (плагин): для многоэтапной работы. Хранит процесс (план,
  находки, решения, отклонённые варианты и причины), а не канон.

## Planning with Files: где хранить план

When a task needs 3+ steps or 5+ tool calls, invoke the planning-with-files skill first
and keep task_plan.md current.

- Плагин уже установлен; отдельно копировать его skill в `.claude/skills/` не нужно.
- Каждая многоэтапная задача получает свою папку: `.planning/ГГГГ-ММ-ДД-тема/`
  (скрипт плагина `init-session.sh "тема"`; при `/plan` тоже задавай тему, чтобы план
  лёг в `.planning/`). Файлы плана в корне репо не создавай.
- Коммить и пушь файлы плана вместе с работой: облачный контейнер одноразовый,
  незакоммиченный план пропадёт вместе с сессией.
- Закончив задачу, перенеси её папку из `.planning/` в `planning-archive/`. Если в
  `.planning/` лежат два плана или больше, хуки плагина не выбирают план и молчат.

## Перед значимым изменением: impact check

Какие персонажи, улики, timeline, алиби, знания персонажей, документы и версии
игрока затрагиваются; какие setup/payoff; не становится ли убийца очевиднее;
нет ли противоречия. Канон не меняется молча.

## Playtest: только по прямой команде

Не запускай автоматически `reader-panel` (он и технически вызывается только
командой `/reader-panel`), симуляцию игрока, полный playthrough и
detective-playtester (у него `disable-model-invocation: true`). Обычный цикл:
изменение, continuity check (revision-continuity), дальнейшая работа. Полный
playtest запускается, только когда пользователь говорит, что версия готова к
проверке. Для него нужен утверждённый автором пакет игрока
(`playtest/packs/<версия>/`): авторские своды игроку не выдаются.
