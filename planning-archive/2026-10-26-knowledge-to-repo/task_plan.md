# Перенос knowledge в репозиторий

Цель: перенести `/mnt/project-files/knowledge/` (bunker/, claude/, Архив/) и `reports/`
в репо как есть, без правок содержимого; перевести CLAUDE.md и detective-skills на чтение
канона из репо. Файлы проекта не удалять. Канон не трогать (параллельно идёт линия Ричарда).

## Фазы
- [x] 1. Осмотр: структура репо, ссылки между файлами, ссылки в skills — `complete`
- [x] 2. Копирование в корень репо (bunker/, claude/, Архив/, reports/) с проверкой хешей — `complete`
- [x] 3. CLAUDE.md, README.md, canon-and-status.md, playtest.py probe — `complete`
- [x] 4. Ветка, коммит, PR; план в planning-archive/ — `complete` (мёрж — по слову автора)

## Решения
- Корень репо, а не `knowledge/`: инструкции проекта и skills уже ссылаются на
  `bunker/...`, `claude/...` от корня; ссылки в 00_INDEX тоже от корня.
- Содержимое не правим, даже битые относительные ссылки (см. findings.md).
