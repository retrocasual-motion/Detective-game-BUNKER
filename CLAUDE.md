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

## Какие skills сочетать

Одна задача обычно требует нескольких skills.

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
| Разбор итогов playtest или отзывов | feedback-triage | — |

- **assumption-challenger**: почему игрок должен сделать этот вывод, откуда он или
  персонаж это знает, есть ли другое объяснение, не протекает ли авторское знание.
- **self-eval**: после крупной переработки персонажа, новой цепочки улик, большой
  сюжетной конструкции, continuity-аудита или отчёта playtest. Ищи слабые места,
  удобные совпадения и персонажей, действующих ради сюжета.
- **Planning with Files** (плагин): для многоэтапной работы. Хранит процесс (план,
  находки, решения, отклонённые варианты и причины), а не канон.

## Перед значимым изменением: impact check

Какие персонажи, улики, timeline, алиби, знания персонажей, документы и версии
игрока затрагиваются; какие setup/payoff; не становится ли убийца очевиднее;
нет ли противоречия. Канон не меняется молча.

## Playtest: только по прямой команде

Не запускай автоматически `reader-panel` (он и технически вызывается только
командой `/reader-panel`), симуляцию игрока, полный playthrough и будущий
detective-playtester. Обычный цикл: изменение, continuity check
(revision-continuity), дальнейшая работа. Полный playtest запускается, только когда
пользователь говорит, что версия готова к проверке.
