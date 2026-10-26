# Как установленные skills работают на БУНКЕРЕ

Story Skills написаны для романа в формате `story.md` + `characters/` + главы + CLI
`story`. У БУНКЕРА этого нет, и это сознательно (см. `CLAUDE.md`). Поэтому из них
берётся **методика, чек-листы и references**, а не файлы и команды.

Запрещено без отдельного решения автора: создавать `story.md`, `characters/`,
`continuity/`, `feedback/` и прочую структуру Story Skills; запускать
`story-maintenance/scripts/story.js`. Если skill говорит «run `story …`», выполни
ту же проверку вручную по сводам.

## Перевод понятий

| В Story Skills | В БУНКЕРЕ |
|---|---|
| story bible, `story.md` | своды `bunker/01–04` + `DECISIONS_LOG.md` |
| файл персонажа | карточка в 01 §10 + файл линии `claude/<ИМЯ>_LINE_*.md` |
| clue / clue ledger | семейства E, сведения F, выводы R (02) |
| promise / payoff | setup → вывод R и место в маршруте (03 §4–§8) |
| question file | направление N, «три первых вопроса» (03 §3), открытые вопросы (04 §2) |
| глава, порядок чтения | стадия доступа: старт S0–S4 → первые проверки → после замков (03 §6, §10); порядок у игрока свободный |
| «culprit in the first third» | присутствие и первые честные опоры в стартовом слое или ранних узлах, без доказательства одной линией (03 §5) |
| сцена | событие хронологии 01 (день 13 по минутам) и то, какие носители оно оставило |
| timeline | 01 §5–§8, «день 13 по минутам»; правила мира 01 §11 |
| beta / panel feedback | отчёт playtest (`playtest/runs/…`) и отзывы людей |

## Что брать из каждого skill

| Skill | Брать | Для БУНКЕРА особо |
|---|---|---|
| character-management | `references/character-template.md` (мотивы, прошлое, timeline персонажа), `ensemble-cast.md`, `relationship-types.md` | Шаблон дополняется детективным досье (`detective-architect/references/character-dossier.md`); писать в 01, не в `characters/` |
| genre-craft | `references/mystery-fair-play.md`: fair-play правила, red-herring discipline, mystery audit | Число глав → стадии доступа; «clue ledger» уже есть — это 02 |
| plot-structure | причинность, timeline, `question-template.md`, `promise-template.md` как формы мысли | Не строить актовую структуру: маршрут нелинейный (STR-01) |
| worldbuilding | `location-template.md`, `artifact-template.md`, `economy-logistics.md` (время пути) | Физическая возможность, маршрут по плану v3, кто где мог быть |
| scene-craft | событие как причина → действие → результат; `scene-cards.md` | Для CCTV/радио/диктофона: что фиксирует носитель и чего не может (WORLD-02) |
| voice-style | голоса персонажей, `style-sheet-guide.md` | Только для документов/интервью по отдельной задаче на тексты |
| theme-craft | `antagonist-design.md` (у противника свои причины), мотивы | Тема ≠ улика; не добавлять материал ради мотива-символа |
| revision-continuity | `references/pass-checklists.md`: continuity, reveal economy, clue check | После каждого принятого изменения; вручную по 01–04 |
| research | факты реального мира (медицина, радио, CCTV, доступ, связь) | Только где ошибка повредит истории или честности вывода |
| assumption-challenger | категории допущений, Inverse Test, Stress Test | Вопросы: почему игрок сделает вывод; откуда персонаж знает; другое объяснение; не протекает ли авторское знание |
| self-eval | две оси (амбиция × исполнение), devil's advocate, anti-inflation | После крупной переработки, аудита, отчёта playtest |
| feedback-triage | `references/feedback-template.md`, `synthesis-template.md`: convergent / divergent / single, «не править до конца раунда», declined with reason | Без `story.md` и CLI; файлы лежат в папке прогона `playtest/runs/<run>/feedback/` |
| reader-panel | только по команде `/reader-panel` пользователя | Требует `story.md` и главы — к архиву дела напрямую не применим; его персоны читают в общем контексте и **не изолированы** от авторского знания. Для проверки глазами игрока — detective-playtester |
| story-maintenance | ничего (CLI) | Не запускать |
| Planning with Files (плагин) | `.planning/ГГГГ-ММ-ДД-тема/` | Процесс, не канон; правила в `CLAUDE.md` |

## Если Skill tool недоступен

В отдельном контексте (форк аудитора, субагент) skill можно не суметь вызвать.
Тогда прочитай его `SKILL.md` и нужный reference напрямую:
`.claude/skills/<skill>/SKILL.md` от корня репозитория (все skills лежат рядом).
