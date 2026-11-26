# Задание для VS Code: округ Сильвер-Ридж → Блэквуд в коде игры (A-286)

Канон и пакет игрока уже переименованы (ветка `claude/blackwood-rename`, A-286, ART-60/61). Код игры
правится только в VS Code — ниже всё, что осталось в `game/packages`. Смысл игры не меняется:
меняются только имена и адреса.

**Замены:**
- `silverridge-chronicle.com` → `blackwood-chronicle.com` (сайт газеты).
- `okrug-bureau.org` → `blackwood-bi.org` (сайт бюро и почта: `zapros@`, `duty@` — локальная часть
  та же); метка сайта `okrug-bureau` → `blackwood-bi`.
- «Вестник Сильвер-Ридж» → «Вестник Блэквуда».
- В поиске номеров газеты слово `silverridge` → `chronicle` (как в правилах пакета).

**Где (по `git grep`, без `dist/` и `node_modules`):**
1. `game/packages/api/src/app.ts:169` — `'газет|вестник|silverridge'` → `'газет|вестник|chronicle'`.
2. `game/packages/api/src/env.ts:41` — `MAIL_FROM` по умолчанию `zapros@blackwood-bi.org`.
   Проверь `.env`/`.env.example` и настройки почты: если адрес отправителя где-то задан явно — тоже.
3. `game/packages/api/src/sites.ts:49` — `{ domain: 'blackwood-bi.org', label: 'blackwood-bi', … page: 'L181' }`.
4. `game/packages/api/test/login.test.ts:62` — адрес отправителя.
5. `game/packages/game-web/src/laptop/apps.tsx:520, 538` — домен газеты.
6. `game/packages/game-web/src/pc/apps.tsx:56, 78, 113` — домен газеты (адрес по умолчанию `blackwood-chronicle.com/arhiv`).
7. `game/packages/game-web/src/paperLinks.test.ts:26` — адрес в тестовой строке.
8. `game/packages/game-web/e2e/full-case.spec.ts:615`, `e2e/sites.spec.ts:226` — `blackwood-bi.org`, `duty@blackwood-bi.org`.
9. `game/packages/game-web/e2e/search.spec.ts:119` — поиск `'Вестник Блэквуда'`.
10. Файл пакета переименован: `locked/L181__сайт_okrug-bureau.org.md` → `locked/L181__сайт_blackwood-bi.org.md`.
    Если сборка контента ищет файл по имени — проверь.

**Затем:**
- `pnpm content:build` (пересобрать `game/packages/content/dist/*.json` из пакета v3.4).
- `pnpm lint`, `pnpm test`, e2e (Playwright).
- Финальная проверка: `git grep -n -i "silverridge\|okrug-bureau\|Сильвер" -- game/packages ':!**/node_modules/**'` — пусто.

**Не менять:** тексты материалов (они уже в пакете), логику доступа, другие домены.
