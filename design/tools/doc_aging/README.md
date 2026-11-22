# Сборка состаренных документов (DOC-A)

Процесс DOC-A (ART-36): вёрстка HTML/CSS → картинка по слоям (`render.js`, Playwright) → бумага →
документ **умножением** (текст не меняется) → почерк с дрожанием, нажимом, мазком → слои следов из
библиотеки по рецепту документа (`design/documents/recipes/<№>.json`, список — `WEAR.md`) →
профиль носителя (раздел 4) → проверка читаемости строк вывода → **рельеф** (DV-B, 22.11):
карта высот и нормалей для просмотрщика и 3D-стола.

| Файл | Что делает |
|---|---|
| `render.js` | вёрстка → `<префикс>_all/_print/_<рука>.png` и рамки строк вывода `[data-keep]` (`_boxes.json`) |
| `assemble.py` | сборка v2: бумага, умножение, руки, следы, журнал, профиль, читаемость, рельеф |
| `triage_textures.py` | обзор входящих референсов: листы-превью и метрики (опора для вердикта) |
| `extract_wear.py` | референс → «выровненный» слой библиотеки (режимы flat / stain / paper, `--text`, `--invert`, `--crop`) |
| `build_library.py` | библиотека целиком по таблице вердиктов (`CATALOG.md`) |
| `age_prototype.py` | прототип 22.11 (следы формулой) — для истории |

Вёрстки — `design/documents/layouts/`, рецепты — `design/documents/recipes/`. Картинки — медиа, в
git не кладутся: `E:\Projects\bunker-media\` (библиотека — `references\traces\library\`, пробы —
`probes\doc_aging\`).

## Запуск (Windows)

Python 3.12 с numpy, pillow, opencv-python (`pip install --user`). Запуск `python -P -E -X utf8`:
`-P` не подмешивает текущую папку в импорт (защита от подложенных модулей рядом с чужими файлами),
`-X utf8` — кириллица в выводе. Playwright берётся из `game/node_modules`, если нет своего.

```
python -P -E -X utf8 build_library.py E:/Projects/bunker-media/references/traces
node render.js ../../documents/layouts/11_defect_act.html <media>/probes/doc_aging/11/act11_s1 1 2
python -P -E -X utf8 assemble.py ../../documents/recipes/11.json <media>/probes/doc_aging/11/act11_s1 <media>/references/traces/library <out>.png --seed 1
```

Выход: `<out>.png` (документ), `<out>.json` (зерно, экземпляры, проверка читаемости),
`<out>_height.png` (16 бит, 0.5 = ровный лист), `<out>_normal.png`, `<out>_lit.png` (просмотр под
лампой, не ассет). Журнал экземпляров — `library\_usage.json`.

## Слой библиотеки

RGB 8 бит, бумага = 200, множитель = значение / 200 (блик светлее бумаги — до ×1.275). Основа
(`paper_base`) — сама бумага; в сборке берётся её фактура без цвета, сила — `paper.contrast`,
цвет — `paper.tone` рецепта.
