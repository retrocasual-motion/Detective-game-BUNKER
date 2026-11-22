# Сборка состаренных документов (прототип)

Процесс DOC-A (ART-36): вёрстка HTML/CSS → картинка (`render.js`, Playwright) → бумага → документ
(умножением, текст не меняется) → слои следов из библиотеки по списку документа
(`design/documents/WEAR.md`) → профиль скана или копии (раздел 4) → проверка читаемости.

Сейчас — прототип 22.11: следы нарисованы формулой (`age_prototype.py`); следующий шаг — слои из
библиотеки следов (`design/references/traces/CATALOG.md`) с вариациями на каждый документ
(положение, поворот, масштаб, сила, обрезка; своё зерно), извлечение следов из референсов с
текстом (`extract_wear.py`), автопроверка контраста текста.

Запуск (в venv с numpy, pillow, opencv-python; Playwright — из окружения):
```
node render.js /abs/path/doc.html out.png
python age_prototype.py            # читает act_clean.png, пишет act_aged_v2.png
python extract_wear.py in.png out.png
```
Картинки — медиа, в git не кладутся.
