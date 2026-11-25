# Task Plan: 3D-предметы стола — как делать (консультация, D3-…)

## Goal
Ответ автору + `design/3d/PIPELINE_PROPOSAL.md` («предложено, не канон») + пробный прогон Blender на ноутбуке 47; PR в main, слив — только по «мержим».

## Next Step
Коммит, PR, ответ автору; после «мержим» — слить и перенести папку в planning-archive/.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] Как устроено 3D в игре (hold/*.tsx — примитивы + canvas-текстуры, GLB нет)
- [x] ART-6, ART-48, ART-53, раздел 15, реестр линии 7–8, Blender N-B
- [x] Записать в findings.md
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Варианты D3-A…D3-D
- [x] Файл — `design/3d/PIPELINE_PROPOSAL.md` (3D-плана предметов ещё нет; design/blender — про бункер)
- **Status:** complete

### Phase 3: Implementation
- [x] Скрипт `design/blender/props/laptop_47_proc.py` (bpy, без сети)
- [x] Прогон Blender 5.1 без окна → GLB + PNG в bunker-media/probes/3d/
- [x] PROPS_PIPELINE_PROPOSAL.md (design/blender/)
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Открыть рендер, честно оценить (первый пересвечен — свет 60→5 Вт)
- [x] Проверить GLB: 35 узлов, lid_hinge и screen есть, 14 752 треуг., 6,1 МБ
- **Status:** complete

### Phase 5: Delivery
- [ ] Коммит, PR, ответ автору + SendUserFile
- **Status:** in_progress

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Не трогать game/ | правило проекта |
| Пробный прогон — локальный Blender, без генерации 3D в сервисах | генерация стоит кредитов/сеть — только с разрешения автора |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| Первый рендер пересвечен (лампа 60 Вт) | 5 Вт + заполняющий 0,6 |
