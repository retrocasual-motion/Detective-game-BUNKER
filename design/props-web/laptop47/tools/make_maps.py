# make_maps.py — PBR-карты ноутбука 47 из фото GEN18 (kie.ai, Nano Banana Pro).
#
# Для каждой грани (фото строго в лоб, ровный свет, серый фон):
#   1) вырезать вещь по фону и выровнять по ортовиду модели (layout/L_*.jpg): bbox → точный размер → ECC (аффинно);
#   2) albedo  — снять крупные перепады света (деление на сильное размытие), привести пластик к угольному;
#   3) height  — из яркости по нескольким масштабам: тёмное = глубже (щели, решётки, порты), зерно — мелкий рельеф;
#                одна карта служит bump- и displacement-картой;
#   4) normal  — из height (OpenGL, +Y вверх — как ждёт three.js);
#   5) rough   — матовый пластик ~0.72; места, где фото светлее окружения на среднем масштабе и глаже
#                на мелком (залоснившиеся упоры, пробел, тачпад) — глаже; пыль — 1.0;
#   6) ao      — из height (впадины темнее).
# Макро-фактуры (M1–M4) делаются бесшовными (смешение со сдвинутой на полпериода копией).
#
# Запуск:  python make_maps.py <gen_dir> <out_dir> [грань ...]
#   пример GEN19:  python tools/make_maps.py <gen19> textures/pbr back front   (normal пишется .png — prep_pbr.py берёт и .png, и .jpg)
#   gen18_dir — папка с T*.png, M*.png и layout/; out_dir — куда писать карты (jpg/png).
import sys, os, json
import numpy as np
import cv2

GEN, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# грань: фото, ортовид, ширина итоговой карты. Итог — рамка вещи в ортовиде (= UV грани в модели:
# верхняя панель и дно 335×238 мм, крышка и рамка 335×226, бока — длина 238 мм × толщина закрытого);
# высота карты — по пропорции рамки. Ортовид снят окном 2048 px: canvas ниже кадра — фон страницы.
FACES = {
    'deck':   ('T1_deck.png',   'L_deck_tex.jpg',   4096),
    'lid':    ('T2_lid.png',    'L_lid_tex.jpg',    4096),
    'bottom': ('T3_bottom.png', 'L_bottom_tex.jpg', 4096),
    'bezel':  ('T4_bezel.png',  'L_bezel_tex.jpg',  2048),
    'left':   ('T5_left.png',   'L_left_tex.jpg',   4096),
    'right':  ('T6_right.png',  'L_right_tex.jpg',  4096),
    # GEN19 (финализация 26.11): зад и перед закрытого ноутбука, 2K — карта 3072 px (≈ 92 пикс/см)
    'back':   ('T7L_back.png',  'L_back_tex.jpg',   3072),   # сшивается из T7L_back + T7R_back, см. stitch_back()
    'front':  ('T8_front.png',  'L_front_tex.jpg',  3072),
}
ONLY = sys.argv[3:]          # необязательно: имена граней — тогда только они, макро-плитки не трогаются
WEB_W = 2048   # копии для страницы
MACROS = {'grain': 'M1_grain.png', 'brushed': 'M2_brushed.png', 'dust': 'M3_dust.png', 'smudge': 'M4_smudge.png'}

def lum(img):  # 0..1
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0

def object_bbox(img, bg_tol=18):
    """Рамка вещи: всё, что заметно отличается от фона (фон — медиана краёв кадра)."""
    h, w = img.shape[:2]
    edge = np.concatenate([img[:8].reshape(-1, 3), img[-8:].reshape(-1, 3), img[:, :8].reshape(-1, 3), img[:, -8:].reshape(-1, 3)])
    bg = np.median(edge, 0)
    d = np.abs(img.astype(np.int16) - bg.astype(np.int16)).max(2)
    m = (d > bg_tol).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    if n < 2: return 0, 0, w, h
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    x, y, bw, bh = st[i, :4]
    return x, y, bw, bh

def object_bbox_dark(img, k=0.5):
    """Рамка тёмной вещи на светлом фоне (GEN19: фон с градиентом и отражением — по отличию от фона не выделить)."""
    L = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (0, 0), 2)
    bg = float(np.median(np.concatenate([L[:8].ravel(), L[:, :8].ravel(), L[:, -8:].ravel()])))
    m = (L < bg * k).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((61, 61), np.uint8))   # светлые петли и гнёзда — внутрь
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    return st[i, :4]

def align(photo, layout, size, dark=False):
    """bbox фото и bbox ортовида → тот же кадр, затем ECC-аффинное уточнение по краям."""
    W, H = size
    lay = cv2.resize(layout, (W, H), interpolation=cv2.INTER_AREA)
    lx, ly, lw, lh = object_bbox(lay)
    px, py, pw, ph = object_bbox_dark(photo) if dark else object_bbox(photo)
    # фото → кадр ортовида: рамка вещи на рамку вещи
    sx, sy = lw / pw, lh / ph
    M = np.float32([[sx, 0, lx - px * sx], [0, sy, ly - py * sy]])
    warped = cv2.warpAffine(photo, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    # ECC по картам градиента (цвета у рендера и фото разные, края — общие)
    def edges(im):
        g = cv2.GaussianBlur(lum(im), (0, 0), 2.0)
        gx, gy = cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1)
        e = np.sqrt(gx * gx + gy * gy); return e / (e.max() + 1e-6)
    warp = np.eye(2, 3, dtype=np.float32)
    score = None
    try:
        crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
        small = 0.5
        a = cv2.resize(edges(lay), None, fx=small, fy=small); b = cv2.resize(edges(warped), None, fx=small, fy=small)
        score, warp = cv2.findTransformECC(a, b, warp, cv2.MOTION_AFFINE, crit, None, 5)
        warp[:, 2] /= small
        # не верить уточнению, если оно уводит далеко (ошибка совмещения)
        if abs(warp[0, 0] - 1) > 0.04 or abs(warp[1, 1] - 1) > 0.04 or np.abs(warp[:, 2]).max() > 0.03 * W:
            warp = np.eye(2, 3, dtype=np.float32); score = None
        else:
            warped = cv2.warpAffine(warped, warp, (W, H), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    except cv2.error:
        score = None
    mask = (cv2.cvtColor(lay, cv2.COLOR_BGR2GRAY) * 0).astype(np.uint8)
    x, y, w_, h_ = object_bbox(lay)
    return warped, lay, {'bbox_photo': [int(px), int(py), int(pw), int(ph)], 'bbox_layout': [int(lx), int(ly), int(lw), int(lh)],
                         'ecc': None if score is None else round(float(score), 4), 'ecc_warp': warp.round(4).tolist()}

def delight(img, sigma_frac=0.12, target=0.19):
    """Снять крупные перепады света; средняя яркость пластика → target (sRGB 0..1, угольный)."""
    f = img.astype(np.float32) / 255.0
    L = lum(img)
    s = sigma_frac * max(img.shape[:2])
    low = cv2.GaussianBlur(L, (0, 0), s) + 1e-3
    gain = (np.median(L) / low)[..., None]
    f = f * gain
    med = np.median(cv2.cvtColor((f.clip(0, 1) * 255).astype(np.uint8), cv2.COLOR_BGR2GRAY)) / 255.0
    f = f * (target / max(med, 1e-3))
    # чуть увести в нейтраль: генератор любит тёплый оттенок, лампа даст свой
    g = f.mean(2, keepdims=True); f = g + (f - g) * 0.6
    return (f.clip(0, 1) * 255).astype(np.uint8)

def close_thin(L, px_per_mm, mm=2.5):
    """Убрать узкие тёмные детали (щели между клавишами, прорези) — для оценки широких пятен."""
    k = max(3, int(mm * px_per_mm) | 1)
    return cv2.morphologyEx(L, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))

def height_from(L, px_per_mm):
    """Высота 0..1 (0.5 — плоскость): средний масштаб (щели, решётки, порты) + мелкий (зерно).
    Глубже делаются только узкие тёмные детали (щели, отверстия); широкие тёмные пятна — это
    залоснившийся пластик, а не ямы, их в рельеф не берём."""
    s_big = 6.0 * px_per_mm
    s_fine = 0.25 * px_per_mm
    Lc = close_thin(L, px_per_mm)
    base = cv2.GaussianBlur(Lc, (0, 0), s_big)
    mid = cv2.GaussianBlur(Lc, (0, 0), max(0.8, s_fine)) - base
    fine = L - cv2.GaussianBlur(L, (0, 0), max(1.0, s_fine * 2))
    h = 0.5 + 1.2 * mid + 0.6 * fine
    thin_dark = np.clip((Lc - L) / (Lc + 1e-3), 0, 1)       # щели, прорези, отверстия
    h -= 0.45 * cv2.GaussianBlur(thin_dark, (0, 0), max(0.6, 0.15 * px_per_mm))
    return np.clip(h, 0, 1)

def normal_from(h, strength):
    gx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3) * strength
    gy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3) * strength
    n = np.dstack([-gx, gy, np.ones_like(h)])   # OpenGL: +Y вверх (строки картинки идут вниз)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    rgb = ((n * 0.5 + 0.5) * 255).astype(np.uint8)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

def rough_from(L, px_per_mm, base=0.72):
    """При ровном свете залоснившийся пластик выглядит иначе, чем соседний матовый: генератор
    рисует лоск то светлее (упоры), то темнее (клавиши). Берём широкое отклонение в любую сторону
    (после удаления узких щелей) + малое зерно → глаже; пыль (светлые точки) → 1.0."""
    Lc = close_thin(L, px_per_mm)
    broad = cv2.GaussianBlur(Lc, (0, 0), 1.5 * px_per_mm)
    ref = cv2.GaussianBlur(Lc, (0, 0), 10 * px_per_mm)
    polish = np.clip(np.abs(broad - ref) * 7.0 - 0.05, 0, 1)
    hp = L - cv2.GaussianBlur(L, (0, 0), 0.6 * px_per_mm)
    var = cv2.GaussianBlur(hp * hp, (0, 0), 2.5 * px_per_mm)
    smooth = 1 - np.clip(var / (np.percentile(var, 90) + 1e-6), 0, 1)
    r = base - 0.28 * polish - 0.10 * smooth
    mean_m = cv2.GaussianBlur(L, (0, 0), 1.0 * px_per_mm)
    dust = np.clip((L - mean_m - 0.06) * 10, 0, 1)                    # светлые крапинки — пыль
    r = r + (1 - r) * dust
    return np.clip(r, 0.30, 1.0)

def ao_from(h, px_per_mm):
    occ = np.clip(cv2.GaussianBlur(h, (0, 0), 2.0 * px_per_mm) - h, 0, 1)
    return np.clip(1 - 3.0 * occ, 0.35, 1)

def seamless(img):
    """Бесшовная плитка: сначала по X, потом по Y — смешать с копией, сдвинутой на полпериода;
    вес исходника 1 в середине и 0 у краёв, шов копии приходится на середину и не виден."""
    f = img.astype(np.float32)
    h, w = f.shape[:2]
    def ramp(n):
        t = np.arange(n, dtype=np.float32) / (n - 1)
        return np.clip(np.sin(np.pi * t) * 1.6, 0, 1)
    wx = ramp(w)[None, :]; wy = ramp(h)[:, None]
    if f.ndim == 3: wx, wy = wx[..., None], wy[..., None]
    f = f * wx + np.roll(f, w // 2, 1) * (1 - wx)
    f = f * wy + np.roll(f, h // 2, 0) * (1 - wy)
    return np.clip(f, 0, 255 if img.dtype == np.uint8 else f.max()).astype(img.dtype)

def save(name, arr, q=92):
    p = os.path.join(OUT, name)
    if arr.dtype != np.uint8: arr = (np.clip(arr, 0, 1) * 255).astype(np.uint8)
    if name.endswith('.jpg'): cv2.imwrite(p, arr, [cv2.IMWRITE_JPEG_QUALITY, q])
    else: cv2.imwrite(p, arr)
    return p

def stitch_back(size):
    """Зад из двух фото-половин GEN19. Генератор не удержал масштаб (левая половина снята крупнее, у правой
    тоньше крышка), поэтому каждая половина ставится по своим меткам, снятым с фото вручную:
    по X — равномерный масштаб от угла (пикс/мм по ширине гнезда и бочонка петли), по Y — четыре опоры:
    верх бочонка петли (31,37 мм), щель крышка/база (21,5 мм), верхний шов батареи (16,7 мм), низ базы (0). Середину (крышка батареи без
    деталей) закрывает сдвинутые на 80 и 105 мм участки правого фото; стыки — плавные."""
    W, H = size
    Y_TOP, Y_BOT = 31.37, -1.04                       # кадр карты по высоте, мм (как у боков: рамка вещи в ортовиде)
    HALVES = {'L': dict(fn='T7L_back.png', x0=62.0, sx=29.0, rows=(130.0, 443.0, 611.0, 1163.0)),      # угол слева
              'R': dict(fn='T7R_back.png', x0=3099.0, sx=-19.4, rows=(379.0, 484.0, 593.0, 980.0))}    # угол справа
    xs = (np.arange(W, dtype=np.float32) + 0.5) / W * 335.0                  # мм от левого (для зрителя) края
    ys = Y_TOP - (np.arange(H, dtype=np.float32) + 0.5) / H * (Y_TOP - Y_BOT)
    def take(key, x_mm):
        h = HALVES[key]; img = cv2.imread(os.path.join(GEN, h['fn']), cv2.IMREAD_COLOR)
        k = abs(h['sx']) / (W / 335.0)                                         # во сколько раз фото крупнее карты
        if k > 1.3: img = cv2.GaussianBlur(img, (0, 0), 0.45 * k)
        yy = np.interp(-ys, [-31.37, -21.5, -16.7, 0.0], h['rows'])            # опоры: верх, щель, верхний шов батареи, низ
        yy = np.where(ys < 0, h['rows'][3] - ys * (h['rows'][3] - h['rows'][2]) / 16.7, yy)
        xm = x_mm if key == 'L' else 335.0 - x_mm
        px = h['x0'] + xm * h['sx']
        mx = np.repeat(px[None, :], H, 0).astype(np.float32); my = np.repeat(yy[:, None], W, 1).astype(np.float32)
        return cv2.remap(img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
    L, R, F, F2 = take('L', xs), take('R', xs), take('R', xs + 80.0), take('R', xs + 105.0)
    base = (ys > 3) & (ys < 13)                                                 # пластик базы под гнёздами — для выравнивания яркости
    cL = L[base][:, (xs > 70) & (xs < 100)].reshape(-1, 3).mean(0)
    cR = R[base][:, (xs > 190) & (xs < 260)].reshape(-1, 3).mean(0)
    cM = (cL + cR) / 2
    L *= cM / cL; R *= cM / cR; F *= cM / cR; F2 *= cM / cR
    ramp = lambda a, b: np.clip((xs - a) / (b - a), 0, 1)[None, :, None]
    out = L * (1 - ramp(72, 76)) + F2 * ramp(72, 76)        # сразу за левым краем крышки батареи: ступенька шва прячется у угла
    out = out * (1 - ramp(98, 112)) + F * ramp(98, 112)     # два участка одного фото — гладкий пластик, стык не виден
    out = out * (1 - ramp(176, 186)) + R * ramp(176, 186)
    return np.clip(out, 0, 255).astype(np.uint8)

report = {}
for face, (fn, lay_fn, outW) in FACES.items():
    if ONLY and face not in ONLY: continue
    src = os.path.join(GEN, fn)
    if not os.path.exists(src): report[face] = 'нет фото'; continue
    photo = cv2.imread(src, cv2.IMREAD_COLOR); layout = cv2.imread(os.path.join(GEN, 'layout', lay_fn))
    k = outW / 1923.0                      # ортовид → масштаб итоговой карты
    size = (int(round(layout.shape[1] * k)), int(round(layout.shape[0] * k)))
    if face == 'back':
        lay = cv2.resize(layout, size, interpolation=cv2.INTER_AREA)
        x, y, bw, bh = object_bbox(lay)
        W, H = outW, int(round(outW * bh / bw))
        al = stitch_back((W, H)); lay = cv2.resize(lay[y:y + bh, x:x + bw], (W, H), interpolation=cv2.INTER_AREA)
        info = {'bbox_layout': [int(x), int(y), int(bw), int(bh)], 'stitched': 'T7L_back + T7R_back'}
    else:
        al, lay, info = align(photo, layout, size, dark=face == 'front')
        x, y, bw, bh = info['bbox_layout']
        al, lay = al[y:y + bh, x:x + bw], lay[y:y + bh, x:x + bw]
        W, H = outW, int(round(outW * bh / bw))
        al = cv2.resize(al, (W, H), interpolation=cv2.INTER_AREA); lay = cv2.resize(lay, (W, H), interpolation=cv2.INTER_AREA)
    obj_mm = 238.0 if face in ('left', 'right') else 335.0
    px_mm = W / obj_mm
    info['map_size'] = [W, H]
    alb = delight(al)
    L = lum(al)
    h = height_from(L, px_mm)
    save(f'{face}_albedo.jpg', alb)
    save(f'{face}_height.png', h)
    save(f'{face}_normal.png', normal_from(h, strength=2.0))
    save(f'{face}_rough.jpg', rough_from(L, px_mm))
    save(f'{face}_ao.jpg', ao_from(h, px_mm))
    # для глаз: наложение фото на ортовид (полупрозрачно) — проверка совмещения
    save(f'_check_{face}.jpg', cv2.resize(cv2.addWeighted(al, 0.55, lay, 0.45, 0), (W // 2, H // 2)), q=80)
    info['px_per_mm'] = round(px_mm, 2); report[face] = info

for k, fn in MACROS.items():
    if ONLY: break
    src = os.path.join(GEN, fn)
    if not os.path.exists(src): report['macro_' + k] = 'нет фото'; continue
    im = cv2.imread(src)
    im = cv2.resize(im, (1024, 1024), interpolation=cv2.INTER_AREA)
    L = lum(im)
    if k == 'dust':
        a = np.clip((L - np.percentile(L, 50)) / (np.percentile(L, 99.5) - np.percentile(L, 50) + 1e-6), 0, 1)
        save('macro_dust_mask.png', seamless((a * 255).astype(np.uint8)))
    elif k == 'smudge':
        Ld = L / (cv2.GaussianBlur(L, (0, 0), 150) + 1e-3)          # снять перепад света
        hp = Ld - cv2.GaussianBlur(Ld, (0, 0), 40)
        s = np.clip(0.5 + hp * 1.2, 0, 1)          # светлее — жирнее/глаже
        save('macro_smudge.png', seamless((s * 255).astype(np.uint8)))
    else:
        px_mm = 1024 / (30.0 if k == 'grain' else 40.0)
        Lf = L - cv2.GaussianBlur(L, (0, 0), 40) + 0.5
        h = np.clip(0.5 + (Lf - 0.5) * 2.5, 0, 1)
        h = seamless((h * 255).astype(np.uint8)).astype(np.float32) / 255
        save(f'macro_{k}_height.png', h)
        save(f'macro_{k}_normal.png', normal_from(h, strength=1.5))
        save(f'macro_{k}_albedo.jpg', seamless(delight(im, sigma_frac=0.3)))
    report['macro_' + k] = 'ok'

with open(os.path.join(OUT, '_maps_report' + ('_' + '_'.join(ONLY) if ONLY else '') + '.json'), 'w', encoding='utf-8') as f:
    json.dump(report, f, ensure_ascii=False, indent=1)
print(json.dumps(report, ensure_ascii=False))
