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

# Генерации Higgsfield (Nano Banana 2, 2K; промпты — GENERATE_PROMPTS.md; разбор 22.11 — CATALOG.md)
G = 'generated/'
ROWS += [
    ('HF-W13a', G + 'W13_office_paper_v2.png', 'paper_base', 'paper', [], 'офисная бумага, второй экземпляр (ровная)'),
    ('HF-W1a', G + 'W1_dust_edge_v1.png', 'stain', 'stain', ['--crop', '0.115,0.14,0.89,0.98'], 'мягкая пыль по левому краю листа'),
    ('HF-W1b', G + 'W1_dust_edge_v2.png', 'stain', 'stain', ['--crop', '0.07,0.035,0.925,0.96'], 'мягкая пыль по верхнему краю'),
    ('HF-W2a', G + 'W2_coffee_ring_v1.png', 'stain', 'stain', [], 'кофейные кольца (кружку ставили дважды)'),
    ('HF-W2b', G + 'W2_coffee_ring_v2.png', 'stain', 'stain', ['--crop', '0.13,0.08,0.87,0.91'], 'кофейное кольцо, разорванное'),
    ('HF-W2c', G + 'W2_tea_ring_v1.png', 'stain', 'stain', [], 'чайное кольцо, бледное, капля'),
    ('HF-W2d', G + 'W2_tea_ring_v2.png', 'stain', 'stain', [], 'чайное кольцо, заливка, подтёк'),
    ('HF-W3a', G + 'W3_water_ring_v1.png', 'stain', 'stain', [], 'след стакана воды — волна (рельеф: relief в рецепте)'),
    ('HF-W3b', G + 'W3_water_ring_v2.png', 'stain', 'stain', [], 'след стакана воды, почти бесцветный'),
    ('HF-W5a', G + 'W5_carbonless_v1.png', 'carbon_copy', 'stain', ['--crop', '0.02,0.03,0.98,0.97'], 'копия самокопирующегося бланка: синие следы давления'),
    ('HF-W5b', G + 'W5_carbonless_v2.png', 'carbon_copy', 'stain', ['--crop', '0.095,0.06,0.915,0.945'], 'то же, второй'),
    ('HF-W6a', G + 'W6_drafting_folded_v2.png', 'fold', 'flat', [], 'тонкая чертёжная, гармошка 6×4'),
    ('HF-W6b', G + 'W6_drafting_folded_v1.png', 'fold', 'flat', ['--crop', '0.02,0.02,0.98,0.98'], 'то же, грубее, потёртость на сгибах'),
    ('HF-W10a', G + 'W10_stamp_violet_v1.png', 'stamp', 'stain', [], 'краска штампа, фиолетовая'),
    ('HF-W10b', G + 'W10_stamp_violet_v2.png', 'stamp', 'stain', [], 'краска штампа, фиолетовая, угол прижат'),
    ('HF-W10c', G + 'W10_stamp_blue_v1.png', 'stamp', 'stain', [], 'краска штампа, синяя, почти сухая'),
    ('HF-W10d', G + 'W10_stamp_blue_v2.png', 'stamp', 'stain', [], 'краска штампа, синяя, плотная'),
    ('HF-W10e', G + 'W10_stamp_red_v1.png', 'stamp', 'stain', [], 'краска штампа, красная'),
    ('HF-W10f', G + 'W10_stamp_red_v2.png', 'stamp', 'stain', [], 'краска штампа, красная, пятнистая'),
    ('HF-W11a', G + 'W11_finger_smudge_v2.png', 'stain', 'stain', [], 'жирный мазок пальца, без узора'),
    ('HF-W11b', G + 'W11_finger_smudge_v1.png', 'stain', 'stain', [], 'жирный мазок пальца на тёплой бумаге'),
]

for rid, src, kind, mode, extra, note in ROWS:
    inp = os.path.join(ROOT, src)
    if not os.path.exists(inp):
        print(f'{rid}: нет файла {src}')
        continue
    os.makedirs(os.path.join(ROOT, "library", kind), exist_ok=True)
    out = os.path.join(ROOT, 'library', kind, f'{rid}.png')
    cmd = [sys.executable, '-P', '-E', '-X', 'utf8', os.path.join(HERE, 'extract_wear.py'), inp, out,
           '--mode', mode, '--id', rid, '--note', note] + extra
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    print(f'{rid} → {kind}: ' + ('ok' if r.returncode == 0 else r.stderr.strip()[-300:]))
