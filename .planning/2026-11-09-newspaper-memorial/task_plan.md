# Task Plan: Том в бумажной газете, сайт — только архив (A-262)

## Goal
Колонка «Помним» в номере 16.11.2009 (три записи, Том — по дню рождения); сайт газеты —
только архив номеров; лента объявлений снята.

## Next Step
Ждать «мержим» автора.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] Даты Тома: смерть 06.10.2008 закреплена (этап A, кассета, справка, A-251); год рождения 1974 без дня
- **Status:** complete

### Phase 2: Planning & Structure
- [x] DT-C + SITE-A выбраны автором
- **Status:** complete

### Phase 3: Implementation
- [x] Своды 02, 03, 04, A-262; пакет 15, 04, 16 (снят), access, build_access, values, PACK.md; код — одна закладка
- **Status:** complete

### Phase 4: Testing & Verification
- [x] lint пакета, biome, typecheck, unit, e2e 86
- **Status:** complete

### Phase 5: Delivery
- [x] PR
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| День рождения Тома 15.11.1974 | номер 16.11 — понедельник, «вчера» — воскресенье; в анкете только год |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| Тест shared: 16 на стене | фикстура — как контент, без 16 |
