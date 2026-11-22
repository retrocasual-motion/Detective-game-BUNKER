"""Библиотека следов из входящих референсов — по таблице вердиктов (design/references/traces/CATALOG.md).
Каждая строка: ID, файл в incoming, вид (папка library), режим extract_wear и параметры.
Перезапуск пересобирает слои; входящие файлы не меняются.

python -P -E -X utf8 build_library.py <bunker-media/references/traces>
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = sys.argv[1] if len(sys.argv) > 1 else 'E:/Projects/bunker-media/references/traces'
TL = 'incoming/texturelabs/Texturelabs_'

# (ID, файл, вид, режим, доп. аргументы, заметка)
ROWS = [
    ('TL-316', TL + 'Paper_316L.jpg', 'paper_base', 'paper', [], 'офисная бумага: мелкое волокно, как у копировальной'),
    ('TL-154', TL + 'Paper_154L.jpg', 'paper_base', 'paper', [], 'плотная бумага с зерном: бланки, анкеты, карточки'),
    ('TL-156', TL + 'Paper_156L.jpg', 'paper_base', 'paper', [], 'плотная бумага с зерном, бесшовная'),
    ('TL-290', TL + 'Paper_290L.jpg', 'paper_base', 'paper', [], 'газетная бумага, просвечивает оборот (нечитаемо)'),
    ('TL-305', TL + 'Paper_305L.jpg', 'paper_base', 'paper', [], 'серо-бурая газетная с крапом: газета 1987'),
    ('TL-147', TL + 'Paper_147L.jpg', 'paper_base', 'paper', [], 'крафт-картон: коробка-картотека, обложки'),
    ('TL-142', TL + 'Paper_142L.jpg', 'fold', 'flat', [], 'один чёткий сгиб'),
    ('TL-181', TL + 'Paper_181L.jpg', 'fold', 'flat', [], 'сетка 4×2: гармошка, большой лист (план 07)'),
    ('TL-185', TL + 'Paper_185L.jpg', 'fold', 'flat', [], 'вчетверо, крест в центре'),
    ('TL-289', TL + 'Paper_289L.jpg', 'fold', 'flat', ['--crop', '0.03,0.06,0.5,0.94'], 'вчетверо (левая половина сетки 4×2), потёрто на пересечении'),
    ('TL-122', TL + 'Paper_122L.jpg', 'crumple', 'flat', [], 'мягкие заломы + вертикальные сгибы'),
    ('TL-167', TL + 'Paper_167L.jpg', 'crumple', 'flat', [], 'заношенный лист: заломы, грязь в сгибах (сильно)'),
    ('TL-211', TL + 'Paper_211L.jpg', 'crumple', 'flat', [], 'волна от влаги'),
    ('TL-363', TL + 'Paper_363L.jpg', 'cardboard', 'flat', [], 'белый картон: заломы по краям'),
    ('TL-311', TL + 'Paper_311L.jpg', 'pin_tape', 'flat', ['--crop', '0.06,0.06,0.95,0.95'], 'лист, отклеенный со стены: клей, заломы'),
    ('TL-150', TL + 'Paper_150L.jpg', 'pin_tape', 'stain', ['--crop', '0.22,0.08,0.5,0.32'], 'след скотча (только сам след, бумага не наша)'),
    ('TL-312', TL + 'Paper_312L.jpg', 'stain', 'stain', [], 'грязь и пыль по краям, полосы'),
    ('TL-307', TL + 'Paper_307L.jpg', 'stain', 'stain', [], 'рыжие точки старения — только для бумаг с возрастом'),
    ('TL-164', TL + 'Paper_164L.jpg', 'toner_copy', 'stain', [], 'ксерокопия: полосы тонера, тени скотча и сгибов'),
    ('TL-248', TL + 'Paper_248L.jpg', 'toner_copy', 'stain', [], 'крапины копира'),
    ('TL-250', TL + 'Paper_250L.jpg', 'toner_copy', 'stain', ['--invert'], 'полосы и царапины копира (сильно)'),
    ('TL-337', TL + 'Paper_337L.jpg', 'toner_copy', 'stain', ['--invert', '--crop', '0.01,0.02,0.99,0.98'], 'шум архивной копии'),
    ('TL-329', TL + 'Paper_329L.jpg', 'stain', 'stain', [], 'пятна и тёмный край — для старых бумаг; не обгорание'),
]

for rid, src, kind, mode, extra, note in ROWS:
    inp = os.path.join(ROOT, src)
    if not os.path.exists(inp):
        print(f'{rid}: нет файла {src}')
        continue
    out = os.path.join(ROOT, 'library', kind, f'{rid}.png')
    cmd = [sys.executable, '-P', '-E', '-X', 'utf8', os.path.join(HERE, 'extract_wear.py'), inp, out,
           '--mode', mode, '--id', rid, '--note', note] + extra
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    print(f'{rid} → {kind}: ' + ('ok' if r.returncode == 0 else r.stderr.strip()[-300:]))
