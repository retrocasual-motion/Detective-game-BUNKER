# Task Plan: собственные detective-skills для БУНКЕРА

## Goal
В `.claude/skills/` созданы четыре project skills (detective-orchestrator, detective-architect, detective-auditor, detective-playtester) с общими правилами, опирающиеся на методологию проекта и установленные Story Skills; изменения в ветке `claude/project-thread-5vzyt5`, открыт PR, Артёму отправлен отчёт по 8 пунктам. Канон не менялся, playtest не запускался.

## Next Step
Готово. Ждём решения автора по PR; дальнейшая работа — сборка пакета игрока (отдельная задача).

## Current Phase
Phase 5 (complete)

## Phases

### Phase 1: Requirements & Discovery
- [x] Прочитать AGENTS.md, 00_INDEX, 00_README
- [x] Структура 01–04, где лежит авторское знание и player-visible слой
- [x] Чек-лист и CA-правила методологии
- [x] Frontmatter и роли установленных skills
- [x] Записать в findings.md
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Архитектура: общий слой + 4 skills, references
- [x] Модель изоляции playtester
- **Status:** complete

### Phase 3: Implementation
- [x] Общие правила (_shared или detective-orchestrator/references)
- [x] 4 SKILL.md + references
- [x] CLAUDE.md и SOURCES.md: упомянуть новые skills
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Валидность frontmatter, ссылки на файлы существуют
- [x] Skills видны в списке (проверка через claude -p, если возможно)
- [x] self-eval по результату
- **Status:** complete

### Phase 5: Delivery
- [x] Коммит + push, PR, перенос плана в planning-archive/
- [x] Отчёт по 8 пунктам
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Общие правила — в `detective-orchestrator/shared/`, остальные ссылаются через `${CLAUDE_SKILL_DIR}/../detective-orchestrator/shared/` | Отдельная папка без SKILL.md может не попасть в симлинки setup script; orchestrator симлинкуется всегда |
| Auditor: `context: fork`, `background: false` | Реальная независимость: не видит разговор, где идею придумали |
| Playtester: `disable-model-invocation: true` + отдельный процесс `claude -p --restricted --safe-mode` в песочнице только с пакетом игрока; ведущий (GM) механический, по правилам доступа скрипта | Изоляция техническая, не декларативная |
| Пакета игрока нет → playtest невозможен до отдельной задачи по сборке пакета; skill описывает формат и проверку утечек | Не перекраиваем файлы игры |
| Технический тест на игрушечном деле, не БУНКЕР | Пользователь запретил playtest; проверяем только изоляцию |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| В `claude -p` (manual mode) skill не смог прочитать `${CLAUDE_SKILL_DIR}/...` — путь через симлинк `~/.claude/skills` вне рабочей папки | Ссылки переведены на `${CLAUDE_PROJECT_DIR}/.claude/skills/...` (внутри репо); проверено повторно — все файлы открываются |
| gm-log писал «успех» при повторном срабатывании правила без новых файлов | Результат «повтор» |
