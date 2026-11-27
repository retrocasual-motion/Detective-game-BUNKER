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
# светлые крапинки пыли на металле срезаются до фона (шлифовка тоньше и слабее — она остаётся):
# усиленные «металлом», они давали блестящую крошку вокруг кнопок
fmed = np.dstack([med8(f[..., c], 0.4) for c in range(3)])
fmet = np.minimum(f, fmed + 0.03); gm = fmet.mean(2, keepdims=True); fmet = gm + (fmet - gm) * 0.4
alb_m = np.zeros_like(f)
for region, target in ((band, 0.42), (ring, 0.74), (ear, 0.74)):
    alb_m += soft(region)[..., None] * np.clip(fmet * metal_gain(region, target), 0, 0.97)
wm = soft(band | ring | ear)[..., None]
alb = alb * (1 - wm) + alb_m
# отверстия динамика: тёмное в хромированной «пилюле» — не металл
ear_hole = soft(ear & (L < 0.55 * np.median(L[ear])), 0.05)
# пыль в щелях — мягкие серые комочки-ворсинки: только у границ деталей, без резкого края, матовые, не металл
gapzone = np.zeros(L.shape, np.float32)
for region in (pill, ring, inner, ear):
    sr = soft(region, 0.22); gapzone = np.maximum(gapzone, 1 - np.abs(2 * sr - 1))
speck = np.clip(L - med8(L, 0.4) - 0.06, 0, 1)
lint = np.clip(blur(np.clip(speck * 10, 0, 1), 0.09) * 2.2, 0, 1) * np.clip(gapzone * 1.6, 0, 1)
lint = np.clip(blur(lint, 0.05), 0, 1) * 0.7
alb = alb * (1 - lint[..., None]) + np.float32([0.205, 0.21, 0.215]) * lint[..., None]
# шероховатость
base = np.full(L.shape, 0.10, np.float32)
base[screen] = 0.13; base[pill] = 0.46; base[band] = 0.34; base[ring] = 0.14; base[ear] = 0.24; base[inner] = 0.08
base = blur(base, 0.08)
Lb = np.minimum(L, med8(L, 0.4) + 0.03)                                          # яркость без крапинок пыли
hp = Lb - blur(Lb, 0.35)
rough = base + plastic * (0.38 * scr + 0.05 * haze) + soft(band) * np.clip(hp * 3.0, -0.10, 0.14) + ear_hole * 0.6
rough = np.clip(rough * (1 - lint) + 0.95 * lint, 0.05, 1.0)
met = np.clip(wm[..., 0] - ear_hole, 0, 1) * (1 - lint)
# рельеф: шлифовка полосы, отверстия динамика, зазоры вокруг кнопок, царапины — едва
thin_dark = np.clip((med8(L, 0.5) - blur(L, 0.06)) / (med8(L, 0.5) + 0.05), 0, 1)
gap = thin_dark * soft(band | pill | ring | ear, 0.3)
h = 0.5 + soft(band) * np.clip(hp * 0.5, -0.05, 0.05) - 0.10 * blur(gap, 0.15) - 0.02 * scr * plastic
nrm = normal_from(blur(h, 0.04), 1.5)
ao = np.clip(1 - 1.6 * blur(gap, 0.12), 0.45, 1)
save_set('front', alb, nrm, np.dstack([met, rough, ao]))     # BGR: B — металл, G — шероховатость, R — AO

# ---- атлас кнопок: полоса 53 × 10 мм (91,5…101,5 мм от верха) — цвет 788 пикс/см, значки с резким краем ----
# Значки на общей карте переда (197 пикс/см) вблизи мылятся. Здесь фото увеличено вдвое, а край значка
# собран заново: маска значка (цвет трубок, яркость стрелки) с крутым переходом, цвет — средний цвет краски.
KY0, KY1 = 91.5, 101.5
r0, r1 = int(round(KY0 * PXMM)), int(round(KY1 * PXMM))
up2 = lambda a_: cv2.resize(a_, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
ka = up2(np.clip(alb[r0:r1], 0, 1)); kf = up2(f[r0:r1])                           # итоговый цвет и исходное фото
kX, kYm = up2(X[r0:r1]), up2(Y[r0:r1])
kb = np.dstack([cv2.medianBlur((np.clip(ka[..., c], 0, 1) * 255).astype(np.uint8), int(2.6 * PXMM * 2) | 1).astype(np.float32) / 255 for c in range(3)])
def icon(region, measure, t0=0.30, t1=0.52):
    d = measure(kf); d = d - np.median(d[region])
    t = d / max(float(np.percentile(d[region], 99.6)), 1e-4)
    m = np.clip((cv2.GaussianBlur(t, (0, 0), 0.8) - t0) / (t1 - t0), 0, 1); m = m * m * (3 - 2 * m)
    m *= cv2.erode(region.astype(np.uint8), np.ones((int(0.5 * PXMM * 2) | 1,) * 2, np.uint8)).astype(np.float32)   # не у самого края кнопки
    core = (t > 0.7) & region
    col = ka[core].mean(0) if core.sum() > 50 else np.array([0.8, 0.8, 0.8], np.float32)
    g_ = col.mean(); col = np.clip(g_ + (col - g_) * 1.6, 0, 1)                  # в общем цвете краска была обесцвечена — вернуть
    return m, col
kyc = 44.4 + 52                                                                    # центр ряда кнопок, мм от верха
reg_call = (np.abs(kX - 12.5) < 5.3) & (np.abs(kYm - kyc) < 2.15)
reg_end = (np.abs(kX - 40.5) < 5.3) & (np.abs(kYm - kyc) < 2.15)
reg_back = (np.abs(kX - 26.5) < 3.45) & (np.abs(kYm - kyc) < 3.45)
for region, measure in ((reg_call, lambda q: q[..., 1] - np.maximum(q[..., 0], q[..., 2])),
                        (reg_end, lambda q: q[..., 2] - np.maximum(q[..., 0], q[..., 1])),
                        (reg_back, lambda q: q.mean(2))):
    m, col = icon(region, measure)
    if region is reg_end:      # значок «питание» под красной трубкой дорисовал генератор, вблизи это клякса — убрать, остаётся трубка
        m = m * (1 - np.clip(1.6 - np.hypot(kX - 40.5, kYm - (kyc + 0.95)) / 1.0, 0, 1))
    if region is reg_back: col = np.clip(col * 1.3, 0, 0.9)   # стрелка — белая краска
    near_ = cv2.GaussianBlur(cv2.dilate((m > 0.02).astype(np.uint8), np.ones((int(0.5 * PXMM * 2) | 1,) * 2, np.uint8)).astype(np.float32), (0, 0), 2)[..., None]
    if region is reg_end:      # и сам след значка «питание» на фото закрыть чистым пластиком кнопки
        zone = np.clip(1.9 - np.hypot(kX - 40.5, kYm - (kyc + 0.95)) / 1.0, 0, 1)[..., None]
        near_ = np.maximum(near_, zone)
    ka = ka * (1 - near_) + (kb * (1 - m[..., None]) + col * m[..., None]) * near_
kn = nrm[r0:r1].copy(); ko = np.dstack([met, rough, ao])[r0:r1].copy()
zs = np.clip(1.9 - np.hypot(X[r0:r1] - 40.5, Y[r0:r1] - (kyc + 0.95)) / 1.0, 0, 1)   # след значка «питание» — и здесь
ko[..., 1] = ko[..., 1] * (1 - zs) + float(np.median(rough[pill])) * zs
kn = kn * (1 - zs[..., None]) + np.float32([0, 0, 1]) * zs[..., None]; kn /= np.linalg.norm(kn, axis=2, keepdims=True)
u8_ = lambda a_: (np.clip(a_, 0, 1) * 255).round().astype(np.uint8)
n_img_ = lambda n_: cv2.cvtColor(((n_ * 0.5 + 0.5) * 255).round().astype(np.uint8), cv2.COLOR_RGB2BGR)
cv2.imwrite(os.path.join(OUT, 'src', 'keys_albedo.png'), u8_(ka))
for d, k in (('pack', 1.0), ('pack_low', 0.5)):
    sa = (int(round(ka.shape[1] * k)), int(round(ka.shape[0] * k))); sn = (int(round(kn.shape[1] * k)), int(round(kn.shape[0] * k)))
    cv2.imwrite(os.path.join(OUT, d, 'keys_a.jpg'), cv2.resize(u8_(ka), sa, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 95])
    nn = cv2.resize(kn, sn, interpolation=cv2.INTER_AREA); nn /= np.linalg.norm(nn, axis=2, keepdims=True)
    cv2.imwrite(os.path.join(OUT, d, 'keys_n.png'), n_img_(nn)); cv2.imwrite(os.path.join(OUT, d, 'keys_orm.jpg'), cv2.resize(u8_(ko), sn, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 95])
report['keys'] = {'strip_mm': [53, KY1 - KY0], 'albedo_px': list(ka.shape[1::-1]), 'px_per_cm': round(ka.shape[0] / (KY1 - KY0) * 10)}
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

# ------------------------------------------------------------------ бока: рамка и обод
# Одна полоса на весь периметр корпуса (299,4 мм) × высоту рамки (6 мм): u — вдоль периметра от начала
# дуги правого нижнего угла (как идёт контур в phone48.js), v — снизу (шов крышки) вверх (шов обода).
# Фото боков не генерировались (бок 12 мм, полоса 9:1 генератору не даётся): износ собран здесь —
# матовость литого пластика, продольные потёртости от кармана и стола, затёртые углы, пыль в швах,
# плюс волосяные потёртости с фото переда. Общий износ, без сколов и особых примет.
rs = np.random.RandomState(4812)
SW, SH = 4096, 128; PERIM = 2 * (53 - 17) + 2 * (104 - 17) + 2 * np.pi * 8.5; SMM = 6.0
su = (np.arange(SW, dtype=np.float32) + 0.5) / SW * PERIM; sv = (np.arange(SH, dtype=np.float32) + 0.5) / SH * SMM
arc = np.pi * 8.5 / 2; corners = [arc / 2, arc + 36 + arc / 2, 2 * arc + 36 + 87 + arc / 2, 3 * arc + 72 + 87 + arc / 2]
def wrapd(a_, b_): d_ = np.abs(a_ - b_); return np.minimum(d_, PERIM - d_)
corner = np.zeros(SW, np.float32)
for c_ in corners: corner = np.maximum(corner, np.exp(-(wrapd(su, c_) / 7.0) ** 2))
corner = corner[None, :] * np.ones((SH, 1), np.float32)
streak = np.zeros((SH, SW * 3), np.float32)                                        # три периода: линии переходят через шов полосы
for i in range(300):
    x0 = rs.uniform(0, SW); keep = rs.uniform() < 0.35 + 0.65 * corner[0, int(x0) % SW]
    if not keep: continue
    ln = rs.uniform(3, 28) / PERIM * SW; y0 = rs.uniform(0, SH); dy = rs.normal(0, 3.0)
    for k in (0, 1, 2): cv2.line(streak, (int(x0 + k * SW), int(y0)), (int(x0 + ln + k * SW), int(y0 + dy)), float(rs.uniform(0.25, 1.0)), 1, cv2.LINE_AA)
streak = streak[:, SW:2 * SW]
mx_, my_ = np.meshgrid(su * (1024 / 30.0) % 1024, sv * (1024 / 30.0) % 1024)
hair = cv2.remap(ts.astype(np.float32), mx_.astype(np.float32), my_.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
grain = cv2.GaussianBlur(rs.normal(0, 1, (SH, SW)).astype(np.float32), (0, 0), 0.8)
cloud = cv2.resize(cv2.GaussianBlur(rs.normal(0, 1, (8, 256)).astype(np.float32), (0, 0), 1.5), (SW, SH), interpolation=cv2.INTER_CUBIC); cloud /= np.abs(cloud).max()
dv = np.minimum(sv, SMM - sv)[:, None]                                             # мм до ближайшего шва
dust_line = cv2.resize(np.clip(rs.normal(0.55, 0.5, (1, 700)), 0, 1).astype(np.float32), (SW, 1), interpolation=cv2.INTER_CUBIC)
dust = np.clip(1 - dv / 0.32, 0, 1) ** 1.5 * np.clip(dust_line + 0.25 * corner[:1], 0, 1) * np.clip(0.6 + 0.6 * grain, 0, 1)
s_rough = 0.21 + 0.035 * grain + 0.05 * cloud + 0.10 * corner + 0.16 * streak + 0.22 * hair
s_rough = np.clip(s_rough * (1 - dust) + 0.95 * dust, 0.08, 1)
s_alb = 0.050 + 0.004 * grain + 0.014 * streak + 0.012 * corner + 0.02 * hair
s_alb = np.clip(s_alb * (1 - dust) + 0.17 * dust, 0, 1)
s_ao = np.clip(1 - 0.35 * np.clip(1 - dv / 0.18, 0, 1), 0, 1) * np.ones((1, SW), np.float32)
s_n = normal_from(0.5 - 0.014 * streak - 0.012 * hair + 0.006 * grain, 1.6)
for d, k in (('pack', 1), ('pack_low', 2)):
    size = (SW // k, SH // k)
    al3 = np.dstack([s_alb * 1.06, s_alb, s_alb])                                  # чуть холодный чёрный, как спинка
    cv2.imwrite(os.path.join(OUT, d, 'side_a.jpg'), cv2.resize((np.clip(al3, 0, 1) * 255).round().astype(np.uint8), size, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 95])
    cv2.imwrite(os.path.join(OUT, d, 'side_orm.jpg'), cv2.resize((np.dstack([np.zeros_like(s_rough), s_rough, s_ao]) * 255).round().astype(np.uint8), size, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 95])
    nn = cv2.resize(s_n, size, interpolation=cv2.INTER_AREA); nn /= np.linalg.norm(nn, axis=2, keepdims=True)
    cv2.imwrite(os.path.join(OUT, d, 'side_n.png'), cv2.cvtColor(((nn * 0.5 + 0.5) * 255).round().astype(np.uint8), cv2.COLOR_RGB2BGR))
report['side'] = {'perimeter_mm': round(float(PERIM), 2), 'px': [SW, SH], 'px_per_cm_along': round(SW / PERIM * 10), 'px_per_cm_across': round(SH / SMM * 10)}

# ------------------------------------------------------------------ боковые кнопки и заглушка
# Одна маленькая карта на верх любой боковой кнопки (u — вдоль, v — поперёк): середина залоснена пальцами,
# края матовые, по самому краю — мягкая серая пыль; редкие волосяные потёртости с фото.
KW, KH, KLEN, KHGT = 512, 128, 10.0, 2.5
ku = (np.arange(KW, dtype=np.float32) + 0.5) / KW; kv = (np.arange(KH, dtype=np.float32) + 0.5) / KH
e_mm = np.minimum(np.minimum(ku, 1 - ku)[None, :] * KLEN, np.minimum(kv, 1 - kv)[:, None] * KHGT)
k_grain = cv2.GaussianBlur(rs.normal(0, 1, (KH, KW)).astype(np.float32), (0, 0), 1.0)
k_cloud = cv2.resize(cv2.GaussianBlur(rs.normal(0, 1, (6, 24)).astype(np.float32), (0, 0), 1.2), (KW, KH), interpolation=cv2.INTER_CUBIC); k_cloud /= np.abs(k_cloud).max()
pol = np.clip((e_mm - 0.25) / 0.8, 0, 1); pol = pol * pol * (3 - 2 * pol) * (0.7 + 0.3 * k_cloud)
kmx, kmy = np.meshgrid(ku * KLEN * (1024 / 30.0) + 300, kv * KHGT * (1024 / 30.0) + 500)
k_hair = cv2.remap(ts.astype(np.float32), kmx.astype(np.float32) % 1024, kmy.astype(np.float32) % 1024, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
k_dust = np.clip(1 - e_mm / 0.22, 0, 1) ** 1.3 * np.clip(0.45 + 0.9 * cv2.GaussianBlur(rs.normal(0, 1, (KH, KW)).astype(np.float32), (0, 0), 3.0), 0, 1)
k_rough = np.clip((0.36 - 0.15 * pol + 0.03 * k_grain + 0.20 * k_hair) * (1 - k_dust) + 0.95 * k_dust, 0.08, 1)
k_alb = np.clip((0.046 + 0.004 * k_grain + 0.02 * k_hair) * (1 - k_dust) + 0.19 * k_dust, 0, 1)
k_ao = np.clip(1 - 0.35 * np.clip(1 - e_mm / 0.15, 0, 1), 0, 1)
for d, k in (('pack', 1), ('pack_low', 2)):
    size = (KW // k, KH // k)
    cv2.imwrite(os.path.join(OUT, d, 'skey_a.jpg'), cv2.resize((np.dstack([k_alb * 1.06, k_alb, k_alb]).clip(0, 1) * 255).round().astype(np.uint8), size, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 95])
    cv2.imwrite(os.path.join(OUT, d, 'skey_orm.jpg'), cv2.resize((np.dstack([np.zeros_like(k_rough), k_rough, k_ao]) * 255).round().astype(np.uint8), size, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 95])

# ------------------------------------------------------------------ ярлык бюро (вёрстка tools/label_make.html)
if os.path.exists(os.path.join(OUT, 'src', 'label_albedo.png')):
    for d, ka_, kn_ in (('pack', 1.0, 0.5), ('pack_low', 0.5, 0.25)):
        for nm, k_, ext, q in (('albedo', ka_, 'a.jpg', 94), ('normal', kn_, 'n.png', 0), ('rough', kn_, 'r.jpg', 92)):
            im = cv2.imread(os.path.join(OUT, 'src', f'label_{nm}.png'))
            im = cv2.resize(im, None, fx=k_, fy=k_, interpolation=cv2.INTER_AREA) if k_ != 1 else im
            cv2.imwrite(os.path.join(OUT, d, 'label_' + ext), im, [cv2.IMWRITE_JPEG_QUALITY, q] if q else [])
    report['label'] = {'mm': [40, 22.86], 'px_per_cm_full': 385}

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
fp = np.minimum(f, np.dstack([med8(f[..., c], 0.4) for c in range(3)]) + 0.06)        # крапинки пыли на накладке — не блёстки
gp = fp.mean(2, keepdims=True); fp = gp + (fp - gp) * 0.35
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
