# Task Plan: правки по аудиту конвертов (A-261)

## Goal
Принять рекомендации аудита A-260: названия конвертов (N-B), пустой поиск (S-B), своды и
пакет приведены к игре, риски — в очередь.

## Next Step
Ждать «мержим» автора.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] Решение автора 09.11: «все варианты, которые ты рекомендуешь»
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Список правок по AUD-2…AUD-11
- **Status:** complete

### Phase 3: Implementation
- [x] Своды 02, 03, 04, журнал A-261; пакет 01, access/build_access, PACK.md; игра — названия, поиск
- **Status:** complete

### Phase 4: Testing & Verification
- [x] lint пакета; biome, typecheck, unit, e2e 86; снимок надписей
- **Status:** complete

### Phase 5: Delivery
- [x] PR
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Надпись на конверте с переносом, ширина по содержимому до 88% | новые названия длиннее |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| Замена в player/01 не нашла текст | рабочая копия в CRLF — замена с учётом CRLF |
