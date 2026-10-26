# БУНКЕР

Детективная онлайн-игра в формате расследования дела.

## Плагины Claude Code

В `.claude/settings.json` подключён плагин
[planning-with-files](https://github.com/OthmanAdi/planning-with-files)
(маркетплейс `OthmanAdi/planning-with-files`). Он включается автоматически
в каждой сессии Claude Code, открытой в этом репозитории, в том числе в
облачных сессиях и во всех новых ветках.

## Skills Claude Code

В `.claude/skills/` лежат 14 project skills, отобранных по одному из
[story-skills](https://github.com/danjdewhurst/story-skills),
[claude-skills](https://github.com/alirezarezvani/claude-skills) и
[claude-cto-team](https://github.com/alirezarezvani/claude-cto-team)
(все MIT). Источники, коммиты и локальные изменения описаны в
`.claude/skills/SOURCES.md`, правила совместного использования в `CLAUDE.md`.
`reader-panel` запускается только командой `/reader-panel`.

Поверх них — четыре собственных skill игры: `detective-orchestrator` (входная
точка, выбор режима), `detective-architect` (разработка), `detective-auditor`
(независимая проверка) и `detective-playtester` (симулированный игрок в
изолированном процессе, только командой `/detective-playtester`). Описание — в
`CLAUDE.md` и в `SKILL.md` каждого.
