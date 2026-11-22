"""Референс следа → «выровненный» слой библиотеки следов (ART-37).

Формат слоя (library/<вид>/<ID>[_часть].png): RGB 8 бит, бумага приведена к нейтральному уровню
NEUTRAL=200; след темнее, блик светлее (до 255 = ×1.275), цвет пятна сохраняется. В сборке слой
накладывается умножением: множитель = значение / 200. Рядом — <имя>.json: источник, режим, заметки.

Режимы:
  flat   — сгибы, заломы, мятость, картон, износ: освещение и общий тон убираются (деление на сильно
           размытую копию), остаются линии, тени и блики; по умолчанию без цвета (--color — оставить).
  stain  — пятна, скотч, клей, пожелтение: делим на цвет чистой бумаги (яркие 30 % листа), цвет и
           крупная форма пятна остаются.
  paper  — бумага-основа: убирается неровный свет, остаются цвет и волокно (это не множитель, а сама
           бумага; NEUTRAL не применяется).
--text   сначала убрать текст и тонкие линии (закрашивание окружающей бумагой); крупные залитые
         области (фото, плотные штампы) — обрезать вручную через --crop.
--crop x0,y0,x1,y1  (доли 0..1) взять часть картинки.

python -I extract_wear.py in.jpg out.png --mode flat [--text] [--crop 0,0,1,1] [--color] [--id TL-142]
"""
import argparse, json, sys
import cv2, numpy as np

NEUTRAL = 200.0


def remove_text(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    k = max(9, int(min(g.shape) / 300) | 1)
    bg = cv2.medianBlur(cv2.morphologyEx(g, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8)), 5)
    mask = ((bg.astype(int) - g.astype(int)) > 25).astype(np.uint8) * 255
    mask = cv2.dilate(mask, np.ones((5, 5), np.uint8))
    return cv2.inpaint(img, mask, 5, cv2.INPAINT_TELEA), float((mask > 0).mean())


def big_blur(a, frac):
    h, w = a.shape[:2]
    s = max(h, w) * frac
    small = cv2.resize(a, (max(8, w // 8), max(8, h // 8)), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), s / 8)
    return cv2.resize(small, (w, h), interpolation=cv2.INTER_CUBIC)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('inp'); ap.add_argument('out')
    ap.add_argument('--mode', choices=['flat', 'stain', 'paper'], required=True)
    ap.add_argument('--text', action='store_true')
    ap.add_argument('--color', action='store_true')
    ap.add_argument('--crop', default='0,0,1,1')
    ap.add_argument('--blur', type=float, default=0.08, help='flat: радиус выравнивания, доля стороны')
    ap.add_argument('--id', default='')
    ap.add_argument('--note', default='')
    a = ap.parse_args()

    img = cv2.imread(a.inp, cv2.IMREAD_COLOR)
    if img is None:
        sys.exit(f'не читается: {a.inp}')
    h, w = img.shape[:2]
    x0, y0, x1, y1 = [float(v) for v in a.crop.split(',')]
    img = img[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]
    text_share = 0.0
    if a.text:
        img, text_share = remove_text(img)
    f = img.astype(np.float32) + 1.0

    if a.mode == 'paper':
        lum = f.mean(2, keepdims=True)
        out = f / big_blur(lum, 0.15)[..., None] * float(np.median(lum))
    else:
        if a.mode == 'flat':
            ref = big_blur(f, a.blur)
            fac = f / ref
            if not a.color:
                fac = np.repeat(fac.mean(2, keepdims=True), 3, 2)
        else:  # stain
            lum = f.mean(2)
            paper = f[lum >= np.percentile(lum, 70)].reshape(-1, 3)
            fac = f / np.median(paper, 0)
        fac = fac / np.median(fac)          # чистая бумага → 1.0
        out = fac * NEUTRAL
    out = np.clip(out, 0, 255).astype(np.uint8)
    cv2.imwrite(a.out, out)
    meta = {'id': a.id, 'source': a.inp.replace('\\', '/').split('/')[-1], 'mode': a.mode,
            'crop': a.crop, 'text_removed': a.text, 'text_share': round(text_share, 4),
            'color': a.color or a.mode != 'flat', 'neutral': None if a.mode == 'paper' else NEUTRAL,
            'size': [out.shape[1], out.shape[0]], 'note': a.note}
    with open(a.out.rsplit('.', 1)[0] + '.json', 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=1)
    print(json.dumps(meta, ensure_ascii=False))


if __name__ == '__main__':
    main()
