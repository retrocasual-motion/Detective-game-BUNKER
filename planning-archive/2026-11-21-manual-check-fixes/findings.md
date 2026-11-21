# Findings

- Паузы: api/src/app.ts GAME_CONFIG.unlimited (DS-B) — шаблоны цели поля; газета NP, сеансы `сеанс|сервер\w* объект|код\w* пользовател`.
- Дисковод: room/decor.ts PC_X/PC_Z, TURN 25 у монитора; дисковод не повёрнут.
- Коробка «Личные вещи» вскрытая — key 'bags' без hotspot (функции нет); e2e desk.spec/archive.spec ждут bags-box.
- Рост листа: app.css @media (hover) .wall-card:hover > .paper scale (W8-A, 18.11).
- Входящие: shared/layout.ts inboxIds; свойства файла — материалы с title /^Свойства файл/.
- Подсветка: search/highlight.ts — только внутри одного текстового узла; журнал сервера — таблица.
- Выписка: shared ExcerptPlace {kind,address,letter}; store.openExcerpt; ServerApp sectionOf(material).
- Ноутбук/телефон: session useState(false) → экран «Войти» при каждом открытии.
- Телефон: deskphone/call.ts press(); DeskPhone.tsx onKey; PhoneFace handset button.
- Кассета: hold/cassette.tsx CassetteHeld; образец — radioStand.tsx (Key, useActive, Focus); L462 — таблица по времени (media.ts timed).
- 5.5: L619 (анкета A-24) несёт адрес хранилища; дата 06.10.2008 — из справки L957 (П-05). Убрать дату → L619 открывается по коду A-24 (код — из L991). Пауза поля учёта остаётся (перебор A-xx).
