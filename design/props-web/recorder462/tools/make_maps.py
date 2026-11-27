# make_maps.py — PBR-карты проигрывателя микрокассет L462 из фото GEN23 (kie.ai, Nano Banana Pro).
#
# Вход (папка gen23):  T1_front.png, T2_back.png — фото граней строго в лоб, ровный свет, серый фон;
#                      layout/L_front.png, L_back.png — ортовиды модели (ortho.html, кадр 1152×2048, поля m=1.18, plain=1);
#                      masks/proc_front_L.png — слой печати переда (стрелка у окна) из рисунка модели (tools/export_masks.py).
# Выход (папка карт):  src/   — 2560×4693 (≈ 427 пикс/см), исходники;
#                      pack/  — перед 1536×2816 (256 пикс/см), спинка 1024×1877 (171 пикс/см): {front,back}_{a.jpg,n.png,orm.jpg};
#                               tile_* — зерно литого пластика боков; cass_a.jpg — полоска кассеты; label_* — наклейка бюро;
#                      pack_low/ — всё вдвое реже.
#   ORM: R — AO, G — шероховатость, B — металл.
#
# Уроки телефона 48 и камеры 24, учтённые сразу:
#   • светлые крапинки пыли срезаются до фона — иначе блестят «крошкой»;
#   • у краёв окон и вокруг отверстий — ровный цвет самой детали (фото и форма совпадают не до пикселя);
#   • отверстия решётки — геометрия: на карте их нет (закрыты краской), остаются тень и пыль у кромок;
#   • печать (стрелка) — резким слоем из рисунка модели; нормали — PNG;
#   • износа меньше, чем на фото (автор по камере: «по царапинам и износу перегнул»); цвет вещи не обесцвечивается.
#
# Запуск:  python tools/make_maps.py <gen23> <textures/pbr>
import sys, os, json
import numpy as np
import cv2

GEN, OUT = sys.argv[1], sys.argv[2]
for d in ('src', 'pack', 'pack_low'): os.makedirs(os.path.join(OUT, d), exist_ok=True)
WMM, HMM = 60.0, 110.0
MAP_W = 2560; MAP_H = int(round(MAP_W * HMM / WMM)); PXMM = MAP_W / WMM
LAY_W, LAY_H, MARGIN = 1152, 2048, 1.18
PACK = {'front': 1536, 'back': 1024}

def lum(img): return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
def blur(a, mm): return cv2.GaussianBlur(a, (0, 0), max(0.5, mm * PXMM))
def med8(a, mm):
    k = max(3, int(mm * PXMM) | 1)
    return cv2.medianBlur(np.clip(a * 255, 0, 255).astype(np.uint8), k).astype(np.float32) / 255.0
def med3(f, mm): return np.dstack([med8(f[..., c], mm) for c in range(3)])
def soft(m, mm=0.12): return blur(m.astype(np.float32), mm)

def object_bbox(img, bg_tol=18):
    edge = np.concatenate([img[:8].reshape(-1, 3), img[-8:].reshape(-1, 3), img[:, :8].reshape(-1, 3), img[:, -8:].reshape(-1, 3)])
    bg = np.median(edge, 0)
    d = np.abs(img.astype(np.int16) - bg.astype(np.int16)).max(2)
    m = (d > bg_tol).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((61, 61), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    return st[i, :4]

def align(photo, layout):
    """Фото → кадр ортовида в масштабе карты: рамка вещи на рамку вещи, затем ECC по краям; вырезать корпус 60×110."""
    k = MAP_H / (LAY_H / MARGIN)
    W, H = int(round(LAY_W * k)), int(round(LAY_H * k))
    lay = cv2.resize(layout, (W, H), interpolation=cv2.INTER_CUBIC)
    lx, ly, lw, lh = object_bbox(lay); px, py, pw, ph = object_bbox(photo, 30)
    if ph > pw * lh / lw * 1.015: ph = int(round(pw * lh / lw))      # тень под вещью удлинила рамку: ширина и верх надёжны
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
        if abs(warp[0, 0] - 1) > 0.04 or abs(warp[1, 1] - 1) > 0.04 or np.abs(warp[:, 2]).max() > 0.03 * H:
            warp = np.eye(2, 3, dtype=np.float32); score = None
        else:
            warped = cv2.warpAffine(warped, warp, (W, H), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    except cv2.error:
        score = None
    x0, y0 = int(round(W / 2 - MAP_W / 2)), int(round(H / 2 - MAP_H / 2))
    info = {'bbox_photo': [int(v) for v in (px, py, pw, ph)], 'bbox_layout': [int(v) for v in (lx, ly, lw, lh)],
            'photo_px_per_mm': round(float(ph) / (lh / (MAP_H / HMM)), 1), 'ecc': None if score is None else round(float(score), 4), 'ecc_warp': warp.round(4).tolist()}
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
def wear(L, scr_floor, haze_gain):
    Lm = med8(L, 0.8)
    scr = np.clip(L - Lm - scr_floor, 0, 1); scr = np.clip(scr / 0.16, 0, 1) ** 0.8
    haze = np.clip((blur(Lm, 1.5) - blur(Lm, 14.0)) * haze_gain, -1, 1)          # со знаком: + светлее (затёрто), − темнее (засалено)
    return scr, haze, Lm
u8 = lambda a: (np.clip(a, 0, 1) * 255).round().astype(np.uint8)
n_img = lambda n: cv2.cvtColor(((n * 0.5 + 0.5) * 255).round().astype(np.uint8), cv2.COLOR_RGB2BGR)
def resize_n(n, size):
    r = cv2.resize(n, size, interpolation=cv2.INTER_AREA); return r / np.linalg.norm(r, axis=2, keepdims=True)
def save_face(face, alb, nrm, orm):
    cv2.imwrite(os.path.join(OUT, 'src', f'{face}_albedo.png'), u8(alb)); cv2.imwrite(os.path.join(OUT, 'src', f'{face}_normal.png'), n_img(nrm)); cv2.imwrite(os.path.join(OUT, 'src', f'{face}_orm.png'), u8(orm))
    for d, ww in (('pack', PACK[face]), ('pack_low', PACK[face] // 2)):
        size = (ww, int(round(ww * HMM / WMM)))
        cv2.imwrite(os.path.join(OUT, d, f'{face}_a.jpg'), cv2.resize(u8(alb), size, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 94])
        cv2.imwrite(os.path.join(OUT, d, f'{face}_orm.jpg'), cv2.resize(u8(orm), size, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 95])
        cv2.imwrite(os.path.join(OUT, d, f'{face}_n.png'), n_img(resize_n(nrm, size)), [cv2.IMWRITE_PNG_COMPRESSION, 9])

ys, xs = np.mgrid[0:MAP_H, 0:MAP_W].astype(np.float32)
X, Y = (xs + 0.5) / PXMM, (ys + 0.5) / PXMM                     # мм от левого и верхнего края карты
report = {}
def rr_depth(x0, z0, x1, z1, r, mirror=False):
    """Глубина внутри скруглённого прямоугольника вещи (мм; < 0 — снаружи). Координаты вещи, мм; mirror — карта спинки."""
    cx = (x0 + x1) / 2; cz = (z0 + z1) / 2; hw_ = abs(x1 - x0) / 2; hd_ = abs(z1 - z0) / 2
    mx = (30 - cx) if mirror else (cx + 30)
    qx = np.abs(X - mx) - (hw_ - r); qy = np.abs(Y - (55 + cz)) - (hd_ - r)
    return -(np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r)

# ------------------------------------------------------------------ перед
DOOR = (-28, -53, 28, 6, 4.5); WIN = (-23, -46, 1, -7, 3.0); CNT = (8, -41, 19, -35.5, 0.6); GR = (-23, 13, 7, 49, 2.0); LED = (20.5, 11.0)
photo = cv2.imread(os.path.join(GEN, 'T1_front.png')); layout = cv2.imread(os.path.join(GEN, 'layout', 'L_front.png'))
al, lay, info = align(photo, layout); report['front'] = info
cv2.imwrite(os.path.join(OUT, 'src', '_check_front.jpg'), cv2.resize(cv2.addWeighted(al, 0.6, lay, 0.4, 0), (MAP_W // 2, MAP_H // 2)), [cv2.IMWRITE_JPEG_QUALITY, 85])
cv2.imwrite(os.path.join(OUT, 'src', '_aligned_front.jpg'), al, [cv2.IMWRITE_JPEG_QUALITY, 92])
f = al.astype(np.float32) / 255.0
d_door = rr_depth(*DOOR); d_win = rr_depth(*WIN); d_cnt = rr_depth(*CNT); d_gr = rr_depth(*GR)
d_led = 1.6 - np.hypot(X - (30 + LED[0]), Y - (55 + LED[1]))
# отверстия решётки (те же, что строит recorder462.js): центры, расстояние до ближайшего
pitch, hole = 2.1, 0.6
nz = int(np.floor((GR[3] - GR[1] - 3.2) / (pitch * 0.866))); nx = int(np.floor((GR[2] - GR[0] - 3.2) / pitch))
zs = (GR[1] + GR[3]) / 2 - nz * pitch * 0.866 / 2; xs0 = (GR[0] + GR[2]) / 2 - nx * pitch / 2
cent = [(xs0 + (i + (j % 2) * 0.5) * pitch, zs + j * pitch * 0.866) for j in range(nz + 1) for i in range(nx - (j % 2) + 1)]
hd = np.full(X.shape, 99.0, np.float32)
for cx, cz in cent:
    x0 = int((cx + 30 - 1.6) * PXMM); x1 = int((cx + 30 + 1.6) * PXMM); y0 = int((cz + 55 - 1.6) * PXMM); y1 = int((cz + 55 + 1.6) * PXMM)
    sl = (slice(y0, y1), slice(x0, x1)); hd[sl] = np.minimum(hd[sl], np.hypot(X[sl] - (cx + 30), Y[sl] - (cz + 55)))
report['front']['grille_holes'] = len(cent)

# 1) убрать с фото то, что у модели — геометрия: тёмные отверстия решётки, чёрные окна, лампочку
k_ = int(1.9 * PXMM) | 1
closed = cv2.morphologyEx(al, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_, k_)))    # тёмные кружки меньше 1,9 мм закрыты краской вокруг
wgr = soft(d_gr > -0.6, 0.25)[..., None]
f = f * (1 - wgr) + closed.astype(np.float32) / 255.0 * wgr
door_only = (d_door > 2.0) & (d_win < -2.0) & (d_cnt < -2.0)
low_only = (d_door < -2.5) & (d_gr < -2.0) & (rr_depth(-27, -52, 27, 52, 5) > 0) & (d_led < -1.0)
door_med = np.median(f[door_only].reshape(-1, 3), 0); low_med = np.median(f[low_only].reshape(-1, 3), 0)
for d_, mm_ in ((d_win, 0.8), (d_cnt, 0.7)):                       # окно и счётчик: внутри и у самого края — ровный цвет дверцы
    w_ = np.clip((d_ + mm_) / 0.35, 0, 1)[..., None]; f = f * (1 - w_) + door_med * w_
w_ = np.clip((d_led + 0.5) / 0.4, 0, 1)[..., None]; f = f * (1 - w_) + low_med * w_
L = lum(u8(f))

# 2) цвет: оттенок вещи остаётся; пятна и разводы мягче, светлые крапинки срезаны
scr, haze, Lm = wear(L, 0.050, 5.0)
fm = np.minimum(f, med3(f, 0.4) + 0.03)
wd = soft(d_door > 0, 0.3)[..., None]
base = door_med * wd + low_med * (1 - wd)
alb = np.clip(base + (fm - base) * 0.55 + 0.03 * scr[..., None], 0, 0.97)
g_ = alb.mean(2, keepdims=True); alb = np.clip(g_ + (alb - g_) * 1.35, 0, 0.97)        # «шампань» теплее: тональная кривая страницы приглушает цвет
edge_keep = soft(np.abs(d_door) < 0.9, 0.2)[..., None]              # у края дверцы тень и блик кромки с фото остаются целиком
alb = alb * (1 - edge_keep) + np.clip(fm, 0, 0.97) * edge_keep
# 3) шероховатость, металл, рельеф. Краска «шампань» — металлик под лаком: наполовину металл, иначе в тёмной комнате она серая.
Lb = np.minimum(L, med8(L, 0.4) + 0.03); hp = Lb - blur(Lb, 0.30)
rough = 0.36 + 0.20 * scr + np.clip(hp * 1.3, -0.05, 0.06) + 0.05 * np.clip(-haze, 0, 1) - 0.04 * np.clip(haze, 0, 1)
ring = np.clip(1 - (hd - hole) / 0.35, 0, 1) * (hd >= hole - 0.05) * (d_gr > 0)     # кромка каждого отверстия: тень и пыль
rs = np.random.RandomState(4620)
dustn = cv2.GaussianBlur(rs.uniform(0, 1, X.shape).astype(np.float32), (0, 0), 0.25 * PXMM); dustn = np.clip((dustn - dustn.mean()) / (dustn.std() + 1e-6) * 0.5 + 0.5, 0, 1)
dust = ring * dustn * 0.32
alb = alb * (1 - dust[..., None]) + np.array([0.33, 0.34, 0.35], np.float32) * dust[..., None]      # серая пыль в кромках (BGR)
rough = np.clip(rough * (1 - dust) + 0.9 * dust, 0.05, 1)
met = 0.55 * (1 - dust)
thin_dark = np.clip((med8(L, 0.5) - blur(L, 0.06)) / (med8(L, 0.5) + 0.05), 0, 1)
h = 0.5 + np.clip(hp * 0.10, -0.010, 0.010) - 0.06 * blur(thin_dark, 0.12) - 0.012 * scr
nrm = normal_from(blur(h, 0.03), 1.2)
ao = np.clip(1 - 1.2 * blur(thin_dark, 0.12), 0.5, 1) * (1 - 0.30 * ring)
# 4) печать: стрелка у окна — слой из рисунка модели
lp = os.path.join(GEN, 'masks', 'proc_front_L.png')
if os.path.exists(lp):
    Lr = cv2.imread(lp, cv2.IMREAD_UNCHANGED); assert Lr.shape[:2] == (MAP_H, MAP_W), Lr.shape
    a_ = Lr[..., 3].astype(np.float32) / 255.0; ink = cv2.blur(Lr[..., :3], (9, 9)).astype(np.float32) / 255.0
    wornp = np.clip(1 - 0.5 * scr - 0.35 * np.clip(haze, 0, 1), 0.35, 1); a_ = a_ * wornp * 0.85                  # печать тоже потёрта
    alb = alb * (1 - a_[..., None]) + ink * a_[..., None]; rough = np.clip(rough * (1 - a_) + 0.6 * a_, 0, 1); met = met * (1 - a_)
save_face('front', alb, nrm, np.dstack([met, rough, ao]))
report['front'].update({'scr_cover_%': round(float((scr > 0.3).mean() * 100), 2), 'door_rgb': [round(float(v), 3) for v in door_med[::-1]], 'low_rgb': [round(float(v), 3) for v in low_med[::-1]]})

# ------------------------------------------------------------------ спинка
photo = cv2.imread(os.path.join(GEN, 'T2_back.png')); layout = cv2.imread(os.path.join(GEN, 'layout', 'L_back.png'))
al, lay, info = align(photo, layout); report['back'] = info
cv2.imwrite(os.path.join(OUT, 'src', '_check_back.jpg'), cv2.resize(cv2.addWeighted(al, 0.6, lay, 0.4, 0), (MAP_W // 2, MAP_H // 2)), [cv2.IMWRITE_JPEG_QUALITY, 85])
cv2.imwrite(os.path.join(OUT, 'src', '_aligned_back.jpg'), al, [cv2.IMWRITE_JPEG_QUALITY, 92])
f = al.astype(np.float32) / 255.0; L = lum(al)
scr, haze, Lm = wear(L, 0.045, 5.0)
fm = np.minimum(f, med3(f, 0.4) + 0.03)
inner = rr_depth(-27, -52, 27, 52, 5, True) > 0
b_med = np.median(fm[inner].reshape(-1, 3), 0)
alb = np.clip(b_med + (fm - b_med) * 0.6 + 0.03 * scr[..., None], 0, 0.9)
Lb = np.minimum(L, med8(L, 0.4) + 0.03); hp = Lb - blur(Lb, 0.30)
rough = np.clip(0.50 + 0.18 * scr + np.clip(hp * 1.6, -0.06, 0.08) + 0.04 * np.clip(-haze, 0, 1) - 0.12 * np.clip(haze, 0, 1), 0.08, 1)   # затёртое рукой — глаже и блестит
thin_dark = np.clip((med8(L, 0.5) - blur(L, 0.06)) / (med8(L, 0.5) + 0.05), 0, 1)
h = 0.5 + np.clip(hp * 0.5, -0.03, 0.03) - 0.09 * blur(thin_dark, 0.12) - 0.012 * scr      # рёбра крышки и шов — из яркости фото
nrm = normal_from(blur(h, 0.04), 1.4)
ao = np.clip(1 - 1.3 * blur(thin_dark, 0.12), 0.5, 1)
save_face('back', alb, nrm, np.dstack([np.zeros_like(rough), rough, ao]))
report['back'].update({'scr_cover_%': round(float((scr > 0.3).mean() * 100), 2), 'rgb': [round(float(v), 3) for v in b_med[::-1]]})

# ------------------------------------------------------------------ плитка боков: мелкое зерно литого пластика + потёртости со спинки
t0 = (int(8 * PXMM), int(20 * PXMM)); n = int(30 * PXMM)
ts = seamless(cv2.resize(scr[t0[1]:t0[1] + n, t0[0]:t0[0] + n], (1024, 1024), interpolation=cv2.INTER_AREA))
g1 = cv2.GaussianBlur(np.pad(rs.normal(0, 1, (1024, 1024)).astype(np.float32), 16, mode='wrap'), (0, 0), 1.3)[16:-16, 16:-16]; g1 /= np.abs(g1).max()   # повторяется без шва
t_rough = np.clip(0.48 + 0.10 * g1 + 0.22 * ts, 0, 1); t_n = normal_from(0.5 + 0.035 * g1 - 0.02 * ts, 2.0)
for d, s_ in (('pack', 1024), ('pack_low', 512)):
    cv2.imwrite(os.path.join(OUT, d, 'tile_orm.jpg'), u8(cv2.resize(np.dstack([np.zeros_like(t_rough), t_rough, np.ones_like(t_rough)]), (s_, s_), interpolation=cv2.INTER_AREA)), [cv2.IMWRITE_JPEG_QUALITY, 95])
    cv2.imwrite(os.path.join(OUT, d, 'tile_n.png'), n_img(resize_n(t_n, (s_, s_))))

# ------------------------------------------------------------------ наклейка бюро и полоска кассеты (вёрстка tools/label_make.html)
if os.path.exists(os.path.join(OUT, 'src', 'label_albedo.png')):
    for d, ka_, kn_ in (('pack', 1.0, 0.5), ('pack_low', 0.5, 0.25)):
        for nm, k2, ext, q in (('albedo', ka_, 'a.jpg', 94), ('normal', kn_, 'n.png', 0), ('rough', kn_, 'r.jpg', 92)):
            im = cv2.imread(os.path.join(OUT, 'src', f'label_{nm}.png'))
            im = cv2.resize(im, None, fx=k2, fy=k2, interpolation=cv2.INTER_AREA) if k2 != 1 else im
            cv2.imwrite(os.path.join(OUT, d, 'label_' + ext), im, [cv2.IMWRITE_JPEG_QUALITY, q] if q else [])
        im = cv2.imread(os.path.join(OUT, 'src', 'cass_albedo.png'))
        cv2.imwrite(os.path.join(OUT, d, 'cass_a.jpg'), cv2.resize(im, None, fx=ka_, fy=ka_, interpolation=cv2.INTER_AREA) if ka_ != 1 else im, [cv2.IMWRITE_JPEG_QUALITY, 94])
    report['label'] = {'mm': [42, 18], 'px_per_cm_full': 367}; report['cass'] = {'mm': [8.7, 42], 'px_per_cm_full': 400}
report['maps'] = {'src': [MAP_W, MAP_H, round(PXMM * 10)], 'pack_front': [PACK['front'], round(PACK['front'] / 6.0)], 'pack_back': [PACK['back'], round(PACK['back'] / 6.0)]}
json.dump(report, open(os.path.join(OUT, '_maps_report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(report, ensure_ascii=False))
