# make_maps.py — PBR-карты телефона 48 из фото GEN20 (kie.ai, Nano Banana Pro).
#
# Вход (папка gen20):  T1_front.png, T2_back.png — фото граней строго в лоб, ровный свет, серый фон;
#                      layout/L_front.png, L_back.png — ортовиды модели (ortho.html, кадр 1152×2048, поля m=1.18);
#                      masks/proc_{front,back}_{A,O,H}.png — холсты процедурного рисунка модели (tools/export_masks.py):
#                      по ним берутся области (металл, экран, полоса кнопок, накладка камеры) и узор спинки.
# Выход (папка карт):  src/{face}_{albedo,normal,orm}.png  — 2087×4096 (≈ 394 пикс/см), исходники;
#                      pack/      — 1044×2048 (≈ 197 пикс/см): {face}_a.jpg, {face}_n.png, {face}_orm.jpg, tile_n.png, tile_orm.jpg;
#                      pack_low/  —  522×1024 (≈  98 пикс/см): то же.
#   ORM: R — AO, G — шероховатость, B — металл.
#
# Что берётся с фото, а что — нет:
#   • цвет: с фото (царапины из цвета убраны медианой — они уходят в шероховатость); металл осветлён до F0;
#   • шероховатость: основа по области + волосяные потёртости и отпечатки с фото (отпечатки ослаблены —
#     ни одного чёткого пятна на экране: пятно на месте цифры было бы подсказкой PIN);
#   • нормали: шлифовка металла и отверстия динамика — с фото; узор спинки — рисунок модели (ровная сетка 1 мм);
#   • на спинке фото несёт призрак чужого логотипа (слева внизу) — участок заменён соседним пластиком.
#
# Запуск:  python tools/make_maps.py <gen20> <textures/pbr>
import sys, os, json
import numpy as np
import cv2

GEN, OUT = sys.argv[1], sys.argv[2]
for d in ('src', 'pack', 'pack_low'): os.makedirs(os.path.join(OUT, d), exist_ok=True)
MAP_H = 4096
MAP_W = int(round(MAP_H * 53 / 104))        # 2087 — как у холстов модели
PXMM = MAP_H / 104.0                         # 39,4 пикс/мм
LAY_W, LAY_H, MARGIN = 1152, 2048, 1.18

def lum(img): return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
def blur(a, mm): return cv2.GaussianBlur(a, (0, 0), max(0.5, mm * PXMM))
def med8(a, mm):
    k = max(3, int(mm * PXMM) | 1)
    return cv2.medianBlur(np.clip(a * 255, 0, 255).astype(np.uint8), k).astype(np.float32) / 255.0

def object_bbox(img, bg_tol=18):
    h, w = img.shape[:2]
    edge = np.concatenate([img[:8].reshape(-1, 3), img[-8:].reshape(-1, 3), img[:, :8].reshape(-1, 3), img[:, -8:].reshape(-1, 3)])
    bg = np.median(edge, 0)
    d = np.abs(img.astype(np.int16) - bg.astype(np.int16)).max(2)
    m = (d > bg_tol).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((41, 41), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    return st[i, :4]

def align(photo, layout):
    """Фото → кадр ортовида (в масштабе карты): рамка вещи на рамку вещи, затем ECC по краям; вырезать корпус 53×104."""
    k = MAP_H / (LAY_H / MARGIN)                       # ортовид → масштаб карты (корпус 104 мм = MAP_H)
    W, H = int(round(LAY_W * k)), int(round(LAY_H * k))
    lay = cv2.resize(layout, (W, H), interpolation=cv2.INTER_CUBIC)
    lx, ly, lw, lh = object_bbox(lay); px, py, pw, ph = object_bbox(photo, 45)   # порог выше: мягкая тень под вещью — не вещь
    if ph > pw * lh / lw * 1.015: ph = int(round(pw * lh / lw))      # тень под вещью удлинила рамку: ширина надёжна, верх надёжен
    sx, sy = lw / pw, lh / ph
    M = np.float32([[sx, 0, lx - px * sx], [0, sy, ly - py * sy]])
    warped = cv2.warpAffine(photo, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    def edges(im):
        g = cv2.GaussianBlur(lum(im), (0, 0), 3.0)
        gx, gy = cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1)
        e = np.sqrt(gx * gx + gy * gy); return e / (e.max() + 1e-6)
    warp = np.eye(2, 3, dtype=np.float32); score = None
    try:
        small = 0.25
        a = cv2.resize(edges(lay), None, fx=small, fy=small); b = cv2.resize(edges(warped), None, fx=small, fy=small)
        score, warp = cv2.findTransformECC(a, b, warp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), None, 5)
        warp[:, 2] /= small
        if abs(warp[0, 0] - 1) > 0.04 or abs(warp[1, 1] - 1) > 0.04 or np.abs(warp[:, 2]).max() > 0.03 * W:
            warp = np.eye(2, 3, dtype=np.float32); score = None
        else:
            warped = cv2.warpAffine(warped, warp, (W, H), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    except cv2.error:
        score = None
    x0, y0 = int(round(W / 2 - MAP_W / 2)), int(round(H / 2 - MAP_H / 2))
    info = {'bbox_photo': [int(v) for v in (px, py, pw, ph)], 'bbox_layout': [int(v) for v in (lx, ly, lw, lh)],
            'photo_px_per_mm': round(float(ph) / 104.0, 1), 'ecc': None if score is None else round(float(score), 4), 'ecc_warp': warp.round(4).tolist()}
    return warped[y0:y0 + MAP_H, x0:x0 + MAP_W], lay[y0:y0 + MAP_H, x0:x0 + MAP_W], info

def normal_from(h, strength):
    gx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3) * strength
    gy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3) * strength
    n = np.dstack([-gx, gy, np.ones_like(h)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n

def seamless(f):
    h, w = f.shape[:2]
    def ramp(n):
        t = np.arange(n, dtype=np.float32) / (n - 1); return np.clip(np.sin(np.pi * t) * 1.6, 0, 1)
    wx = ramp(w)[None, :]; wy = ramp(h)[:, None]
    f = f * wx + np.roll(f, w // 2, 1) * (1 - wx)
    return f * wy + np.roll(f, h // 2, 0) * (1 - wy)

def mm_grid():
    ys, xs = np.mgrid[0:MAP_H, 0:MAP_W].astype(np.float32)
    return (xs + 0.5) / PXMM, (ys + 0.5) / PXMM          # мм от левого и верхнего края карты

def wear(L, scr_floor, haze_gain):
    """Потёртости с фото: тонкие светлые линии и крапинки (scr) и крупные матовые пятна (haze), 0..1."""
    Lm = med8(L, 0.8)
    scr = np.clip(L - Lm - scr_floor, 0, 1)
    scr = np.clip(scr / 0.16, 0, 1) ** 0.8                 # и слабая царапина заметна, и яркая крапинка не «горит»
    haze = np.clip((blur(Lm, 1.5) - blur(Lm, 14.0)) * haze_gain, 0, 1)
    return scr, haze, Lm

def save_set(face, alb, nrm, orm):
    """alb, orm — float 0..1 BGR-порядок каналов как у OpenCV; nrm — единичные нормали (x, y, z)."""
    def n_img(n): return cv2.cvtColor(((n * 0.5 + 0.5) * 255).round().astype(np.uint8), cv2.COLOR_RGB2BGR)
    u8 = lambda a: (np.clip(a, 0, 1) * 255).round().astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, 'src', f'{face}_albedo.png'), u8(alb))
    cv2.imwrite(os.path.join(OUT, 'src', f'{face}_normal.png'), n_img(nrm))
    cv2.imwrite(os.path.join(OUT, 'src', f'{face}_orm.png'), u8(orm))
    sets = [('pack', 2048), ('pack_low', 1024)] + ([('pack_ultra', 4096)] if os.environ.get('PHONE48_ULTRA') else [])   # ultra — только для замера резкости
    for d, hh in sets:
        os.makedirs(os.path.join(OUT, d), exist_ok=True)
        size = (int(round(hh * 53 / 104)), hh)
        a = cv2.resize(u8(alb), size, interpolation=cv2.INTER_AREA)
        o = cv2.resize(u8(orm), size, interpolation=cv2.INTER_AREA)
        n = cv2.resize(nrm, size, interpolation=cv2.INTER_AREA); n /= np.linalg.norm(n, axis=2, keepdims=True)
        cv2.imwrite(os.path.join(OUT, d, f'{face}_a.jpg'), a, [cv2.IMWRITE_JPEG_QUALITY, 94])
        cv2.imwrite(os.path.join(OUT, d, f'{face}_orm.jpg'), o, [cv2.IMWRITE_JPEG_QUALITY, 95])
        cv2.imwrite(os.path.join(OUT, d, f'{face}_n.png'), n_img(n), [cv2.IMWRITE_PNG_COMPRESSION, 9])

def masks(face):
    O = cv2.imread(os.path.join(GEN, 'masks', f'proc_{face}_O.png'))          # B — металл, G — шероховатость, R — AO
    H = cv2.imread(os.path.join(GEN, 'masks', f'proc_{face}_H.png'), cv2.IMREAD_GRAYSCALE)
    assert O.shape[:2] == (MAP_H, MAP_W), O.shape
    return O[..., 0].astype(np.int16), O[..., 1].astype(np.int16), H.astype(np.int16)   # metal(B), rough(G), height

def soft(m, mm=0.12): return blur(m.astype(np.float32), mm)
report = {}
X, Y = mm_grid()

# ------------------------------------------------------------------ перед
photo = cv2.imread(os.path.join(GEN, 'T1_front.png')); layout = cv2.imread(os.path.join(GEN, 'layout', 'L_front.png'))
al, lay, info = align(photo, layout); report['front'] = info
cv2.imwrite(os.path.join(OUT, 'src', '_check_front.jpg'), cv2.resize(cv2.addWeighted(al, 0.6, lay, 0.4, 0), (MAP_W // 2, MAP_H // 2)), [cv2.IMWRITE_JPEG_QUALITY, 85])
cv2.imwrite(os.path.join(OUT, 'src', '_aligned_front.jpg'), al, [cv2.IMWRITE_JPEG_QUALITY, 92])
mB, mG, mH = masks('front')
near = lambda v, t: np.abs(mG - round(t * 255)) <= 4
metal = mB > 128
band = metal & near(0, 0.36); pill = metal & near(0, 0.30); ring = metal & near(0, 0.12)
ear = metal & (Y < 12) & (X > 10) & (X < 43) & (np.abs(mG - 56) <= 4)
screen = (~metal) & near(0, 0.14); panel = (~metal) & ~screen
inner = (~metal) & (Y > 92) & (X > 20) & (X < 33)                                 # глянцевая вставка средней кнопки
f = al.astype(np.float32) / 255.0; L = lum(al)
scr, haze, Lm = wear(L, 0.022, 9.0)
plastic = soft(panel | screen | pill)
# цвет: пластик — фото без царапин, чуть темнее; царапины слегка светлее; металл — осветлён до F0
fm = np.dstack([med8(f[..., c], 0.5) for c in range(3)])
g = fm.mean(2, keepdims=True); fm = g + (fm - g) * 0.55                           # генератор тонирует чёрный пластик — ближе к нейтральному
# отпечатки и разводы в цвет не идут: на экране не должно быть ни одного пятна «на месте цифры» (PIN — E22)
for region in (panel, screen, pill):
    c = np.median(fm[region], 0); w_ = soft(region)[..., None]
    fm = fm * (1 - w_) + (c + (fm - c) * np.where(region is pill, 1.0, 0.22)) * w_
alb = fm * 0.82 + 0.12 * scr[..., None]
def metal_gain(region, target):
    v = float(np.median(L[region])); return target / max(v, 1e-3)
fmet = f.copy(); gm = fmet.mean(2, keepdims=True); fmet = gm + (fmet - gm) * 0.4
alb_m = np.zeros_like(f)
for region, target in ((band, 0.42), (ring, 0.74), (ear, 0.74)):
    alb_m += soft(region)[..., None] * np.clip(fmet * metal_gain(region, target), 0, 0.97)
wm = soft(band | ring | ear)[..., None]
alb = alb * (1 - wm) + alb_m
# отверстия динамика: тёмное в хромированной «пилюле» — не металл
ear_hole = soft(ear & (L < 0.55 * np.median(L[ear])), 0.05)
# шероховатость
base = np.full(L.shape, 0.10, np.float32)
base[screen] = 0.13; base[pill] = 0.46; base[band] = 0.34; base[ring] = 0.14; base[ear] = 0.24; base[inner] = 0.08
base = blur(base, 0.08)
hp = L - blur(L, 0.35)
rough = base + plastic * (0.38 * scr + 0.05 * haze) + soft(band) * np.clip(hp * 3.0, -0.10, 0.14) + ear_hole * 0.6
rough = np.clip(rough, 0.05, 1.0)
met = np.clip(wm[..., 0] - ear_hole, 0, 1)
# рельеф: шлифовка полосы, отверстия динамика, зазоры вокруг кнопок, царапины — едва
thin_dark = np.clip((med8(L, 0.5) - blur(L, 0.06)) / (med8(L, 0.5) + 0.05), 0, 1)
gap = thin_dark * soft(band | pill | ring | ear, 0.3)
h = 0.5 + soft(band) * np.clip(hp * 0.5, -0.05, 0.05) - 0.14 * blur(gap, 0.08) - 0.02 * scr * plastic
nrm = normal_from(blur(h, 0.04), 1.5)
ao = np.clip(1 - 1.6 * blur(gap, 0.12), 0.45, 1)
save_set('front', alb, nrm, np.dstack([met, rough, ao]))     # BGR: B — металл, G — шероховатость, R — AO
report['front'].update({'scr_cover_%': round(float((scr > 0.3).mean() * 100), 2), 'haze_max': round(float(haze.max()), 3),
                        'rough_screen_p50_p95': [round(float(np.percentile(rough[screen], q)), 3) for q in (50, 95)]})

# плитка «общего» глянцевого пластика (рамка, обод): потёртости с середины экрана, 30 × 30 мм
t0 = (int(11.5 * PXMM), int(37 * PXMM)); n = int(30 * PXMM)
ts = cv2.resize(scr[t0[1]:t0[1] + n, t0[0]:t0[0] + n], (1024, 1024), interpolation=cv2.INTER_AREA)
th = cv2.resize(haze[t0[1]:t0[1] + n, t0[0]:t0[0] + n], (1024, 1024), interpolation=cv2.INTER_AREA)
ts, th = seamless(ts), seamless(th)
t_rough = np.clip(0.12 + 0.50 * ts + 0.14 * th, 0, 1)
t_n = normal_from(0.5 - 0.03 * ts, 2.0)
for d, s in (('pack', 1024), ('pack_low', 512)):
    o = cv2.resize(np.dstack([np.zeros_like(t_rough), t_rough, np.ones_like(t_rough)]), (s, s), interpolation=cv2.INTER_AREA)
    nn = cv2.resize(t_n, (s, s), interpolation=cv2.INTER_AREA); nn /= np.linalg.norm(nn, axis=2, keepdims=True)
    cv2.imwrite(os.path.join(OUT, d, 'tile_orm.jpg'), (o * 255).round().astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 95])
    cv2.imwrite(os.path.join(OUT, d, 'tile_n.png'), cv2.cvtColor(((nn * 0.5 + 0.5) * 255).round().astype(np.uint8), cv2.COLOR_RGB2BGR))

# ------------------------------------------------------------------ спинка
photo = cv2.imread(os.path.join(GEN, 'T2_back.png')); layout = cv2.imread(os.path.join(GEN, 'layout', 'L_back.png'))
al, lay, info = align(photo, layout); report['back'] = info
# призрак логотипа слева внизу: участок 4–14 × 68–93 мм заменить пластиком, лежащим на 15 мм правее
gx0, gx1, gy0, gy1, shift = 3.5, 14.0, 68.0, 93.5, 15.0
wgt = np.clip(np.minimum.reduce([(X - gx0), (gx1 - X), (Y - gy0), (gy1 - Y)]) / 1.5, 0, 1)[..., None]
al = (al * (1 - wgt) + np.roll(al, -int(round(shift * PXMM)), 1) * wgt).astype(np.uint8)
cv2.imwrite(os.path.join(OUT, 'src', '_check_back.jpg'), cv2.resize(cv2.addWeighted(al, 0.6, lay, 0.4, 0), (MAP_W // 2, MAP_H // 2)), [cv2.IMWRITE_JPEG_QUALITY, 85])
cv2.imwrite(os.path.join(OUT, 'src', '_aligned_back.jpg'), al, [cv2.IMWRITE_JPEG_QUALITY, 92])
mB, mG, mH = masks('back')
plate = (mB > 128) & (np.abs(mG - 77) <= 4)
mirror = (mB > 128) & (mG < 20)
lens = (mB < 128) & (mG < 25)
pat = (mH > 0x80) & (mH < 0x98)                                                    # квадратики узора
cover = ~(plate | mirror | lens)
f = al.astype(np.float32) / 255.0; L = lum(al)
scr, haze, Lm = wear(L, 0.035, 5.0)
scr *= 0.4                                                                         # паспорт: общий износ, без ярких царапин
cv_ = soft(cover)
pat_s = blur(pat.astype(np.float32), 0.03)
# кромка крышки затёрта руками: 0 в середине, 1 у самого края
edge = np.clip(1 - np.minimum.reduce([X, 53 - X, Y, 104 - Y]) / 5.0, 0, 1) ** 1.5
alb = np.full(f.shape, 0.052, np.float32) + 0.010 * pat_s[..., None] + 0.08 * scr[..., None] + 0.02 * haze[..., None]
alb[..., 0] += 0.004                                                               # чуть холодный чёрный
fp = f.copy(); gp = fp.mean(2, keepdims=True); fp = gp + (fp - gp) * 0.35
alb_p = np.clip(fp * (0.78 / max(float(np.median(L[plate])), 1e-3)), 0, 0.97)
wp = soft(plate | mirror | lens)[..., None]
alb = alb * (1 - wp) + alb_p * wp
hp = L - blur(L, 0.30)
rough = 0.11 + 0.08 * pat_s + 0.07 * edge + 0.45 * scr + 0.14 * haze
rough = rough * (1 - wp[..., 0]) + (0.36 + np.clip(hp * 2.5, -0.10, 0.12)) * wp[..., 0]
rough = np.clip(rough, 0.05, 1.0)
met = np.clip(soft(plate | mirror), 0, 1) * 0.86      # шлифованный алюминий: немного рассеянного света, чтобы в тёмной комнате читался серебристым
h = 0.5 + 0.035 * blur(pat.astype(np.float32), 0.07) * cv_ + soft(plate) * np.clip(hp * 0.6, -0.05, 0.05) - 0.012 * scr * cv_
nrm = normal_from(h, 2.0)
ao = np.ones_like(L)
save_set('back', alb, nrm, np.dstack([met, rough, ao]))
report['back'].update({'scr_cover_%': round(float((scr > 0.2).mean() * 100), 2), 'rough_cover_p50_p95': [round(float(np.percentile(rough[cover], q)), 3) for q in (50, 95)]})

report['maps'] = {'src': [MAP_W, MAP_H, round(PXMM * 10, 1)], 'pack': [1044, 2048, round(2048 / 10.4, 1)], 'pack_low': [522, 1024, round(1024 / 10.4, 1)]}
json.dump(report, open(os.path.join(OUT, '_maps_report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(report, ensure_ascii=False))
