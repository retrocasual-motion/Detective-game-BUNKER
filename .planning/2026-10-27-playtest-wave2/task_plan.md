# Task Plan: Плейтест волна 2 на main после A-228/A-229

## Goal
Прогнать пять профилей (без Fable) на пакете v1-2026-10-26 после A-229, собрать отчёт волны 2 с разбором и аудитом и отдать Артему; правки — только после его решения.

## Next Step
Запустить прогоны по одному: timeline → lockpicker → procedural → prosecutor → casual.

## Current Phase
Phase 2

## Phases

### Phase 1: Выбор профилей
- [x] Артем 27.10 13:43: «следующую волну, без Fable, профили выбери сам»
- [x] Выбор: timeline (Opus, новый), lockpicker (Opus вместо Fable, новый), procedural (Sonnet), prosecutor (Sonnet, новый), casual (Sonnet, повтор)
- [x] Новые профили записаны в references/profiles, строки в RUNBOOK §4
- **Status:** complete

### Phase 2: Прогоны
- [ ] timeline (opus, 4 / 15)
- [ ] lockpicker (opus, 4 / 15)
- [ ] procedural (sonnet, 3 / 10)
- [ ] prosecutor (sonnet, 3 / 10)
- [ ] casual (sonnet, 3 / 10)
- **Status:** in_progress

### Phase 3: Отчёт
- [ ] metrics + compare, feedback по профилям, synthesis.md, REPORT.md (playtest/runs/2026-10-27-v1-2026-10-26-wave2/)
- [ ] detective-auditor (форк) по проблемным местам
- **Status:** pending

### Phase 4: Доставка
- [ ] Коммит, PR, короткий отчёт Артему
- [ ] Перенос плана в planning-archive после мержа
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Профили под A-229 | timeline — строки сеанса 08:30/08:41 и вывод «у кого дело»; lockpicker — ранний «архив Хейла» (AUD-43) и замки; procedural — ответы VAULTLINE и архив по названию (AUD-29); prosecutor — уверенный неверный финал (AUD-30); casual — повтор худшего случая волны 1 |
| Без корпоративщика, метаигрока | Архив и пункт 5 покрывают procedural и lockpicker; бюджет волны ≈ 50 USD-оценки |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
