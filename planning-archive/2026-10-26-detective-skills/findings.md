# Findings: detective-skills

## Канон и методология (прочитано)
- Канон: `bunker/01–04` (v3) + `claude/DECISIONS_LOG.md` (A-1…A-205) + `claude/LEYA_LINE_FINAL.md`. В облаке: `/mnt/project-files/knowledge/`.
- AGENTS.md: рабочий порядок «вывод → канон/статус → достижимость и достаточность раздельно → зависимости/темп/разнообразие → последствия → риск → улучшение». Варианты 2–4 с метками латиницей (E1-A), цепочка «видит → подозревает → ищет → действие → открывает → куда идёт».
- Статусы: утверждено / направление принято / предложено / не выбрано / отвергнуто / условный пример. 04 §3–§4 — отвергнутое, не возвращать без новой причины.
- DESIGN_PRINCIPLES v1.2: 45 принципов (GOV, STR, REV, CLU, SUS, HYP, FAIR, AHA, GATE, LOAD, START, PACE, WORLD, TEST, MEDIA), DESIGN VALIDATION CHECKLIST A–L (да/нет/пока не проверено/не применимо), «Как трактовать результат»: конкретная проблема / риск / деталь поздней реализации / рабочее решение. Минимальная карточка решения.
- TEST-01..04: логика, достижимость, интерес раздельно; стресс-прогоны; TEST-03 — «на людях, не знающих разгадку»; «Не заявлять прохождение плейтеста, если выполнены лишь чтение…». Авторский прогон ≠ плейтест.
- CLUE_INTERACTION_GUIDE: этапы О/Д/И (обнаружение, доступ, интерпретация), CA-01–CA-18, M01–M24.
- 02: E00–E41 (семейства материалов), F01–F105 (сведения), R01–R41 (выводы), A00–A40 (доступы), N (направления), замки. Стандарт E16 v3 (три происхождения: предмет/место/время).
- 03: §1–2 стартовое знание, §3 три первых вопроса, §4 маршруты А–И, §5 Prestige, §6 уровни понимания, §7 стандарт выводов, §9 прогоны для будущего плейтеста + «главный вопрос плейтеста», §10 старт S0–S4.

## Player-visible слой
- **Изготовленных игровых материалов нет** (00_README «Исходники и полнота»; 04 §5). Все файлы — авторские со спойлерами, player-visible и author-only перемешаны даже в 03.
- Ближайшее к player-visible: 03 §1 (что знает игрок), §10 (функциональный состав S0–S4), колонки 02 «Где/Доступ». Но в каждом есть авторская интерпретация.
- Вывод: для playtest нужен отдельный «пакет игрока» (манифест: материал → что буквально видно → как получить), сделанный отдельной задачей с решения автора. Без него симулированный playtest невозможен честно.

## Инструменты Claude Code (claude 2.1.310)
- `claude -p --restricted`: убирает Bash/WebFetch, игнорирует user/project/local settings, ограничивает файловые инструменты рабочими папками.
- `--safe-mode`: отключает CLAUDE.md, skills, plugins, hooks, MCP, agents.
- `--tools`, `--disallowedTools`, `--strict-mcp-config`, `--permission-prompts none`, `--session-id`/`--resume`, `--output-format json`, `--max-budget-usd`.
- `--bare` требует ANTHROPIC_API_KEY — в облаке нет, не годится.
- Env родителя содержит CLAUDE_ADDITIONAL_DIRECTORIES, CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD, CLAUDE_MEMORY_STORES, CLAUDE_COWORK_MEMORY_PATH_OVERRIDE — надо снимать в дочернем процессе (проверить).
- Skills в облачных тредах подключены симлинками `~/.claude/skills/<name>` → репо (setup script, цикл по папке).

## Проверено опытом (2026-10-26)
- `claude -p --restricted --safe-mode --strict-mcp-config --tools Read,Glob,Grep,Write --permission-prompts none` из папки-песочницы: чтение /mnt/project-files, репо CLAUDE.md, памяти, родительской папки — ОТКАЗ («--restricted confines the file tools to the working directory»). Запись в песочницу работает. В контексте нет ни БУНКЕРА, ни памяти, ни CLAUDE.md. Видны лишь путь cwd и userEmail/attribution от хоста → песочницу класть в нейтральный путь (/tmp/case-XXXX).
- Без `< /dev/null` CLI ждёт stdin 3 с — в скрипте перенаправлять.
- Модель дочернего процесса по умолчанию Sonnet; задавать `--model`.
- `context: fork` + `background: false` в SKILL.md: skill исполняется субагентом БЕЗ истории разговора (проверено кодовым словом), `${CLAUDE_SKILL_DIR}` подставляется, `$ARGUMENTS` передаётся. Подходит для независимого аудитора.
- Документация (code.claude.com/docs/en/skills.md): `allowed-tools` только предразрешает; ограничивает `disallowed-tools`. SKILL.md < 500 строк.
- reader-panel и feedback-triage требуют story.md и story CLI → в БУНКЕРЕ применимы только их шаблоны/методика (feedback-template, синтез convergent/divergent/single-reader, «не править до конца раунда»).
