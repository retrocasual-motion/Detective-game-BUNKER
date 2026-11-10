# Progress

## 2026-11-10
- ZM-B: setView ставит камеру «вся доска»; конверт — focusCamera. Переход 0,6 с, синус.
- WB-C: WALL_BOUNDS 3600×2025, boardCamera, minZoomFor = вся доска, рама у пробки, decor без рамы плоскости.
- freeBlock вширь, форма группы 10/8/6/4; 24 порядка — без наложений (тест).
- reconcile: старые вещи за краем — к краю. «Разложить» камеру не трогает.
- e2e: bringIntoView; новые тесты WB-C/ZM-B. Итог: lint, typecheck, unit (47+24+66+9+49), e2e 93 — зелёные.
