# make_maps.py — карты ручки-диктофона 49 из фото поверхностей GEN34 (kie.ai, Nano Banana Pro).
#
# Корпус ручки — тело вращения с зеркальными материалами, поэтому фото снимаются не с ручки (отражения запеклись бы),
# а с плоских образцов тех же материалов при ровном свете: S1_lacquer.png — чёрный лак, S2_chrome.png — хром.
# Из них собирается развёртка корпуса: u — по окружности (34,56 мм; шов сзади, u = 0,5 — сторона кнопок),
# v — по длине ручки (0 — остриё, 1 — торец, 140 мм).
# Выход: pack/ — body_a.jpg 1024×4148 (296 пикс/см), body_n.png и body_orm.jpg вдвое реже (ART-90),
#        chrome_n.png, chrome_orm.jpg — плитка хрома 20 мм для клипа и кнопок, flag_a.jpg — флажок вещдока;
#        pack_low/ — всё вдвое реже.   ORM: R — AO, G — шероховатость, B — металл.
# Износ — базовый (слова автора: «не супер сильно загрязнённая… базовый износ»): волосяные царапины и следы пальцев с фото,
# плюс три следа обращения по месту: потёртость лака под концом клипа, чуть больше царапин там, где ручку держат, пыль в канавках.
# Запуск:  python tools/make_maps.py <gen34> <textures/pbr> [masks_dir]
import sys, os, json
import numpy as np
import cv2

GEN, OUT = sys.argv[1], sys.argv[2]
for d in ('src', 'pack', 'pack_low'): os.makedirs(os.path.join(OUT, d), exist_ok=True)
L_MM, PERIM = 140.0, 2 * np.pi * 5.5
AW = 1024; PX = AW / PERIM; AH = int(round(L_MM * PX))
u8 = lambda a: (np.clip(a, 0, 1) * 255).round().astype(np.uint8)
n_img = lambda n: cv2.cvtColor(((n * 0.5 + 0.5) * 255).round().astype(np.uint8), cv2.COLOR_RGB2BGR)
def lum(img): return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
def blur(a, mm, px=PX): return cv2.GaussianBlur(a, (0, 0), max(0.5, mm * px))
def med8(a, mm, px=PX):
    k = max(3, int(mm * px) | 1); return cv2.medianBlur(np.clip(a * 255, 0, 255).astype(np.uint8), k).astype(np.float32) / 255.0
def normal_from(h, strength):
    gx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3) * strength; gy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3) * strength
    n = np.dstack([-gx, gy, np.ones_like(h)]); return n / np.linalg.norm(n, axis=2, keepdims=True)
def resize_n(n, size):
    r = cv2.resize(n, size, interpolation=cv2.INTER_AREA); return r / np.linalg.norm(r, axis=2, keepdims=True)
def marks(L, px, both=False):
    """Следы на плоском образце: scr — тонкие царапины (0…1; на лаке светлые, на хроме — и светлые, и тёмные), haze — пятна и разводы со знаком."""
    Lm = med8(L, 0.5, px); d = np.abs(L - Lm) if both else (L - Lm); scr = np.clip(d - 0.012, 0, 1); scr = np.clip(scr / 0.07, 0, 1) ** 0.85
    haze = np.clip((blur(Lm, 0.8, px) - blur(Lm, 9.0, px)) * 9.0, -1, 1); return scr, haze
def wrap_u(f):   # без шва по окружности: края сводятся с половинным сдвигом
    w = f.shape[1]; t = np.arange(w, dtype=np.float32) / (w - 1); wx = np.clip(np.sin(np.pi * t) * 1.7, 0, 1)[None, :]
    return f * wx + np.roll(f, w // 2, 1) * (1 - wx)
def tile2(f):    # без шва по обеим осям
    h, w = f.shape[:2]
    def ramp(n): t = np.arange(n, dtype=np.float32) / (n - 1); return np.clip(np.sin(np.pi * t) * 1.6, 0, 1)
    wx = ramp(w)[None, :]; wy = ramp(h)[:, None]
    f = f * wx + np.roll(f, w // 2, 1) * (1 - wx); return f * wy + np.roll(f, h // 2, 0) * (1 - wy)
report = {'atlas': [AW, AH, round(PX * 10)]}

# ---------------------------------------------------------------- образцы
lac = cv2.imread(os.path.join(GEN, 'S1_lacquer.png')); chr_ = cv2.imread(os.path.join(GEN, 'S2_chrome.png'))
lac = cv2.rotate(lac, cv2.ROTATE_90_CLOCKWISE)                       # длинная сторона образца — вдоль ручки
lh = int(round(lac.shape[0] * AW / lac.shape[1])); lac = cv2.resize(lac, (AW, lh), interpolation=cv2.INTER_AREA)
l_scr, l_haze = marks(lum(lac), PX); l_scr = wrap_u(l_scr); l_haze = wrap_u(l_haze)
report['lacquer'] = {'covers_mm': round(lh / PX, 1), 'scr_cover_%': round(float((l_scr > 0.3).mean() * 100), 2)}
CT = int(round(30.0 * PX))                                            # плитка хрома: образец 30 × 30 мм
chr_ = cv2.resize(chr_, (CT, CT), interpolation=cv2.INTER_AREA); c_scr, c_haze = marks(lum(chr_), PX, True); c_scr = tile2(c_scr); c_haze = tile2(c_haze)
report['chrome'] = {'scr_cover_%': round(float((c_scr > 0.3).mean() * 100), 2)}

# ---------------------------------------------------------------- развёртка корпуса
ys, xs = np.mgrid[0:AH, 0:AW].astype(np.float32)
U = (xs + 0.5) / AW; Ymm = (AH - ys - 0.5) / PX                        # v = 1 — верх картинки: Y мм от острия
row = lambda y_mm: int(round(AH - y_mm * PX))
scr = np.zeros((AH, AW), np.float32); haze = np.zeros((AH, AW), np.float32)
def put(src_s, src_h, y0, y1, flip=False):
    r0, r1 = row(y1), row(y0); n = r1 - r0; s, h = src_s, src_h
    if flip: s, h = s[::-1, ::-1], h[::-1, ::-1]
    reps = int(np.ceil(n / s.shape[0])); s = np.tile(s, (reps, 1))[:n]; h = np.tile(h, (reps, 1))[:n]
    scr[r0:r1] = s; haze[r0:r1] = h
# хромовые части: плитка хрома, растянутая на окружность (34,56 мм ≈ плитка 30 мм + шов) — режется по ширине развёртки
cs = wrap_u(cv2.resize(c_scr, (AW, int(CT * AW / CT)), interpolation=cv2.INTER_LINEAR)); ch = wrap_u(cv2.resize(c_haze, (AW, int(CT * AW / CT)), interpolation=cv2.INTER_LINEAR))
put(l_scr, l_haze, 21.5, 79.0)                    # нижний ствол
put(l_scr, l_haze, 81.4, 129.3, flip=True)        # верхний ствол — тот же образец, перевёрнутый: рисунок царапин другой
put(cs, ch, 0.0, 21.5); put(cs[::-1], ch[::-1], 79.0, 81.4); put(np.roll(cs, AW // 3, 1), np.roll(ch, AW // 3, 1), 129.3, 140.0)
chrome = ((Ymm < 21.5) | ((Ymm >= 79.0) & (Ymm < 81.4)) | (Ymm >= 129.3)).astype(np.float32)
# следы обращения по месту
hand = np.clip(1 - np.abs(Ymm - 44.0) / 20.0, 0, 1)                    # где ручку держат: царапин чуть больше
scr = np.clip(scr * (1 + 0.35 * hand), 0, 1)
du = np.minimum(np.abs(U - 0.25), 1 - np.abs(U - 0.25)) * PERIM         # мм по окружности от линии клипа (u = 0,25)
rub = np.exp(-((du / 0.9) ** 2 + ((Ymm - 91.6) / 1.5) ** 2))            # потёртость лака под концом клипа
rs = np.random.RandomState(4949); nz = cv2.GaussianBlur(rs.uniform(0, 1, (AH, AW)).astype(np.float32), (0, 0), 0.12 * PX); nz = np.clip((nz - nz.mean()) / (nz.std() + 1e-6) * 0.5 + 0.5, 0, 1)
rub = rub * (0.5 + 0.5 * nz)
groove = np.zeros((AH, AW), np.float32)                                # канавки у кольца, колпачка и конуса: немного пыли
for y0, y1 in ((78.98, 79.24), (81.16, 81.42), (129.28, 129.52), (21.45, 21.66)): groove = np.maximum(groove, ((Ymm >= y0) & (Ymm <= y1)).astype(np.float32))
groove = blur(groove, 0.05) * (0.45 + 0.55 * nz)

LACQ = np.array([0.050, 0.047, 0.046], np.float32)                     # BGR: глубокий чёрный, едва тёплый
CHRO = np.array([0.80, 0.80, 0.795], np.float32)
alb_l = LACQ + 0.085 * scr[..., None] + 0.010 * np.clip(haze, 0, 1)[..., None] + 0.035 * rub[..., None]
alb_c = CHRO * (1 - 0.06 * np.clip(-haze, 0, 1)[..., None]) - 0.05 * scr[..., None]
alb = alb_l * (1 - chrome[..., None]) + alb_c * chrome[..., None]
alb = alb * (1 - 0.55 * groove[..., None]) + np.array([0.20, 0.20, 0.20], np.float32) * 0.55 * groove[..., None]
rough_l = 0.045 + 0.42 * scr + 0.07 * np.abs(haze) + 0.32 * rub
rough_c = 0.055 + 0.34 * scr + 0.05 * np.abs(haze)
rough = np.clip(rough_l * (1 - chrome) + rough_c * chrome + 0.5 * groove, 0.03, 1)
metal = chrome * (1 - groove)
ao = 1 - 0.5 * groove
h = 0.5 - 0.06 * scr + 0.012 * blur(haze, 0.6)                          # царапины — бороздки; лак чуть волнится
# печать: значки у кнопок — гравировка (слой из рисунка модели)
lp = os.path.join(sys.argv[3] if len(sys.argv) > 3 else os.path.join(GEN, 'masks'), 'proc_body_L.png')
if os.path.exists(lp):
    Lr = cv2.imread(lp, cv2.IMREAD_UNCHANGED); assert Lr.shape[:2] == (AH, AW), (Lr.shape, AH, AW)
    a_ = Lr[..., 3].astype(np.float32) / 255.0 * np.clip(1 - 0.4 * scr, 0.5, 1)
    alb = alb * (1 - a_[..., None]) + np.array([0.42, 0.42, 0.41], np.float32) * a_[..., None]; rough = np.clip(rough * (1 - a_) + 0.55 * a_, 0, 1); h = h - 0.05 * blur(a_, 0.02)
    report['print'] = True
nrm = normal_from(blur(h, 0.02), 1.6)
cv2.imwrite(os.path.join(OUT, 'src', 'body_albedo.png'), u8(alb)); cv2.imwrite(os.path.join(OUT, 'src', 'body_rough.png'), u8(rough))
orm = np.dstack([metal, rough, ao])
for d, k in (('pack', 1.0), ('pack_low', 0.5)):
    size = (int(AW * k), int(AH * k)); half = (size[0] // 2, size[1] // 2)
    cv2.imwrite(os.path.join(OUT, d, 'body_a.jpg'), cv2.resize(u8(alb), size, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 92])
    cv2.imwrite(os.path.join(OUT, d, 'body_orm.jpg'), cv2.resize(u8(orm), half, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 92])
    cv2.imwrite(os.path.join(OUT, d, 'body_n.png'), n_img(resize_n(nrm, half)), [cv2.IMWRITE_PNG_COMPRESSION, 9])

# ---------------------------------------------------------------- плитка хрома (клип, кнопки): 20 мм на повтор
t_s = cv2.resize(c_scr, (512, 512), interpolation=cv2.INTER_AREA); t_h = cv2.resize(c_haze, (512, 512), interpolation=cv2.INTER_AREA)
t_rough = np.clip(0.055 + 0.34 * t_s + 0.05 * np.abs(t_h), 0, 1); t_n = normal_from(cv2.GaussianBlur(0.5 - 0.06 * t_s, (0, 0), 0.6), 1.6)
for d, s_ in (('pack', 512), ('pack_low', 256)):
    cv2.imwrite(os.path.join(OUT, d, 'chrome_orm.jpg'), u8(cv2.resize(np.dstack([np.ones_like(t_rough), t_rough, np.ones_like(t_rough)]), (s_, s_), interpolation=cv2.INTER_AREA)), [cv2.IMWRITE_JPEG_QUALITY, 92])
    cv2.imwrite(os.path.join(OUT, d, 'chrome_n.png'), n_img(resize_n(t_n, (s_, s_))))

# ---------------------------------------------------------------- флажок вещдока (вёрстка tools/label_make.html)
fp = os.path.join(OUT, 'src', 'flag_albedo.png')
if os.path.exists(fp):
    im = cv2.imread(fp)
    cv2.imwrite(os.path.join(OUT, 'pack', 'flag_a.jpg'), im, [cv2.IMWRITE_JPEG_QUALITY, 93])
    cv2.imwrite(os.path.join(OUT, 'pack_low', 'flag_a.jpg'), cv2.resize(im, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 93])
    report['flag'] = {'mm': [24, 8], 'px_per_cm_full': 400}
json.dump(report, open(os.path.join(OUT, '_maps_report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(report, ensure_ascii=False))
