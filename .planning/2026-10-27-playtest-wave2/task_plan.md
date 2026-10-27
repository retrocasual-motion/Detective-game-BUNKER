# Task Plan: Плейтест волна 2 на main после A-228/A-229

## Goal
Прогнать пять профилей (без Fable) на пакете v1-2026-10-26 после A-229, собрать отчёт волны 2 с разбором и аудитом и отдать Артему; правки — только после его решения.

## Next Step
Ждать решения Артема по документу «волна 2: проблемы и решения» (https://claude.ai/artifact/E5BL7Sm4bD3JxHo9mPtWGR): п. 1 правило leaf-room-forms, п. 2 П-02 (А/Б/В), п. 3–4, п. 5 раунд взломщику (песочница lockpicker-9551 цела).

## Current Phase
Phase 4

## Phases

### Phase 1: Выбор профилей
- [x] Артем 27.10 13:43: «следующую волну, без Fable, профили выбери сам»
- [x] Выбор: timeline (Opus, новый), lockpicker (Opus вместо Fable, новый), procedural (Sonnet), prosecutor (Sonnet, новый), casual (Sonnet, повтор)
- [x] Новые профили записаны в references/profiles, строки в RUNBOOK §4
- **Status:** complete

### Phase 2: Прогоны
- [x] timeline-5072: 5 р., верен (Лея 50), 11,14
- [x] lockpicker-9551: 8 р., без финала (Лея 50), 15,09; архив открыт по почте
- [x] procedural-3428: 5 р., верен, 4,66
- [x] prosecutor-d9a5: 8 р., виновный не назван, 7,49
- [x] casual-29fd: 5 р., неверен (Харт), 2,91
- **Status:** complete

### Phase 3: Отчёт
- [x] metrics + compare, synthesis.md, REPORT.md (playtest/runs/2026-10-27-v1-2026-10-26-wave2/)
- [x] detective-auditor (форк): claude/AUDIT_2026-10-27_playtest-wave2.md, AUD-49…54; AUD-49 — leaf-room-forms выдаёт П-02 вместе с П-01 (завышает обе волны)
- **Status:** complete

### Phase 4: Доставка
- [x] Коммит, PR #9, короткий отчёт Артему
- [ ] Перенос плана в planning-archive после мержа
- **Status:** in_progress

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Профили под A-229 | timeline — строки сеанса 08:30/08:41 и вывод «у кого дело»; lockpicker — ранний «архив Хейла» (AUD-43) и замки; procedural — ответы VAULTLINE и архив по названию (AUD-29); prosecutor — уверенный неверный финал (AUD-30); casual — повтор худшего случая волны 1 |
| Без корпоративщика, метаигрока | Архив и пункт 5 покрывают procedural и lockpicker; бюджет волны ≈ 50 USD-оценки |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
