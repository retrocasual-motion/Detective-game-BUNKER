# Findings

- Письмо-ответ — материал `M\d{3}`; тело собирает `api/src/app.ts` (POST ходатайства):
  «**От:** адрес», текст, «Вложения», `---`, «Прошу: F — «Q»», «На основании: F — «Q»».
- PlayerState (shared/schemas.ts, STATE_VERSION 5): drafts добавлены через `.default([])` без
  смены версии — так же можно `trash`.
- `inboxIds` (shared/layout.ts) — L/M не на стене; корзину надо исключить.
- API `invalidReference` проверяет карточки, элементы стены и нити — добавить trash.
- Лоток рисуется в `room/decor.ts` (`inboxObjects`), щелчки — `room/DeskHotspots.tsx`; письмо из
  лотка уже тянется призраком (`startGhostDrag`) на доску и в поля папки.
- Видимая ширина при сидячей камере: |x| ≲ глубина (eye z = 1.2p), справа у стола пол не виден.
- WallCard: `onDelete` даёт ✕ (сейчас только записки) + тост «Вернуть» в WallView.
