# Findings — этап 1b
- TECH_PLAN 4.0 (R-A): финал — нарисованные кадры с анимацией; серая CSS-3D комната — заглушка, R-A не меняется.
- Сервер: GET /api/state — safeParse; неверное состояние → defaultState. Поэтому v1 нужно поднимать до v2, а не терять доску.
- Геометрия: камера = translateZ(p) rotateX(-rx) rotateY(-ry) translate(-E); грань = translate(E + p·dir) rotateY(ry) rotateX(rx);
  dir = (-sin ry·cos rx, sin rx, -cos ry·cos rx). Для своей позы произведение = единица → в покое можно снять 3D без скачка.
