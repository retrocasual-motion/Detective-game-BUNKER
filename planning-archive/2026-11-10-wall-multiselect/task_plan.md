# Task Plan: Стена — выделить несколько вещей и тащить вместе (MS-D)

## Goal
На стене правой кнопкой (или Shift + левой — тачпад) тянется рамка выделения; правый щелчок / Shift+щелчок по вещи — добавить/убрать; потянуть любую выделенную — едут все, нити за ними; Esc / щелчок по пустой пробке — снять.

## Next Step
Спросить «мержим?» (после #58); затем план → planning-archive/.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] Решение автора 10.11: MS-D — правая кнопка выделяет; Shift — для тачпада
- [x] Как устроено: Canvas (пан левой по фону), WallCard + useDraggable (тянуть левой), WallView (live для нитей, drop → moveItem), wallItemAt
- **Status:** complete

### Phase 2: Canvas — рамка
- [x] onMarquee: правая кнопка или Shift+левая по фону → start/move/end/click (экранные координаты)
- [x] contextmenu на стене — без меню браузера
- **Status:** complete

### Phase 3: WallView — выделение и групповое перетаскивание
- [x] selected (не сохраняется), подсветка во время рамки, правый щелчок/Shift+щелчок — переключить
- [x] тянуть выделенную — едут все (live-сдвиг у остальных, нити), drop → moveItems
- [x] Esc, щелчок по пустой пробке, уход со стены — снять
- [x] подсказка у «Записка / Ярлык»
- **Status:** complete

### Phase 4: Testing & Verification
- [x] unit: moveItems
- [x] e2e: рамка правой, Shift+рамка, правый щелчок, групповое перетаскивание + сохранение, Esc
- **Status:** complete

### Phase 5: Delivery
- [x] DECISIONS, ARCHITECTURE; PR
- [ ] «мержим?»; план → planning-archive/
- **Status:** in_progress

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| MS-D: правая кнопка — рамка и выбор; Shift+левая — то же | автор 10.11; левая остаётся «двигать», тачпад не умеет тянуть правой |
| Рамка заменяет выделение; с Shift/Ctrl — добавляет | как в проводнике и досках |
| Выделение не сохраняется в состоянии игрока | это жест, а не данные дела |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| biome: noStaticElementInteractions из-за onContextMenu на поверхности | biome-ignore с причиной |
| e2e: у нити нет атрибута d (это <line>) | сравнивать x1 |
