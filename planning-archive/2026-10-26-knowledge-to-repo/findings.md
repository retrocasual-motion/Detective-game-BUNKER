# Находки

- Ссылки в 00_INDEX.md имеют вид `bunker/...`, `claude/...`, `Архив/` от общего корня —
  при размещении в корне репо работают.
- Уже битые до переноса (не трогали, это правка содержимого):
  - `bunker/00_README.md`: `](DECISIONS_LOG.md)`, `](LEYA_LINE_FINAL.md)`, `](LEYA_LINE_SESSION.md)`,
    `](KILLER_COMPARISON.md)`, `](TENTH_*.md)` — файлы лежат в `claude/` и `Архив/claude/`.
  - `bunker/docs/CLUE_INTERACTION_GUIDE.md`: `../archive/original_project/docs/*` — этих файлов нет нигде.
  - `reports/detective-skills/DETECTIVE_SKILLS_REPORT.md` упоминает `knowledge/claude/AUDIT_...` (путь в файлах проекта).
- Skills (`canon-and-status.md`) уже искали сначала в репо `bunker/`, `claude/`, затем в файлах проекта.
- `playtest.py` probe проверяет недоступность `/mnt/project-files/knowledge/bunker/AGENTS.md`;
  теперь канон и в репо — добавить в probe и `bunker/AGENTS.md` репо.
