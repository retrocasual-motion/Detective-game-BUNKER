# Task Plan: M0, этап 3 «Ходатайство и почта»

## Goal
Папка ходатайства с полями-строками бланка, карточками (выделить текст → «В ходатайство»;
перетащить лист в поле), адресной книгой и черновиками; отправка → штамп; ошибки
оформления — в папке (FORM-B: 7 правил + «не оформлено» + лимит); ответ — бумажным
письмом во «Входящие» на столе (MAIL-B) через задержку (DELAY-A, пока 12 с — настройка).

## Next Step
Готово: PR, CI — спросить автора «мержим?».

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] Решения автора 09.11: FORM-B, MAIL-B, DELAY-A (12 с на время проверки)
- [x] Движок: resolvePetition (чистая), act (пишет fails и почту), «почта» — файл карточек
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Сервер: таблица player_letters; /api/petition; материалы — без вложений недоставленных писем; письма — материалы M001…
- [x] Клиент: черновики в PlayerState (drafts, по умолчанию []), папка, карточки, выделение, перетаскивание
- **Status:** complete

### Phase 3: Implementation
- [x] engine: FORM_RULE_IDS + тест по access.json
- [x] shared: id M###, kind letter, isReleased L|M, CardSchema, DraftSchema, drafts в состоянии
- [x] api: таблица, миграция, /api/petition, /api/mail/pending, материалы с письмами, запрет ХОДАТАЙСТВО в /api/action в production, DELETE чистит письма; MAIL_DELAY_MS
- [x] web: папка (поля, адресная книга, карточки, черновики, отправка, штамп, ошибки)
- [x] web: «В ходатайство» у выделения в просмотрщике; лист со стены и письмо из лотка → в поле
- [x] web: ожидание письма (перезапрос материалов), письмо — конверт
- **Status:** complete

### Phase 4: Testing & Verification
- [x] unit, api, e2e; скриншоты
- **Status:** complete

### Phase 5: Delivery
- [x] Документы (DECISIONS, ARCHITECTURE, TECH_PLAN, DEVELOPMENT), PR, «мержим?»
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| В поле — одна карточка (новая заменяет) | движок: «прошу» и «основание» — по карточке |
| Карточка из письма M… уходит в движок как «почта» | движок ведёт почту как файл карточек |
| «Не оформлено», 7 правил FORM-B и лимит — ответ в папке, письма нет, попытка не тратится (кроме лимита) | E-A |

## Errors Encountered
| Error | Resolution |
|-------|------------|
| Python heredoc превратил 
 в перевод строки в тесте | правка через Edit |
| e2e: кнопка «В ходатайство» вне экрана (выделение ниже видимого) | выделение прокручивается в вид; кнопка прижимается к экрану |
