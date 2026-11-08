# Task Plan: UX-принципы для игры БУНКЕР (UX-NEXT)

## Goal
Сдать через PR: `game/docs/UX_PRINCIPLES.md` (принципы по темам + чек-листы + «как пользоваться»),
`game/docs/research/ux-games.md`, `ux-sources.md`, `ux-skills.md`, сверку прототипа с вариантами
UX-A…, предложение строки в `game/CLAUDE.md` (на решение автора). Код и канон не трогать.

## Next Step
Ждать решений автора (UXP, CL, TWO, MOVE, FULL, KEY, READ, NOTE, SK, UX-A…L) и «мержим?».

## Current Phase
все фазы завершены

## Phases

### Phase 1: Чтение правил и документов игры
- [x] CLAUDE.md, game/CLAUDE.md, README, TECH_PLAN §2, §4, DECISIONS (1b, UX-1, UX-NEXT), ARCHITECTURE
- **Status:** complete

### Phase 2: Исследование (параллельно) и снимки прототипа
- [x] Помощник A: разбор игр (цифровые детективы) → notes/games-a.md
- [x] Помощник B: игры-коробки + браузерные + доп. игры → notes/games-b.md
- [x] Помощник C: литература и статьи → notes/sources.md
- [x] Помощник D: skills и инструменты (в т. ч. «StagesHow») → notes/skills.md
- [x] Снимки всех видов прототипа, наблюдения → findings.md
- **Status:** complete

### Phase 3: Сборка документов
- [x] research/ux-games.md, ux-sources.md, ux-skills.md
- [x] UX_PRINCIPLES.md (темы, принципы по шаблону, чек-листы, как пользоваться)
- [x] Сверка прототипа (UX-A1…) — раздел в UX_PRINCIPLES или отдельный файл
- **Status:** complete

### Phase 4: Проверка
- [x] Каждый принцип: формулировка, почему, источник, пример, применение, антипример, вопрос
- [x] Нет паролей/ответов/спойлеров канона; ссылки на месте; «не проверено» где надо
- [x] проверка: скрипт полей + сверка примеров с notes/ (self-eval skill не запускался)
- **Status:** complete

### Phase 5: PR и сдача
- [x] Коммит, push, PR; план → planning-archive
- [x] Ответ автору: сделано, 5–7 выводов, решения с контекстом; «мержим?»
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Сверку прототипа кладу в `game/docs/research/ux-audit-m0.md` + сводка в UX_PRINCIPLES | памятка остаётся долгоживущей, сверка — снимок этапа |
| Пароли/ответы из TECH_PLAN в новые документы не переносить | P-10, правило задачи |
| Разборы игр — заметки двух помощников, сведены в один файл со сводкой из 12 выводов | без потерь, с общей шапкой |
| Примеры «в игре» без источника заменены на «прямого примера нет» | правило «ничего не придумывать» |
| Self-eval отдельным skill не запускался: проверка полей скриптом + ручная сверка примеров с notes/ | экономия; отмечено в progress |

## Errors Encountered
| Error | Resolution |
|-------|------------|
