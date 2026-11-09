# Task Plan: корзина для писем-ответов (TR-A) и «Повторить ходатайство» (RP-A)

## Goal
Игрок выбрасывает письма-ответы (только M) в корзину у стола и достаёт их обратно во
«Входящие»; из письма-ответа одной кнопкой собирает новый черновик с теми же Кому/Прошу/
На основании.

## Next Step
Ждать ответа автора по PR; после слияния — перенести папку в planning-archive/.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] Решение автора: TR-A (только письма-ответы M), RP-A (кнопка в письме)
- [x] Разведка кода (findings.md)
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Подход: `trash: string[]` в PlayerState (default []), корзина — предмет на столе (decor),
      окно корзины, ✕ у письма на стене, кнопки в просмотрщике, бросок письма из лотка на корзину;
      повтор — разбор копии ходатайства из тела письма (формат в shared, им же пишет API)
- **Status:** complete

### Phase 3: Implementation
- [x] shared: схема trash, inboxIds без корзины, reconcile, формат/разбор письма
- [x] api: invalidReference для trash; тело письма через shared
- [x] web: действия trash/restore, корзина на столе, окно корзины, ✕ на стене, просмотрщик
- [x] web: «Повторить ходатайство» → новый черновик, папка открыта
- **Status:** complete

### Phase 4: Testing & Verification
- [x] unit (shared, web), e2e (корзина, повтор), typecheck, biome
- [x] скриншот стола с корзиной
- **Status:** complete

### Phase 5: Delivery
- [x] DECISIONS.md, DEVELOPMENT.md при необходимости, PR, вопрос «мержим?»
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Корзина стоит на столе справа (не на полу) | с сидячей камеры пол у стола не виден |
| Выброшенное письмо остаётся в деле; карточки из него работают | «выбросить» = убрать с глаз |
| Достать — во «Входящие» | TR-A |
| Ветка от dev/petition-checklist (PR #49 ещё не слит) | список и правки PR #49 нужны тут же |

## Errors Encountered
| Error | Resolution |
|-------|------------|
