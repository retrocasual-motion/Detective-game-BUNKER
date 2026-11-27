# make_parts.py — карты кассеты, правой, левой и верхней граней и следов на стекле окна (вторая проба L462).
#
# Вход (папка gen24):  T3_cass.png, T4_right.png, T5_left.png, T6_top.png — фото строго в лоб, ровный свет, серый фон;
#                      layout/L_cass.png, L_right.png, L_left.png, L_top.png — образцы раскладки;
#                      masks/proc_right_L.png — слой значков клавиш из рисунка модели (tools/export_masks.py).
#       (папка карт):  src/cass_ink.png — дата на полоске кассеты (вёрстка tools/label_make.html);
#                      src/_aligned_front.jpg, src/back_albedo.png — от tools/make_maps.py (запускать после него).
# Выход: pack/ и pack_low/ — cass_{a.jpg,n.png,orm.jpg} 1320×2000 (400 пикс/см), right_* 960×4693 (427 пикс/см),
#        left_* 480×2347, top_* 2560×960, glass_a.jpg (следы на стекле окна, 640×1120).
#   ORM: R — AO, G — шероховатость, B — металл.
# Правила те же, что в make_maps.py: светлые крапинки срезаны, цвет не обесцвечивается, износ мягче фото,
#   у краёв клавиш — ровный цвет клавиши, значки и дата — резким слоем вёрстки, нормали — PNG.
# Запуск:  python tools/make_parts.py <gen24> <textures/pbr>
import sys, os, json
import numpy as np
import cv2

GEN, OUT = sys.argv[1], sys.argv[2]
MARGIN = 1.18
T_MM, H_MM, W_MM = 22.5, 110.0, 60.0

def lum(img): return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
def mk(px):
    blur = lambda a, mm: cv2.GaussianBlur(a, (0, 0), max(0.5, mm * px))
    def med8(a, mm):
        k = max(3, int(mm * px) | 1); return cv2.medianBlur(np.clip(a * 255, 0, 255).astype(np.uint8), k).astype(np.float32) / 255.0
    med3 = lambda f, mm: np.dstack([med8(f[..., c], mm) for c in range(3)])
    soft = lambda m, mm=0.12: blur(m.astype(np.float32), mm)
    def wear(L, scr_floor, haze_gain):
        Lm = med8(L, 0.8); scr = np.clip(L - Lm - scr_floor, 0, 1); scr = np.clip(scr / 0.16, 0, 1) ** 0.8
        haze = np.clip((blur(Lm, 1.5) - blur(Lm, 14.0)) * haze_gain, -1, 1); return scr, haze, Lm
    return blur, med8, med3, soft, wear
u8 = lambda a: (np.clip(a, 0, 1) * 255).round().astype(np.uint8)
n_img = lambda n: cv2.cvtColor(((n * 0.5 + 0.5) * 255).round().astype(np.uint8), cv2.COLOR_RGB2BGR)
def normal_from(h, strength):
    gx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3) * strength; gy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3) * strength
    n = np.dstack([-gx, gy, np.ones_like(h)]); return n / np.linalg.norm(n, axis=2, keepdims=True)
def resize_n(n, size):
    r = cv2.resize(n, size, interpolation=cv2.INTER_AREA); return r / np.linalg.norm(r, axis=2, keepdims=True)
def object_bbox(img, bg_tol=18):
    edge = np.concatenate([img[:8].reshape(-1, 3), img[-8:].reshape(-1, 3), img[:, :8].reshape(-1, 3), img[:, -8:].reshape(-1, 3)])
    bg = np.median(edge, 0); d = np.abs(img.astype(np.int16) - bg.astype(np.int16)).max(2)
    m = (d > bg_tol).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)); m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((61, 61), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m); i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); return st[i, :4]

def align(photo, layout, wmm, hmm, px):
    """Фото → кадр образца в масштабе карты (px пикс/мм): рамка вещи на рамку вещи, затем ECC по краям; вырезать середину wmm × hmm."""
    lh0, lw0 = layout.shape[:2]
    lay_px = min(lw0 / (wmm * MARGIN), lh0 / (hmm * MARGIN)); k = px / lay_px
    W, H = int(round(lw0 * k)), int(round(lh0 * k)); mw, mh = int(round(wmm * px)), int(round(hmm * px))
    lay = cv2.resize(layout, (W, H), interpolation=cv2.INTER_CUBIC)
    lx, ly, lw, lh = object_bbox(lay); bx, by, pw, ph = object_bbox(photo, 30)
    if ph > pw * lh / lw * 1.015: ph = int(round(pw * lh / lw))
    sx, sy = lw / pw, lh / ph
    M = np.float32([[sx, 0, lx - bx * sx], [0, sy, ly - by * sy]])
    warped = cv2.warpAffine(photo, M, (W, H), flags=cv2.INTER_AREA if sx < 0.8 else cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    def edges(im):
        g = cv2.GaussianBlur(lum(im), (0, 0), 3.0); gx, gy = cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1)
        e = np.sqrt(gx * gx + gy * gy); return e / (e.max() + 1e-6)
    warp = np.eye(2, 3, dtype=np.float32); score = None
    try:
        small = 0.25
        a = cv2.resize(edges(lay), None, fx=small, fy=small); b = cv2.resize(edges(warped), None, fx=small, fy=small)
        score, warp = cv2.findTransformECC(a, b, warp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), None, 5)
        warp[:, 2] /= small
        if abs(warp[0, 0] - 1) > 0.05 or abs(warp[1, 1] - 1) > 0.05 or np.abs(warp[:, 2]).max() > 0.03 * max(W, H): warp = np.eye(2, 3, dtype=np.float32); score = None
        else: warped = cv2.warpAffine(warped, warp, (W, H), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    except cv2.error:
        score = None
    x0, y0 = int(round(W / 2 - mw / 2)), int(round(H / 2 - mh / 2))
    info = {'photo_px_per_mm': round(float(ph) / (lh / px), 1), 'ecc': None if score is None else round(float(score), 4), 'shift_mm': [round(float(warp[0, 2] / px), 2), round(float(warp[1, 2] / px), 2)]}
    return warped[y0:y0 + mh, x0:x0 + mw], lay[y0:y0 + mh, x0:x0 + mw], info

def save(name, alb, nrm, orm, low=0.5, jq=90):
    cv2.imwrite(os.path.join(OUT, 'src', f'{name}_albedo.png'), u8(alb))
    for d, k in (('pack', 1.0), ('pack_low', low)):
        size = (int(round(alb.shape[1] * k)), int(round(alb.shape[0] * k))); half = (size[0] // 2, size[1] // 2)   # нормали и ORM — вдвое реже цвета
        r = (lambda a: a) if k == 1 else (lambda a: cv2.resize(a, size, interpolation=cv2.INTER_AREA))
        cv2.imwrite(os.path.join(OUT, d, f'{name}_a.jpg'), r(u8(alb)), [cv2.IMWRITE_JPEG_QUALITY, jq])
        cv2.imwrite(os.path.join(OUT, d, f'{name}_orm.jpg'), cv2.resize(u8(orm), half, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 90])
        cv2.imwrite(os.path.join(OUT, d, f'{name}_n.png'), n_img(resize_n(nrm, half)), [cv2.IMWRITE_PNG_COMPRESSION, 9])
report = {}
grid = lambda h, w, px: ((np.mgrid[0:h, 0:w][1].astype(np.float32) + 0.5) / px, (np.mgrid[0:h, 0:w][0].astype(np.float32) + 0.5) / px)
def rr_in(X, Y, cx, cy, hw, hh, r):   # глубина внутри скруглённого прямоугольника, мм (< 0 — снаружи)
    qx = np.abs(X - cx) - (hw - r); qy = np.abs(Y - cy) - (hh - r)
    return -(np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r)
back_ref = np.median(cv2.imread(os.path.join(OUT, 'src', 'back_albedo.png')).astype(np.float32).reshape(-1, 3) / 255.0, 0)   # пластик спинки — к нему подгоняются грани
def paint_black(f, edge):   # на фото граней по краю видна полоска краски переда («шампань» GEN24) — перед теперь антрацит.
    # edge — где эта полоска: 'l' / 'r' / 'b' (левый, правый, нижний край карты, 4 мм); остальное (красная клавиша!) не трогать
    h_, w_ = f.shape[:2]; m = np.zeros((h_, w_), np.float32); n = int(4.0 * PX)
    if edge == 'l': m[:, :n] = 1
    elif edge == 'r': m[:, -n:] = 1
    else: m[-n:, :] = 1
    warm = np.clip(((f[..., 2] - f[..., 0]) - 0.05) / 0.05, 0, 1) * np.clip((f.mean(2) - 0.30) / 0.10, 0, 1) * m
    k = cv2.GaussianBlur(warm, (0, 0), 2.0)[..., None]; g = f.mean(2, keepdims=True)
    return f * (1 - k) + np.clip(g * 0.27, 0, 1) * np.array([1.03, 1.0, 0.985], np.float32) * k
def match_plastic(f, patch):
    g = back_ref / np.maximum(np.median(patch.reshape(-1, 3), 0), 1e-3); return f * np.clip(g, 0.45, 1.4), [round(float(v), 3) for v in g]

# ================================================================== кассета 33 × 50 мм
PX = 40.0; blur, med8, med3, soft, wear = mk(PX)
al, lay, info = align(cv2.imread(os.path.join(GEN, 'T3_cass.png')), cv2.imread(os.path.join(GEN, 'layout', 'L_cass.png')), 33.0, 50.0, PX)
HUBS = [(16.48, 25.0 - 11.725), (16.48, 25.0 + 11.725)]                                # центры втулок на карте, мм (как в recorder462.js)
# втулки — точно в центры модели: найти белые кольца на фото и подвинуть (сдвиг и растяжение по длине кассеты)
g8 = cv2.GaussianBlur(cv2.cvtColor(al, cv2.COLOR_BGR2GRAY), (0, 0), 0.12 * PX); found = []
for cx, cy in HUBS:
    x0, y0, s_ = int((cx - 9) * PX), int((cy - 9) * PX), int(18 * PX)
    c = cv2.HoughCircles(g8[y0:y0 + s_, x0:x0 + s_], cv2.HOUGH_GRADIENT, dp=1.5, minDist=s_, param1=90, param2=30, minRadius=int(4.3 * PX), maxRadius=int(6.6 * PX))
    found.append(None if c is None else ((x0 + c[0, 0, 0]) / PX, (y0 + c[0, 0, 1]) / PX, c[0, 0, 2] / PX))
info['hubs_found_mm'] = [None if v is None else [round(float(t), 2) for t in v] for v in found]
if all(v is not None for v in found) and all(np.hypot(v[0] - h[0], v[1] - h[1]) < 1.5 for v, h in zip(found, HUBS)):
    (ax, ay, _), (bx2, by2, _) = found; sy = (HUBS[1][1] - HUBS[0][1]) / (by2 - ay); dx = HUBS[0][0] - (ax + bx2) / 2
    Mh = np.float32([[1, 0, dx * PX], [0, sy, (HUBS[0][1] - ay * sy) * PX]])
    al = cv2.warpAffine(al, Mh, (al.shape[1], al.shape[0]), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE); info['hub_fix'] = [round(float(dx), 2), round(float(sy), 4)]
report['cass'] = info
cv2.imwrite(os.path.join(OUT, 'src', '_check_cass.jpg'), cv2.addWeighted(al, 0.6, lay, 0.4, 0), [cv2.IMWRITE_JPEG_QUALITY, 85])
f = al.astype(np.float32) / 255.0; L = lum(al); X, Y = grid(*L.shape, PX)
scr, haze, Lm = wear(L, 0.05, 4.0)
alb = np.clip(np.minimum(f, med3(f, 0.3) + 0.05), 0, 0.97)
# сквозь прозрачный корпус на фото виден серый фон; в проигрывателе за кассетой тёмный механизм — эти места темнее
ph_ = cv2.imread(os.path.join(GEN, 'T3_cass.png')); bg = np.median(np.concatenate([ph_[:8].reshape(-1, 3), ph_[-8:].reshape(-1, 3)]), 0).astype(np.float32) / 255.0
clear = soft((np.abs(med3(f, 0.25) - bg).max(2) < 0.085) & (rr_in(X, Y, 16.5, 25.0, 16.3, 24.8, 2.0) > 0), 0.10)
alb = alb * (1 - 0.62 * clear[..., None])
strip = rr_in(X, Y, 5.35, 25.0, 4.35, 21.0, 0.3)                    # бумажная полоска: X вещи −26…−17,3 → 1…9,7 мм карты
paper = np.clip(strip / 0.3, 0, 1)
dh = [np.hypot(X - cx, Y - cy) for cx, cy in HUBS]
hub = np.clip((6.5 - np.minimum(*dh)) / 0.3, 0, 1)
# дата рукой Адама — слой вёрстки на полоску
ink = cv2.imread(os.path.join(OUT, 'src', 'cass_ink.png'), cv2.IMREAD_UNCHANGED)
if ink is not None:
    x0, y0 = int(round(1.0 * PX)), int(round(4.0 * PX)); w_, h_ = int(round(8.7 * PX)), int(round(42.0 * PX))
    ik = cv2.resize(ink, (w_, h_), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0; a_ = ik[..., 3:4] * 0.92
    alb[y0:y0 + h_, x0:x0 + w_] = alb[y0:y0 + h_, x0:x0 + w_] * (1 - a_) + ik[..., :3] * a_
    inkmask = np.zeros(L.shape, np.float32); inkmask[y0:y0 + h_, x0:x0 + w_] = a_[..., 0]
else: inkmask = np.zeros(L.shape, np.float32)
Lb = np.minimum(L, med8(L, 0.3) + 0.04); hp = Lb - blur(Lb, 0.25)
rough = 0.20 + 0.30 * scr + np.clip(hp * 1.2, -0.06, 0.08)          # прозрачный корпус: гладкий, царапины матовые
rough = rough * (1 - paper) + (0.82 - 0.15 * inkmask) * paper       # бумага матовая, паста чуть блестит
rough = np.clip(rough * (1 - hub) + 0.42 * hub, 0.05, 1)
thin_dark = np.clip((med8(L, 0.4) - blur(L, 0.05)) / (med8(L, 0.4) + 0.05), 0, 1)
h = 0.5 + np.clip(hp * 0.35, -0.03, 0.03) - 0.07 * blur(thin_dark, 0.08) - 0.015 * scr - 0.02 * inkmask
ao = np.clip(1 - 1.1 * blur(thin_dark, 0.08), 0.55, 1)
save('cass', alb, normal_from(blur(h, 0.03), 1.3), np.dstack([np.zeros_like(rough), rough, ao]))

# ================================================================== правая грань 22,5 × 110 мм (клавиши)
PX = 2560 / 60.0; blur, med8, med3, soft, wear = mk(PX)
al, lay, info = align(cv2.imread(os.path.join(GEN, 'T4_right.png')), cv2.imread(os.path.join(GEN, 'layout', 'L_right.png')), T_MM, H_MM, PX); report['right'] = info
cv2.imwrite(os.path.join(OUT, 'src', '_check_right.jpg'), cv2.addWeighted(al, 0.6, lay, 0.4, 0), [cv2.IMWRITE_JPEG_QUALITY, 85])
f = paint_black(al.astype(np.float32) / 255.0, 'l'); X, Y = grid(*f.shape[:2], PX)          # X — мм от переда вещи (слева), Y — мм от верха
f, info['plastic_gain'] = match_plastic(f, f[int(80 * PX):int(104 * PX), int(15 * PX):int(20.5 * PX)])
KY = T_MM - 12.5                                                          # ось клавиш на карте, мм
pod = rr_in(X, Y, KY, 55 - 12, 6.4, 32, 3.0)
keysz = {'rec': (-37, 4.5), 'play': (-24.5, 6.5), 'stop': (-11, 4.5)}
kd = {k: rr_in(X, Y, KY, 55 + z, 4.3, hd_, 1.2) for k, (z, hd_) in keysz.items()}
sld = rr_in(X, Y, KY, 55 + 7.5, 3.1, 4.2, 1.1); post = rr_in(X, Y, KY, 55 - 49, 4.2, 3.1, 2.0)
L = lum(u8(f)); scr, haze, Lm = wear(L, 0.05, 4.0)
alb = np.clip(np.minimum(f, med3(f, 0.3) + 0.04), 0, 0.97)
# Замечание автора 27.11: прозрачные клавиши (пуск, стоп) слишком грязные — чище и читаемее; красная рядом с ними самая чистая — её чуть загрязнить.
# Красная: глубже и насыщеннее (тональная кривая уводит яркий красный в розовый), плюс грязь у краёв, мелкие царапины и затёртая середина.
wk = soft(kd['rec'] > 0, 0.1)[..., None]; g_ = alb.mean(2, keepdims=True); alb = alb * (1 - wk) + np.clip((g_ + (alb - g_) * 1.45) * 0.70, 0, 1) * wk
rs = np.random.RandomState(4624); nz1 = cv2.GaussianBlur(rs.uniform(0, 1, L.shape).astype(np.float32), (0, 0), 0.35 * PX); nz1 = np.clip((nz1 - nz1.mean()) / (nz1.std() + 1e-6) * 0.5 + 0.5, 0, 1)
pscr = np.roll(scr, int(round((keysz['rec'][0] - 30.0) * PX)), axis=0)                 # царапины с гладкого пластика ниже клавиш — те же по характеру
grime = np.clip(1 - kd['rec'] / 1.1, 0, 1) ** 1.6 * (0.35 + 0.65 * nz1) * (kd['rec'] > 0)
rub = np.clip(kd['rec'] / 2.5, 0, 1) * (0.5 + 0.5 * nz1)                               # середину трут пальцем: чуть светлее и глаже
wr_ = (kd['rec'] > 0).astype(np.float32)
alb = alb * (1 - 0.34 * grime[..., None]) + (0.10 * pscr * wr_ + 0.025 * rub * wr_)[..., None]
# Прозрачные: светлые царапины, крапинки и муть срезаны до ровного пластика (тёмные литые рёбра остаются), сама клавиша темнее — не молочная.
for k in ('play', 'stop'):
    wk = soft(kd[k] > 0.15, 0.1)[..., None]; clean = np.minimum(alb, med3(alb, 0.9) + 0.004); clean = med3(clean, 0.12)
    alb = alb * (1 - wk) + clean * 0.72 * wk
gapw = soft((pod > 0.2) & (np.minimum.reduce([-kd['rec'], -kd['play'], -kd['stop'], -sld]) > 0), 0.1)[..., None]   # гнездо между клавишами: пыли в щелях меньше
alb = alb * (1 - 0.6 * gapw) + np.minimum(alb, med3(alb, 0.5) + 0.02) * 0.6 * gapw
for d_ in list(kd.values()) + [sld, post]:                                # у края каждой клавиши — её ровный цвет
    w_ = (np.clip(1 - d_ / 0.45, 0, 1) * (d_ > -0.05))[..., None]; core = d_ > 0.9
    if core.any(): alb = alb * (1 - w_) + np.median(alb[core].reshape(-1, 3), 0) * w_
Lb = np.minimum(L, med8(L, 0.3) + 0.04); hp = Lb - blur(Lb, 0.25)
rough = 0.50 + 0.18 * scr + np.clip(hp * 1.5, -0.06, 0.08) - 0.10 * np.clip(haze, 0, 1)
wpod = soft(pod > 0, 0.15); rough = rough * (1 - wpod) + (0.20 + 0.30 * scr + np.clip(hp, -0.04, 0.05)) * wpod     # глянцевое гнездо
for k, base, ks in (('rec', 0.36, 0.0), ('play', 0.12, 0.08), ('stop', 0.12, 0.08)):
    wk = soft(kd[k] > 0, 0.12); rough = rough * (1 - wk) + (base + ks * scr + np.clip(hp, -0.03, 0.05)) * wk
rough = rough + wr_ * (0.22 * pscr + 0.25 * grime - 0.08 * rub)
for d_, base in ((sld, 0.5), (post, 0.5)): wk = soft(d_ > 0, 0.12); rough = rough * (1 - wk) + (base + 0.2 * scr) * wk
thin_dark = np.clip((med8(L, 0.5) - blur(L, 0.06)) / (med8(L, 0.5) + 0.05), 0, 1)
h = 0.5 + np.clip(hp * 0.4, -0.03, 0.03) - 0.08 * blur(thin_dark, 0.1) - 0.012 * scr
ao = np.clip(1 - 1.2 * blur(thin_dark, 0.1), 0.5, 1)
# значки клавиш: слой из рисунка модели; на красной — краска, на прозрачных — литьё (чуть светлее и выпукло)
lp = os.path.join(GEN, 'masks', 'proc_right_L.png')
if os.path.exists(lp):
    Lr = cv2.imread(lp, cv2.IMREAD_UNCHANGED); assert Lr.shape[:2] == L.shape, (Lr.shape, L.shape)
    a_ = Lr[..., 3].astype(np.float32) / 255.0 * np.clip(1 - 0.5 * scr, 0.4, 1) * 0.78
    # на прозрачных клавишах литые значки с фото срезаны вместе с царапинами — значок кладётся из слоя: чёткий и на своём месте
    alb = alb * (1 - a_[..., None]) + np.array([0.86, 0.87, 0.87], np.float32) * a_[..., None]
    rough = rough * (1 - a_) + 0.45 * a_; h = h + 0.03 * blur(a_, 0.03)
save('right', alb, normal_from(blur(h, 0.03), 1.4), np.dstack([np.zeros_like(rough), np.clip(rough, 0.05, 1), ao]))

# ================================================================== левая грань (фото 2K — карта вдвое реже)
PX = 1280 / 60.0; blur, med8, med3, soft, wear = mk(PX)
al, lay, info = align(cv2.imread(os.path.join(GEN, 'T5_left.png')), cv2.imread(os.path.join(GEN, 'layout', 'L_left.png')), T_MM, H_MM, PX); report['left'] = info
cv2.imwrite(os.path.join(OUT, 'src', '_check_left.jpg'), cv2.addWeighted(al, 0.6, lay, 0.4, 0), [cv2.IMWRITE_JPEG_QUALITY, 85])
f = paint_black(al.astype(np.float32) / 255.0, 'r')
f, info['plastic_gain'] = match_plastic(f, f[int(70 * PX):int(100 * PX), int(2 * PX):int(7.5 * PX)])
L = lum(u8(f)); scr, haze, Lm = wear(L, 0.05, 4.0)
alb = np.clip(np.minimum(f, med3(f, 0.3) + 0.04), 0, 0.97)
Lb = np.minimum(L, med8(L, 0.3) + 0.04); hp = Lb - blur(Lb, 0.25)
rough = np.clip(0.50 + 0.18 * scr + np.clip(hp * 1.5, -0.06, 0.08) - 0.10 * np.clip(haze, 0, 1), 0.05, 1)
thin_dark = np.clip((med8(L, 0.5) - blur(L, 0.08)) / (med8(L, 0.5) + 0.05), 0, 1)
h = 0.5 + np.clip(hp * 0.4, -0.03, 0.03) - 0.08 * blur(thin_dark, 0.1) - 0.012 * scr
save('left', alb, normal_from(blur(h, 0.04), 1.4), np.dstack([np.zeros_like(rough), rough, np.clip(1 - 1.2 * blur(thin_dark, 0.1), 0.5, 1)]))

# ================================================================== верхняя грань 60 × 22,5 мм (на неё смотрят реже — 320 пикс/см)
PX = 1920 / 60.0; blur, med8, med3, soft, wear = mk(PX)
al, lay, info = align(cv2.imread(os.path.join(GEN, 'T6_top.png')), cv2.imread(os.path.join(GEN, 'layout', 'L_top.png')), W_MM, T_MM, PX); report['top'] = info
cv2.imwrite(os.path.join(OUT, 'src', '_check_top.jpg'), cv2.addWeighted(al, 0.6, lay, 0.4, 0), [cv2.IMWRITE_JPEG_QUALITY, 85])
f = paint_black(al.astype(np.float32) / 255.0, 'b')
f, info['plastic_gain'] = match_plastic(f, f[int(2 * PX):int(8 * PX), int(2 * PX):int(11 * PX)])
L = lum(u8(f)); scr, haze, Lm = wear(L, 0.05, 4.0)
alb = np.clip(np.minimum(f, med3(f, 0.3) + 0.04), 0, 0.97)
Lb = np.minimum(L, med8(L, 0.3) + 0.04); hp = Lb - blur(Lb, 0.25)
rough = np.clip(0.50 + 0.18 * scr + np.clip(hp * 1.5, -0.06, 0.08) - 0.10 * np.clip(haze, 0, 1), 0.05, 1)
thin_dark = np.clip((med8(L, 0.5) - blur(L, 0.06)) / (med8(L, 0.5) + 0.05), 0, 1)
h = 0.5 + np.clip(hp * 0.4, -0.03, 0.03) - 0.08 * blur(thin_dark, 0.1) - 0.012 * scr
bright = soft((L > 0.6) & (thin_dark < 0.2), 0.08)                          # кольцо гнезда наушника — металл
save('top', alb, normal_from(blur(h, 0.03), 1.4), np.dstack([0.9 * bright, np.clip(rough * (1 - bright) + 0.25 * bright, 0.05, 1), np.clip(1 - 1.2 * blur(thin_dark, 0.1), 0.5, 1)]))

# ================================================================== следы на стекле окна: волосяные царапины с дверцы и пыль по краям
PX = 2560 / 60.0; blur, med8, med3, soft, wear = mk(PX)
af = cv2.imread(os.path.join(OUT, 'src', '_aligned_front.jpg'))
if af is not None:
    crop = af[int(22 * PX):int(59.2 * PX), int(34 * PX):int(55.2 * PX)]            # гладкий участок дверцы 21,2 × 37,2 мм
    s2, _, _ = wear(lum(crop), 0.03, 1.0); s2 = cv2.resize(blur(s2, 0.02), (640, 1120), interpolation=cv2.INTER_AREA)
    rs = np.random.RandomState(4622); yy, xx = np.mgrid[0:1120, 0:640].astype(np.float32)
    edge = np.minimum(np.minimum(xx, 639 - xx), np.minimum(yy, 1119 - yy)) / 30.0
    dustn = cv2.GaussianBlur(rs.uniform(0, 1, (1120, 640)).astype(np.float32), (0, 0), 2.2); dustn = np.clip((dustn - dustn.mean()) / (dustn.std() + 1e-6) * 0.6, 0, 1)
    specks = (rs.uniform(0, 1, (1120, 640)) > 0.9993).astype(np.float32); specks = cv2.GaussianBlur(specks, (0, 0), 1.1) * 6
    alpha = np.clip(0.75 * s2 + 0.16 * np.clip(1.6 - edge, 0, 1) ** 2 * (0.35 + dustn) + 0.03, 0, 1)   # пыли по краям — чуть-чуть, без «крошки»
    for d, k in (('pack', 1.0), ('pack_low', 0.5)):
        im = u8(alpha) if k == 1 else cv2.resize(u8(alpha), None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(OUT, d, 'glass_a.jpg'), cv2.merge([im, im, im]), [cv2.IMWRITE_JPEG_QUALITY, 88])
    report['glass'] = {'scr_cover_%': round(float((s2 > 0.3).mean() * 100), 2)}
json.dump(report, open(os.path.join(OUT, '_parts_report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(report, ensure_ascii=False))
