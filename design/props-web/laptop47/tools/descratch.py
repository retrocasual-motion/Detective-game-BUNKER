# descratch.py — ослабить светлые царапины генератора на гранях (автор 26.11: «царапины меньше заметными,
# более слабыми»). Паспорт износа — «мелкие потёртости», а Nano Banana нарисовал заметные светлые линии.
# Царапина = тонкая светлая вытянутая деталь: белый top-hat яркости, затем только вытянутые пятна.
# Там цвет, нормали и шероховатость сводятся к фону на KEEP (останется 1−KEEP силы).
# Запуск из папки страницы:  python tools/descratch.py lid bottom [deck]
# Исходники сохраняются один раз как *_orig.* и каждый прогон идёт от них.
import os, sys, shutil
import numpy as np
import cv2

SRC = 'textures/pbr/'
KEEP = 0.78          # насколько убрать царапину (0 — оставить как есть, 1 — убрать совсем)

def orig(name):
    p = SRC + name
    b, e = os.path.splitext(p)
    o = b + '_orig' + e
    if not os.path.exists(o): shutil.copyfile(p, o)
    return o

def scratch_mask(L, px_mm):
    k = max(5, int(1.4 * px_mm) | 1)                       # шире царапины (~1,4 мм)
    se = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    th = L - cv2.morphologyEx(L, cv2.MORPH_OPEN, se)       # светлое и тонкое
    thr = max(3.0, float(np.percentile(th, 93)))
    m = (th > thr).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    keep = np.zeros(n, bool)
    ys, xs = np.nonzero(lab)
    ids = lab[ys, xs]
    order = np.argsort(ids); ys, xs, ids = ys[order], xs[order], ids[order]
    bounds = np.searchsorted(ids, np.arange(n + 1))
    for i in range(1, n):
        a = st[i, cv2.CC_STAT_AREA]
        if a < 6: continue
        y_, x_ = ys[bounds[i]:bounds[i + 1]].astype(np.float32), xs[bounds[i]:bounds[i + 1]].astype(np.float32)
        c = np.cov(np.vstack([x_, y_]))
        ev = np.sort(np.linalg.eigvalsh(c))
        length = 4 * np.sqrt(max(ev[1], 1e-6)); width = 4 * np.sqrt(max(ev[0], 1e-6))
        if length >= 2.0 * px_mm and length / max(width, 1.0) > 4.0:   # длинная тонкая линия
            keep[i] = True
    mk = keep[lab].astype(np.float32)
    mk = cv2.dilate(mk, np.ones((5, 5), np.uint8))
    strength = cv2.dilate(np.clip(th / 7.0, 0, 1), np.ones((3, 3), np.uint8))
    strength = np.clip(th / 7.0, 0, 1)
    return cv2.GaussianBlur(np.maximum(mk * strength, 0), (0, 0), 0.8), th

for face in sys.argv[1:]:
    a = cv2.imread(orig(face + '_albedo.jpg')).astype(np.float32)
    n = cv2.imread(orig(face + '_normal.jpg')).astype(np.float32)
    r = cv2.imread(orig(face + '_rough.jpg'), cv2.IMREAD_GRAYSCALE).astype(np.float32)
    px_mm = a.shape[1] / 335.0
    L = cv2.cvtColor(a.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
    m, _ = scratch_mask(L, px_mm)
    w = (m * KEEP)[..., None]
    k = max(5, int(1.4 * px_mm) | 1)
    se = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    bg_a = cv2.GaussianBlur(cv2.morphologyEx(a, cv2.MORPH_OPEN, se), (0, 0), 1.0)
    a2 = a * (1 - w) + bg_a * w
    flat = np.array([255, 128, 128], np.float32)            # BGR (0.5, 0.5, 1)
    n2 = n * (1 - w) + flat * w
    bg_r = cv2.medianBlur(r.astype(np.uint8), k).astype(np.float32)
    r2 = r * (1 - w[..., 0]) + bg_r * w[..., 0]
    cv2.imwrite(SRC + face + '_albedo.jpg', a2, [cv2.IMWRITE_JPEG_QUALITY, 92])
    cv2.imwrite(SRC + face + '_normal.jpg', n2, [cv2.IMWRITE_JPEG_QUALITY, 92])
    cv2.imwrite(SRC + face + '_rough.jpg', r2, [cv2.IMWRITE_JPEG_QUALITY, 92])
    print(face, 'доля царапин', round(float((m > 0.2).mean()) * 100, 2), '%')
