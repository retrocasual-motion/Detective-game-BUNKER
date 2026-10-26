# Источники project skills

В этой папке лежат 14 skills, скопированных из upstream-репозиториев по одному
(не целыми наборами). Все три источника распространяются по лицензии MIT;
текст лицензии с копирайтом автора лежит в каждой папке skill (`LICENSE`).

Planning with Files сюда не копируется: он подключён как плагин
(`.claude/settings.json` и setup script облачной среды).

## danjdewhurst/story-skills

- Репозиторий: https://github.com/danjdewhurst/story-skills
- Коммит: `57121ee512c6d4218a285c6991193347944f31b0` (2026-10-20, версия набора 0.24.0)
- Лицензия: MIT, © 2026 Daniel Dewhurst
- Путь в upstream: `skills/<name>/`

| Skill | Изменения |
|---|---|
| story-maintenance | без изменений (включая bundled CLI `scripts/story.js`) |
| character-management | без изменений |
| worldbuilding | без изменений |
| plot-structure | без изменений |
| theme-craft | без изменений |
| genre-craft | без изменений |
| scene-craft | без изменений |
| voice-style | без изменений |
| revision-continuity | без изменений |
| research | без изменений |
| reader-panel | добавлено `disable-model-invocation: true` во frontmatter: запуск только командой `/reader-panel` |
| feedback-triage | без изменений |

Не установлены (есть в наборе, но не нужны): adaptation, chapter-writing,
discovery-drafting, editorial-review, interactive-fiction, line-editing,
premise-workshop, publishing, series-continuity, story-init, submission,
verse-craft. Тексты skills иногда ссылаются на них («use line-editing»):
это просто подсказки upstream, таких skills здесь нет.

## alirezarezvani/claude-skills

- Репозиторий: https://github.com/alirezarezvani/claude-skills
- Коммит: `6d2f02ea077eead1bee5411a31bcc6db5a11a70c` (2026-10-23)
- Лицензия: MIT, © 2025 Alireza Rezvani
- Путь в upstream: `engineering/skills/self-eval/`

| Skill | Изменения |
|---|---|
| self-eval | без изменений |

## alirezarezvani/claude-cto-team

`assumption-challenger` в репозитории `alirezarezvani/claude-skills` нет ни в
одной ветке и ни в одном коммите истории. Skill с этим именем есть у того же
автора в соседнем репозитории, откуда он и взят.

- Репозиторий: https://github.com/alirezarezvani/claude-cto-team
- Коммит: `a5bbb788bab6009269f68ae19ff11eeb0e914a26` (2025-12-18)
- Лицензия: MIT, © 2025 Alireza Rezvani
- Путь в upstream: `skills/assumption-challenger/`

| Skill | Изменения |
|---|---|
| assumption-challenger | заменено только поле `description` во frontmatter. Исходное: «Identify and challenge implicit assumptions in plans, proposals, and technical decisions. Use when strategic-cto-mentor needs to surface hidden assumptions and wishful thinking before they become costly mistakes.» Оно привязывало skill к отсутствующему здесь `strategic-cto-mentor`, и Claude не вызывал бы его для сюжета. Тело skill не менялось. Ссылка на `wishful-thinking-patterns.md` битая уже в upstream (файла там нет). |

## Как обновить

Склонировать upstream, сверить коммит, скопировать нужную папку поверх
существующей и заново применить изменения из таблиц выше.
