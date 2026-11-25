# Task Plan: ноутбук Адама по A-283 — наклейка на дне вместо картинки учётной записи

## Goal
Картинка учётной записи — обычная (без знака и увеличения); на дне 3D-ноутбука — наклейка
(текстура из bunker-media, общий способ отдачи медиа); игрок сам переворачивает и приближает её —
L947 в деле. Тесты с медиа и без, документы, PR.

## Next Step
Полный e2e с медиа → коммит → PR → gh pr checks → «мержим?».

## Current Phase
Phase 5

## Phases

### Phase 1: Разбор
- [x] задание (A-283, ART-58, TECH_PLAN 4.9), ассет sticker_47_v3_rgba.png, _NOTES.md
- [x] код: LockScreen/Welcome, laptopFace, shapes.tsx Laptop, Held3D, zoom.ts, orient (наклон ≤ 80°)
- **Status:** complete

### Phase 2: Медиа из bunker-media
- [x] MEDIA_DIR (env), сервер отдаёт /media/<имя> только из списка (не всю папку: P-A — утечка A-226)
- [x] Vite: прокси /media; compose: том; нет файла — 404, игра рисует светлую плоскость
- **Status:** complete

### Phase 3: Экран входа без знака
- [x] LockScreen, Welcome, laptopFace — нейтральный силуэт; снять увеличение и .lap-avatar-big
- **Status:** complete

### Phase 4: Наклейка на дне и правило «близко → L947»
- [x] плоскость на дне (размер по E6400 35 см), прозрачность, без z-fighting
- [x] правило (чистая функция + unit), один раз postAction ОСМОТР '47 наклейка на дне ноутбука'
- [x] клавиатура — по UX_PRINCIPLES
- **Status:** complete

### Phase 5: Тесты и документы
- [x] e2e full-case, laptop.spec; unit; без медиа (full-case и laptop — зелёные с медиа и без)
- [x] TECH_PLAN 4.9, DEVELOPMENT, ARCHITECTURE, DECISIONS (T-19, T-20, T-21)
- [ ] PR → gh pr checks → «мержим?»
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Медиа отдаёт сервер игры по списку имён, а не папкой | в bunker-media есть черновики с лишними клетками знака (A-226) |
| Наклон в руках ≤ 80° + наклон корпуса 16°: дно видно под ~26° — порог «лицом» с запасом | не менять общий предел вращения |
| Маршрут /api/media/<имя> (не /media): Vite и Docker уже ведут /api на сервер | без новой переадресации |
| Клавиатура: невидимая кнопка у наклейки (как у печати), только когда она лицом | KEY-A, AC-5; Z-2 — ничего не подсвечено |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| Наклейка — чёрная плоскость с meshStandardMaterial + карта | Lambert с картой (T-21); Basic тоже работал, но без света |
| Правка через bash-heredoc: обратная косая черта перед «b» в пути к bunker-media стала забоем | правка документов — скриптом из файла |
