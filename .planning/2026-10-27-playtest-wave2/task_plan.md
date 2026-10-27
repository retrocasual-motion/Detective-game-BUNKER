# Task Plan: Плейтест волна 2 на main после A-228/A-229

## Goal
Прогнать пять профилей (без Fable) на пакете v1-2026-10-26 после A-229, собрать отчёт волны 2 с разбором и аудитом и отдать Артему; правки — только после его решения.

## Next Step
A-230 внесено; аудит A-230, затем мёрж PR #9 и три прогона Sonnet.

## Current Phase
Phase 5

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

### Phase 5: A-230 по решению автора (27.10 15:11)
- [x] Взломщик: раунд 9 на замороженной копии пакета — ФИНАЛ, Лея ~50 %
- [x] leaf-room-forms после отдельных пачек, leaf-p01-p02; опись П-02 «42, из них картон — 1»; L214 «экрана терминала»; письмо 4 по смыслу (regex + intent, `fallback` у «не значится»); L101 без «точного»
- [x] Канон 01–04, DECISIONS_LOG A-230; lint 0/1, walk 125/0, 65/65
- [ ] detective-auditor по A-230
- **Status:** in_progress

### Phase 6: Мёрж и три прогона
- [ ] Мёрж PR #9 (автор 15:11: «после того, как всё изменим, сделаем мёрж»)
- [ ] Прогоны Sonnet: casual, prosecutor, procedural (3/10)
- [ ] Отчёт волны 3
- **Status:** pending
