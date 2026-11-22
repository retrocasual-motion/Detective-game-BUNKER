"""Обзор входящих референсов следов: листы-превью (по 4 на лист, с подписью) и таблица метрик —
опора для вердикта «финал / образец для генерации» (ART-37). Вердикт ставит Claude глазами,
метрики только подсказывают.

python -I triage_textures.py <папка incoming> <папка вывода>
Метрики: размер; средний цвет; разброс яркости (контраст следа); доля «текста» (мелкие тёмные
штрихи — то, что убирает extract_wear --text); доля очень тёмного (фото, плотная заливка, фон
вокруг листа — их не вытащить, только обрезать).
"""
import sys, os, csv
import cv2, numpy as np
from PIL import Image, ImageDraw, ImageFont

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
files = sorted(f for f in os.listdir(src) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp')))
rows, thumbs = [], []
for f in files:
    img = cv2.imread(os.path.join(src, f))
    if img is None:
        continue
    h, w = img.shape[:2]
    sm = cv2.resize(img, (1200, int(1200 * h / w)), interpolation=cv2.INTER_AREA)
    g = cv2.cvtColor(sm, cv2.COLOR_BGR2GRAY)
    bg = cv2.medianBlur(cv2.morphologyEx(g, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)), 5)
    text = float((((bg.astype(int) - g.astype(int)) > 25)).mean())
    dark = float((g < 60).mean())
    b, gch, r = [int(v) for v in sm.reshape(-1, 3).mean(0)]
    rows.append({'file': f, 'size': f'{w}x{h}', 'rgb': f'{r},{gch},{b}', 'lum_std': round(float(g.std()), 1),
                 'text_share': round(text * 100, 2), 'dark_share': round(dark * 100, 2)})
    thumbs.append((f, Image.fromarray(cv2.cvtColor(cv2.resize(sm, (900, int(900 * h / w))), cv2.COLOR_BGR2RGB))))

with open(os.path.join(dst, 'triage.csv'), 'w', newline='', encoding='utf-8') as fh:
    wr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()) if rows else ['file'])
    wr.writeheader(); wr.writerows(rows)
try:
    font = ImageFont.truetype('arial.ttf', 26)
except OSError:
    font = ImageFont.load_default()
for i in range(0, len(thumbs), 4):
    group = thumbs[i:i + 4]
    cw, ch = 900, max(t.height for _, t in group) + 40
    sheet = Image.new('RGB', (cw * 2 + 10, ch * 2 + 10), (40, 40, 40))
    for j, (name, t) in enumerate(group):
        x, y = (j % 2) * (cw + 10), (j // 2) * (ch + 10)
        sheet.paste(t, (x, y + 40))
        ImageDraw.Draw(sheet).text((x + 8, y + 6), name, fill=(255, 230, 120), font=font)
    sheet.save(os.path.join(dst, f'sheet_{i // 4 + 1:02d}.jpg'), quality=88)
for r in rows:
    print(r)
