# Task Plan: пакет «Blackwood» — округ Сильвер-Ридж → Блэквуд, решения по знакам

## Goal
Одним PR внести решения автора 25–26.11: округ Сильвер-Ридж переименован в Блэквуд (R-A) везде в каноне, пакете игрока и документах; знак бюро S1/H-B «Blackwood Bureau of Investigation» и VAULTLINE V-A записаны в ART; задание VS Code на код игры; сопутствующие файлы (наклейка, промпты) закоммичены.

## Next Step
Phase 5: PR и вопрос автору «мержим?».

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] Решения автора: Blackwood = имя округа (R-A); знак фирменный, латиница (исключение из запрета 22); только синий; голова H-B; верх прямой, низ дугой
- [x] Имена по предложению Claude (автор сказал «собирай» без правок): «Вестник Блэквуда», blackwood-chronicle.com, почта бюро blackwood-bi.org
- [x] Объём: ~33 файла «Сильвер-Ридж», ~21 файл silverridge; game/packages — только задание VS Code
- **Status:** complete

### Phase 2: Канон и пакет игрока
- [x] bunker/ 00–04, AGENTS, docs — замена + падежи
- [x] playtest/packs/v3.4: player, locked, gm (build_access.py → access.json), переименование файлов с доменом
- [x] DECISIONS_LOG: новый A-номер
- **Status:** complete

### Phase 3: Дизайн и документы игры
- [x] design/: DECISIONS (ART-59 VAULTLINE, ART-60 бюро, ART-61 исключение запрета 22), ART_BIBLE §12/§16, README, ASSET_REGISTRY, layouts, research
- [x] game/docs (только документы, не код)
- [x] Задание VS Code: game/packages (5 файлов) + content:build + тесты
- **Status:** complete

### Phase 4: Проверка
- [x] grep: «Сильвер», silverridge, okrug-bureau не осталось вне истории (claude/, Архив/, старые A-записи)
- [x] playtest.py lint/walk пакета
- **Status:** complete

### Phase 5: Delivery
- [x] Коммит, PR, вопрос «мержим?»
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Историю (claude/ сессии, аудиты, Архив/, старые записи DECISIONS_LOG) не переписывать | это журнал того, что было; новое имя фиксирует новая A-запись |
| game/packages не править здесь | правило автора: код игры — только в VS Code; задание — VSCODE_TASK.md |
| Имена газеты и бюро — по предложению Claude | автор сказал «собирай» без правок |
| GEN_2026-11-23_PENDING.md не трогать | это другие решения (кабинет, лестница), им нужен architect |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| build_access.py без аргумента — IndexError | путь выхода аргументом; сборка во временный файл совпала с access.json |
