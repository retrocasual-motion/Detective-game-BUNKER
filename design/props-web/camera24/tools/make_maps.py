# make_maps.py — PBR-карты камеры 24 из фото GEN22 (kie.ai, Nano Banana Pro).
#
# Вход (папка gen22):  T1_front.png, T2_back.png — фото граней строго в лоб, ровный свет, серый фон;
#                      layout/L_front.png, L_back.png — ортовиды модели (ortho.html, кадр 2048×1152, поля m=1.18);
#                      masks/proc_{front,back}_{A,O,H}.png, proc_back_L_8192.png — холсты рисунка модели
#                      (tools/export_masks.py): области и слой надписей кнопок.
# Выход (папка карт):  src/   — 4096×2458 (≈ 431 пикс/см), исходники;
#                      pack/  — грани 2048×1229 (≈ 216 пикс/см): {front,back}_{a.jpg,n.png,orm.jpg};
#                               ctl_* — блок кнопок (полоса 35 × 57 мм) 1792×2919 (≈ 512 пикс/см), нормали и ORM вдвое реже;
#                               side_* — пояс по периметру 4096×192; tile_* — плитка «общего» металла;
#                      pack_low/ — всё вдвое реже.
#   ORM: R — AO, G — шероховатость, B — металл.
#
# Уроки телефона 48, учтённые здесь сразу:
#   • светлые крапинки пыли на металле срезаются до фона — иначе блестят «крошкой»;
#   • у края каждой кнопки поверхность приводится к ровному цвету самой кнопки (фото и форма совпадают не до пикселя);
#   • надписи кнопок не с фото (генератор их коверкает), а резким слоем из рисунка модели;
#   • нормали — PNG (JPEG на гладком металле даёт квадраты в отражении).
#
# Запуск:  python tools/make_maps.py <gen22> <textures/pbr>
import sys, os, json
import numpy as np
import cv2

GEN, OUT = sys.argv[1], sys.argv[2]
for d in ('src', 'pack', 'pack_low'): os.makedirs(os.path.join(OUT, d), exist_ok=True)
WMM, HMM = 95.0, 57.0
MAP_W = 4096; MAP_H = int(round(MAP_W * HMM / WMM)); PXMM = MAP_W / WMM
LAY_W, LAY_H, MARGIN = 2048, 1152, 1.18

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
    """Фото → кадр ортовида в масштабе карты: рамка вещи на рамку вещи, затем ECC по краям; вырезать корпус 95×57."""
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
        if abs(warp[0, 0] - 1) > 0.04 or abs(warp[1, 1] - 1) > 0.04 or np.abs(warp[:, 2]).max() > 0.03 * W:
            warp = np.eye(2, 3, dtype=np.float32); score = None
        else:
            warped = cv2.warpAffine(warped, warp, (W, H), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    except cv2.error:
        score = None
    x0, y0 = int(round(W / 2 - MAP_W / 2)), int(round(H / 2 - MAP_H / 2))
    info = {'bbox_photo': [int(v) for v in (px, py, pw, ph)], 'bbox_layout': [int(v) for v in (lx, ly, lw, lh)],
            'photo_px_per_mm': round(float(pw) / WMM, 1), 'ecc': None if score is None else round(float(score), 4), 'ecc_warp': warp.round(4).tolist()}
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
    for d, ww in (('pack', 2048), ('pack_low', 1024)):
        size = (ww, int(round(ww * HMM / WMM)))
        cv2.imwrite(os.path.join(OUT, d, f'{face}_a.jpg'), cv2.resize(u8(alb), size, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 94])
        cv2.imwrite(os.path.join(OUT, d, f'{face}_orm.jpg'), cv2.resize(u8(orm), size, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 95])
        cv2.imwrite(os.path.join(OUT, d, f'{face}_n.png'), n_img(resize_n(nrm, size)), [cv2.IMWRITE_PNG_COMPRESSION, 9])

ys, xs = np.mgrid[0:MAP_H, 0:MAP_W].astype(np.float32)
X, Y = (xs + 0.5) / PXMM, (ys + 0.5) / PXMM                     # мм от левого и верхнего края карты
report = {}

# ------------------------------------------------------------------ перед
photo = cv2.imread(os.path.join(GEN, 'T1_front.png')); layout = cv2.imread(os.path.join(GEN, 'layout', 'L_front.png'))
al, lay, info = align(photo, layout); report['front'] = info
cv2.imwrite(os.path.join(OUT, 'src', '_check_front.jpg'), cv2.resize(cv2.addWeighted(al, 0.6, lay, 0.4, 0), (MAP_W // 2, MAP_H // 2)), [cv2.IMWRITE_JPEG_QUALITY, 85])
cv2.imwrite(os.path.join(OUT, 'src', '_aligned_front.jpg'), al, [cv2.IMWRITE_JPEG_QUALITY, 92])
f = al.astype(np.float32) / 255.0; L = lum(al)
LX, LZ = 47.5 + 17.0, 28.5 + 1.4                                  # центр колец объектива на фото (подбор по резкости радиального профиля)
rl = np.hypot(X - LX, Y - LZ)
# радиальный профиль яркости вокруг объектива — чтобы сверить радиусы колец модели с фото
prof = [round(float(L[(rl >= r_) & (rl < r_ + 0.5)].mean()), 3) for r_ in np.arange(6, 23, 0.5)]
report['front']['lens_radial_profile_from_6mm_step_0.5'] = prof
flash = (np.abs(X - (47.5 - 8.6)) < 8.6) & (np.abs(Y - (28.5 - 20.4)) < 3.2)
lamp = np.hypot(X - (47.5 + 43.1), Y - (28.5 - 5.5)) < 1.8
inner = rl < 10.0                                                 # чёрное кольцо и шторки — не металл
nonmetal = soft(flash | lamp | inner, 0.1)
scr, haze, Lm = wear(L, 0.045, 6.0)                              # автор 27.11: износа и царапин меньше
fm = np.minimum(f, med3(f, 0.4) + 0.035)                          # светлые крапинки и белёсые царапины — не в цвет
g = fm.mean(2, keepdims=True); fm = g + (fm - g) * 0.12            # нейтральный серебристый: оттенок фото убран
plate_med = np.median(fm[(rl > 21.5) & ~flash & ~lamp].reshape(-1, 3), 0)
gain = 0.74 / max(float(plate_med.mean()), 1e-3)
alb = np.clip((plate_med + (fm - plate_med) * 0.40) * gain + 0.04 * scr[..., None], 0, 0.97)   # пятна засаленности — намного мягче, чем на фото
ringz = (rl >= 10.0) & (rl < 20.2)                                # кольца объектива — светлый хром
ring_med = np.median(fm[ringz].reshape(-1, 3), 0)
alb_r = np.clip((ring_med + (fm - ring_med) * 0.6) * (0.86 / max(float(ring_med.mean()), 1e-3)), 0, 0.97)
wr = soft(ringz, 0.08)[..., None]; alb = alb * (1 - wr) + alb_r * wr
# торцы колец объектива: у самых краёв — ровный цвет кольца (фото и тело вращения совпадают не до пикселя)
for r0_, r1_ in ((10.25, 12.35), (12.95, 14.95), (16.95, 19.7)):
    face = (rl >= r0_) & (rl <= r1_); core = (rl >= r0_ + 0.5) & (rl <= r1_ - 0.5)
    w_ = np.clip(1 - np.minimum(rl - r0_, r1_ - rl) / 0.35, 0, 1) * face
    alb = alb * (1 - w_[..., None]) + np.median(alb[core].reshape(-1, 3), 0) * w_[..., None]
alb = alb * (1 - nonmetal[..., None]) + np.clip(f * 0.9, 0, 1) * nonmetal[..., None]
Lb = np.minimum(L, med8(L, 0.4) + 0.03); hp = Lb - blur(Lb, 0.30)
rough = 0.27 + 0.22 * scr + np.clip(hp * 1.5, -0.05, 0.06) + 0.05 * np.clip(-haze, 0, 1) - 0.03 * np.clip(haze, 0, 1)
rough = rough * (1 - wr[..., 0]) + (0.16 + 0.16 * scr + np.clip(hp * 1.6, -0.05, 0.06)) * wr[..., 0]
rough = np.clip(rough * (1 - nonmetal) + 0.45 * nonmetal, 0.05, 1)
thin_dark = np.clip((med8(L, 0.5) - blur(L, 0.06)) / (med8(L, 0.5) + 0.05), 0, 1)
brushx = cv2.GaussianBlur(Lb, (0, 0), sigmaX=1.4 * PXMM, sigmaY=0.7) - blur(Lb, 0.5)   # одни продольные штрихи шлифовки
h = 0.5 + np.clip(brushx * 0.9, -0.035, 0.035) * (1 - wr[..., 0]) - 0.08 * blur(thin_dark, 0.12) - 0.010 * scr
nrm = normal_from(blur(h, 0.03), 1.2)
ao = np.clip(1 - 1.4 * blur(thin_dark, 0.12), 0.5, 1)
# корпус — крашеный и шлифованный алюминий: металл наполовину, иначе в тёмной комнате серебристая камера выходит чёрной;
# кольца объектива — настоящий хром
met = np.clip(0.88 + 0.12 * wr[..., 0], 0, 1) * (1 - nonmetal)   # автор 27.11: «не ощущается, что металлическая… как будто кожаная» — корпус почти целиком металл
save_face('front', alb, nrm, np.dstack([met, rough, ao]))
report['front'].update({'scr_cover_%': round(float((scr > 0.3).mean() * 100), 2), 'rough_plate_p50_p95': [round(float(np.percentile(rough[rl > 22], q)), 3) for q in (50, 95)]})

# плитка «общего» металла (кольца, кнопки сверху): потёртости с гладкого участка переда, 30 × 30 мм
t0 = (int(6 * PXMM), int(22 * PXMM)); n = int(30 * PXMM)
ts = seamless(cv2.resize(scr[t0[1]:t0[1] + n, t0[0]:t0[0] + n], (1024, 1024), interpolation=cv2.INTER_AREA))
t_rough = np.clip(0.15 + 0.30 * ts, 0, 1); t_n = normal_from(0.5 - 0.03 * ts, 2.0)
for d, s_ in (('pack', 1024), ('pack_low', 512)):
    cv2.imwrite(os.path.join(OUT, d, 'tile_orm.jpg'), u8(cv2.resize(np.dstack([np.ones_like(t_rough), t_rough, np.ones_like(t_rough)]), (s_, s_), interpolation=cv2.INTER_AREA)), [cv2.IMWRITE_JPEG_QUALITY, 95])
    cv2.imwrite(os.path.join(OUT, d, 'tile_n.png'), n_img(resize_n(t_n, (s_, s_))))

# ------------------------------------------------------------------ пояс по периметру
# Полоса на весь периметр корпуса × высоту пояса: сатинированный металл, продольная шлифовка, углы затёрты до блеска,
# пыль в швах, волосяные потёртости с фото. Общий износ, без особых примет.
rs = np.random.RandomState(2412)
SW, SH = 4096, 192; PERIM = 2 * (95 - 14) + 2 * (57 - 14) + 2 * np.pi * 7.0; SMM = 13.3
su = (np.arange(SW, dtype=np.float32) + 0.5) / SW * PERIM; sv = (np.arange(SH, dtype=np.float32) + 0.5) / SH * SMM
arc = np.pi * 7.0 / 2; corners = [arc / 2, arc + 81 + arc / 2, 2 * arc + 81 + 43 + arc / 2, 3 * arc + 162 + 43 + arc / 2]
def wrapd(a_, b_): d_ = np.abs(a_ - b_); return np.minimum(d_, PERIM - d_)
corner = np.zeros(SW, np.float32)
for c_ in corners: corner = np.maximum(corner, np.exp(-(wrapd(su, c_) / 6.0) ** 2))
corner = corner[None, :] * np.ones((SH, 1), np.float32)
brush = cv2.GaussianBlur(rs.normal(0, 1, (SH, SW)).astype(np.float32), (0, 0), sigmaX=22, sigmaY=0.6); brush /= np.abs(brush).max()
streak = np.zeros((SH, SW * 3), np.float32)
for i in range(260):
    x0 = rs.uniform(0, SW)
    if rs.uniform() > 0.4 + 0.6 * corner[0, int(x0) % SW]: continue
    ln = rs.uniform(3, 26) / PERIM * SW; y0 = rs.uniform(0, SH); dy = rs.normal(0, 5.0)
    for k in (0, 1, 2): cv2.line(streak, (int(x0 + k * SW), int(y0)), (int(x0 + ln + k * SW), int(y0 + dy)), float(rs.uniform(0.3, 1.0)), 1, cv2.LINE_AA)
streak = streak[:, SW:2 * SW]
mx_, my_ = np.meshgrid(su * (1024 / 30.0) % 1024, sv * (1024 / 30.0) % 1024)
hair = cv2.remap(ts.astype(np.float32), mx_.astype(np.float32), my_.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
cloud = cv2.resize(cv2.GaussianBlur(rs.normal(0, 1, (8, 256)).astype(np.float32), (0, 0), 1.5), (SW, SH), interpolation=cv2.INTER_CUBIC); cloud /= np.abs(cloud).max()
dv = np.minimum(sv, SMM - sv)[:, None]
dust_line = cv2.resize(np.clip(rs.normal(0.5, 0.5, (1, 700)), 0, 1).astype(np.float32), (SW, 1), interpolation=cv2.INTER_CUBIC)
grain = cv2.GaussianBlur(rs.normal(0, 1, (SH, SW)).astype(np.float32), (0, 0), 0.8)
dust = np.clip(1 - dv / 0.35, 0, 1) ** 1.5 * np.clip(dust_line + 0.2 * corner[:1], 0, 1) * np.clip(0.6 + 0.6 * grain, 0, 1)
s_rough = 0.27 + 0.06 * brush + 0.03 * cloud - 0.07 * corner + 0.12 * streak + 0.12 * hair
s_rough = np.clip(s_rough * (1 - dust) + 0.95 * dust, 0.08, 1)
s_alb = 0.74 + 0.02 * brush + 0.02 * corner + 0.02 * streak
s_alb = np.clip(s_alb * (1 - dust) + 0.22 * dust, 0, 1)
s_ao = np.clip(1 - 0.35 * np.clip(1 - dv / 0.2, 0, 1), 0, 1) * np.ones((1, SW), np.float32)
s_met = 0.88 * (1 - dust)
s_n = normal_from(0.5 + 0.03 * brush - 0.02 * streak - 0.012 * hair, 1.6)
for d, k in (('pack', 1), ('pack_low', 2)):
    size = (SW // k, SH // k)
    cv2.imwrite(os.path.join(OUT, d, 'side_a.jpg'), cv2.resize(u8(np.dstack([s_alb, s_alb, s_alb])), size, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 95])
    cv2.imwrite(os.path.join(OUT, d, 'side_orm.jpg'), cv2.resize(u8(np.dstack([s_met, s_rough, s_ao])), size, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 95])
    cv2.imwrite(os.path.join(OUT, d, 'side_n.png'), n_img(resize_n(s_n, size)))

# ------------------------------------------------------------------ ярлык бюро (вёрстка tools/label_make.html, 1540×880)
if os.path.exists(os.path.join(OUT, 'src', 'label_albedo.png')):
    for d, ka_, kn_ in (('pack', 1.0, 0.5), ('pack_low', 0.5, 0.25)):
        for nm, k_, ext, q in (('albedo', ka_, 'a.jpg', 94), ('normal', kn_, 'n.png', 0), ('rough', kn_, 'r.jpg', 92)):
            im = cv2.imread(os.path.join(OUT, 'src', f'label_{nm}.png'))
            im = cv2.resize(im, None, fx=k_, fy=k_, interpolation=cv2.INTER_AREA) if k_ != 1 else im
            cv2.imwrite(os.path.join(OUT, d, 'label_' + ext), im, [cv2.IMWRITE_JPEG_QUALITY, q] if q else [])
    report['label'] = {'mm': [38, 21.7], 'px_per_cm_full': 405}

# ------------------------------------------------------------------ зад
photo = cv2.imread(os.path.join(GEN, 'T2_back.png')); layout = cv2.imread(os.path.join(GEN, 'layout', 'L_back.png'))
al, lay, info = align(photo, layout); report['back'] = info
cv2.imwrite(os.path.join(OUT, 'src', '_check_back.jpg'), cv2.resize(cv2.addWeighted(al, 0.6, lay, 0.4, 0), (MAP_W // 2, MAP_H // 2)), [cv2.IMWRITE_JPEG_QUALITY, 85])
cv2.imwrite(os.path.join(OUT, 'src', '_aligned_back.jpg'), al, [cv2.IMWRITE_JPEG_QUALITY, 92])
f = al.astype(np.float32) / 255.0; L = lum(al)
O = cv2.imread(os.path.join(GEN, 'masks', 'proc_back_O.png')); assert O.shape[:2] == (MAP_H, MAP_W), O.shape
glass = O[..., 0] < 128                                           # стекло экрана с чёрной каймой (металл = 0 на холсте модели)
bx = lambda x_mm: 47.5 - x_mm                                     # координата вещи X (мм) → мм от левого края карты зада
def inside_rr(cx, cz, hw_, hd_, r_):
    qx = np.abs(X - bx(cx)) - (hw_ - r_); qy = np.abs(Y - (28.5 + cz)) - (hd_ - r_)
    return -(np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r_)   # глубина внутри, мм
B = {'zoom': (-31, -21.5), 'dial': (-36.5, -8.5), 'play': (-22, -9.5), 'pad': (-31, 9.5), 'menu': (-21.5, 20.5), 'home': (-40.5, 20.5)}
scr, haze, Lm = wear(L, 0.045, 6.0)
fm = np.minimum(f, med3(f, 0.4) + 0.035); g = fm.mean(2, keepdims=True); fm = g + (fm - g) * 0.12
body = ~glass
shell_med = np.median(fm[body].reshape(-1, 3), 0); gain = 0.72 / max(float(shell_med.mean()), 1e-3)
alb = np.clip((shell_med + (fm - shell_med) * 0.42) * gain + 0.04 * scr[..., None], 0, 0.97)
gl_med = np.median(fm[glass].reshape(-1, 3), 0)
wg = soft(glass, 0.08)[..., None]
alb = alb * (1 - wg) + np.clip((gl_med + (fm - gl_med) * 0.35) * 0.9 + 0.10 * scr[..., None], 0, 1) * wg
Lb = np.minimum(L, med8(L, 0.4) + 0.03); hp = Lb - blur(Lb, 0.30)
rough = 0.32 + 0.20 * scr + np.clip(hp * 1.3, -0.05, 0.06) + 0.04 * np.clip(-haze, 0, 1) - 0.04 * np.clip(haze, 0, 1)
rough = rough * (1 - wg[..., 0]) + (0.10 + 0.40 * scr + 0.10 * np.abs(haze)) * wg[..., 0]
met = 0.86 * (1 - wg[..., 0])                                     # задняя оболочка — металл
thin_dark = np.clip((med8(L, 0.5) - blur(L, 0.06)) / (med8(L, 0.5) + 0.05), 0, 1) * (1 - wg[..., 0])
h = 0.5 + np.clip(hp * 0.12, -0.012, 0.012) * (1 - wg[..., 0]) - 0.08 * blur(thin_dark, 0.12) - 0.010 * scr   # почти гладко: шум фото в рельеф не идёт
ao = np.clip(1 - 1.4 * blur(thin_dark, 0.12), 0.5, 1)
# ---- кнопки: ровные края и надписи ----
# У края каждой кнопки поверхность приводится к ровному цвету самой кнопки; середина остаётся с фото (шлифовка, потёртости).
zones = []
for k in ('play', 'menu', 'home'):
    d_ = inside_rr(*B[k], 2.6, 2.6, 2.6); zones.append((np.clip(1 - d_ / 0.6, 0, 1) * (d_ > -0.05), d_ > 0.9))
d_ok = inside_rr(*B['pad'], 3.9, 3.9, 3.9); zones.append((np.clip(1 - d_ok / 0.7, 0, 1) * (d_ok > -0.05), d_ok > 1.2))
d_ro = inside_rr(*B['pad'], 9.5, 9.5, 9.5); d_ri = inside_rr(*B['pad'], 4.25, 4.25, 4.25)
ring = (d_ro > -0.05) & (d_ri < 0.05)
zones.append((np.clip(np.maximum(1 - d_ro / 0.7, 1 - (-d_ri) / 0.6), 0, 1) * ring, (d_ro > 1.2) & (d_ri < -1.0)))
d_z = inside_rr(*B['zoom'], 7.5, 3.0, 2.0); zones.append((np.clip(1 - d_z / 0.6, 0, 1) * (d_z > -0.05), d_z > 1.0))
d_dl = inside_rr(*B['dial'], 6.2, 6.2, 6.2); zones.append((np.clip(1 - d_dl / 0.6, 0, 1) * (d_dl > -0.05), d_dl > 1.2))   # верх диска режимов
# вокруг диска генератор нарисовал зубцы насечки плашмя — у модели насечка настоящая: кольцо 6,2…8,2 мм закрыть чистой оболочкой
d_d2 = inside_rr(*B['dial'], 8.2, 8.2, 8.2); halo = np.clip(np.minimum(d_d2 / 0.5, -d_dl / 0.3), 0, 1) * (d_d2 > 0) * (d_dl < 0)
far = (inside_rr(*B['dial'], 12.5, 12.5, 12.5) > 0) & (d_d2 < -0.5) & body & (inside_rr(*B['pad'], 10.5, 10.5, 10.5) < 0) & (inside_rr(*B['play'], 3.6, 3.6, 3.6) < 0) & (inside_rr(*B['zoom'], 8.5, 4.0, 2.5) < 0)
alb = alb * (1 - halo[..., None]) + np.median(alb[far].reshape(-1, 3), 0) * halo[..., None]
rough = rough * (1 - halo) + float(np.median(rough[far])) * halo; ao = ao * (1 - halo) + halo; h = h * (1 - halo) + 0.5 * halo
for w_, core_ in zones:
    c_ = np.median(alb[core_].reshape(-1, 3), 0); alb = alb * (1 - w_[..., None]) + c_ * w_[..., None]
    rough = rough * (1 - w_) + float(np.median(rough[core_])) * w_; ao = ao * (1 - w_) + w_; h = h * (1 - w_) + 0.5 * w_
btn = np.zeros(L.shape, np.float32)
for w_, core_ in zones: btn = np.maximum(btn, soft(core_ | (w_ > 0.02), 0.1))
met = np.maximum(met, 0.92 * btn)                                 # кнопки — сатинированный металл
nrm = normal_from(blur(h, 0.04), 1.2)
rough = np.clip(rough, 0.05, 1)
# надписи: слой из рисунка модели (8192 px), краска тёмно-серая, матовее металла
Lr = cv2.imread(os.path.join(GEN, 'masks', 'proc_back_L_8192.png'), cv2.IMREAD_UNCHANGED)
def put_labels(alb_, rough_, met_, size):
    a_ = cv2.resize(Lr[..., 3], size, interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    ink = cv2.resize(cv2.blur(Lr[..., :3], (9, 9)), size, interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0   # цвет краски — из слоя (тёмно-серая, значок съёмки зелёный)
    return alb_ * (1 - a_[..., None]) + ink * a_[..., None], np.clip(rough_ * (1 - a_) + 0.55 * a_, 0, 1), met_ * (1 - a_)
alb_l, rough_l, met_l = put_labels(alb, rough, met, (MAP_W, MAP_H))
save_face('back', alb_l, nrm, np.dstack([met_l, rough_l, ao]))
# блок кнопок: полоса справа от экрана (X вещи от −47,5 до −12,5 мм) — плотнее общей карты
c0 = int(round(bx(-12.5) * PXMM)); ctl = lambda a_: a_[:, c0:]
CW = 1792; CH = int(round(CW * HMM / 35.0))
for d, k in (('pack', 1.0), ('pack_low', 0.5)):
    sa = (int(CW * k), int(CH * k)); sn = (int(CW * k / 2), int(CH * k / 2))
    full = (int(round(sa[0] * WMM / 35.0)), sa[1])                   # вся карта зада в масштабе полосы — чтобы положить надписи без лишней ресэмплировки
    a_up = cv2.resize(u8(alb), full, interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255; r_up = cv2.resize(rough, full, interpolation=cv2.INTER_CUBIC); m_up = cv2.resize(met, full, interpolation=cv2.INTER_CUBIC)
    a_up, r_up, m_up = put_labels(a_up, r_up, m_up, full)
    cc = full[0] - sa[0]
    cv2.imwrite(os.path.join(OUT, d, 'ctl_a.jpg'), u8(a_up[:, cc:]), [cv2.IMWRITE_JPEG_QUALITY, 95])
    o_ = np.dstack([m_up, r_up, cv2.resize(ao, full, interpolation=cv2.INTER_AREA)])[:, cc:]
    cv2.imwrite(os.path.join(OUT, d, 'ctl_orm.jpg'), cv2.resize(u8(o_), sn, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 95])
    cv2.imwrite(os.path.join(OUT, d, 'ctl_n.png'), n_img(resize_n(ctl(nrm), sn)))
report['back'].update({'scr_cover_%': round(float((scr > 0.3).mean() * 100), 2), 'ctl_px_per_cm': round(CW / 3.5)})
report['maps'] = {'src': [MAP_W, MAP_H, round(PXMM * 10)], 'pack': [2048, 1229, round(2048 / 9.5)], 'pack_low': [1024, 614, round(1024 / 9.5)], 'ctl': [CW, CH]}
json.dump(report, open(os.path.join(OUT, '_maps_report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(report, ensure_ascii=False))
