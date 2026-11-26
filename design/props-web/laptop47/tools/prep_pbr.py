# -*- coding: utf-8 -*-
# prep_pbr.py — готовит карты GEN18 (textures/pbr/*) для страницы: textures/pbr/pack/*
# Ничего не генерирует: только маски, упаковка каналов и производные карты из тех же фото.
#   {грань}_a.jpg   — цвет (sRGB); на верхней панели закрашены петли и выступ рамки под стрелки
#   {грань}_n.jpg   — нормали (OpenGL +Y), JPEG 4:4:4
#   {грань}_orc.jpg — R: AO, G: шероховатость, B: «щели» (где может лежать пыль), JPEG 4:4:4
#   left_d/right_d/bottom_d.png — глубина для displacementMap (белое — глубже): отверстия портов,
#       щели решёток. Сделана из яркости фото (исходный *_height — по сути яркость: металл гнёзд
#       на нём «выше» пластика, для смещения сетки он не годится без чистки).
#   keys_wear.jpg   — крупные пятна лоска клавиатуры (размытая шероховатость фото в нише клавиш)
#   grain_a/grain_n/brushed_n/dust/smudge — макро-плитки (пережаты, по сути без изменений)
#   Финализация 26.11:
#   back/front — зад и перед (GEN19; карты из make_maps.py: python tools/make_maps.py <gen19> textures/pbr back front)
#   {left,right,back}_d.png — теперь RGB: R — глубина, G — маска металла гнёзд (для metalness)
#   label_a/_n/_r.jpg — ярлык бюро (карты снимает tools/label_make.py со страницы tools/label_make.html)
#   дно: зачищен «пустой прямоугольник» на старом месте наклейки HEXON; панель: выступ под стрелки закрыт целиком
#   textures/pbr/pack_low/ — облегчённый набор для телефона и для вещи «на столе» (те же имена, меньше размер);
#   рядом с модулем — sticker_47_v4_rgba_low.png и sticker_47_v4_rough_low.png
# Запуск: python tools/prep_pbr.py   (из папки страницы)
import os
import numpy as np
from PIL import Image, ImageFilter

SRC = 'textures/pbr/'
OUT = 'textures/pbr/pack/'
LOW = 'textures/pbr/pack_low/'
os.makedirs(OUT, exist_ok=True); os.makedirs(LOW, exist_ok=True)
Y_TOP, Y_BOT = 31.37, -1.04      # кадр фото боков, зада и переда по высоте, мм (рамка вещи в ортовиде)
W, D = 335.0, 238.0


def load(name, mode=None):
    if not os.path.exists(SRC + name) and name.endswith('.jpg') and os.path.exists(SRC + name[:-4] + '.png'):
        name = name[:-4] + '.png'          # make_maps.py пишет нормали .png, прежние копии для страницы были .jpg
    im = Image.open(SRC + name)
    return im.convert(mode) if mode else im


def blur(a, s):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(s))).astype(np.float32)


def feather_mask(shape, x0, y0, x1, y1, f):
    m = np.zeros(shape[:2], np.float32)
    m[max(0, y0):y1, max(0, x0):x1] = 255
    return blur(m, f) / 255.0


def save_jpg(arr, name, q=90, sub=0):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(OUT + name, quality=q, subsampling=sub, optimize=True)


def cavity(ao):
    c = np.clip((208.0 - blur(ao, 1.2)) / 70.0, 0, 1) * 255   # лёгкий шум AO пылью не считается
    c = np.asarray(Image.fromarray(c.astype(np.uint8)).filter(ImageFilter.MaxFilter(7))).astype(np.float32)
    return blur(c, 2.5)


def depth_from_lum(rgb, lo=10.0, hi=34.0):
    """Тёмное на фото = отверстие. Светлые соринки внутри щелей убираются (минимум, потом максимум)."""
    L = Image.fromarray(rgb).convert('L')
    L = L.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    L = np.asarray(L).astype(np.float32)
    return np.clip((hi - L) / (hi - lo), 0, 1)


faces = {}
for f in ['deck', 'bottom', 'lid', 'bezel', 'left', 'right', 'back', 'front']:
    faces[f] = dict(
        a=np.asarray(load(f + '_albedo.jpg', 'RGB')).astype(np.float32),
        n=np.asarray(load(f + '_normal.jpg', 'RGB')).astype(np.float32),
        r=np.asarray(load(f + '_rough.jpg', 'L')).astype(np.float32),
        ao=np.asarray(load(f + '_ao.jpg', 'L')).astype(np.float32),
    )

# ---------- верхняя панель: закрасить то, что у модели сделано геометрией ----------
dk = faces['deck']
H, Wp = dk['r'].shape
X = lambda mm: int(round((mm + W / 2) / W * Wp))
Z = lambda mm: int(round((mm + D / 2) / D * H))


def patch_copy(face, x0, y0, x1, y1, sx, sy, f=10, flat_normal=True, ao_to=None):
    """Закрыть прямоугольник куском чистого пластика той же грани (сдвиг sx, sy), с мягким краем."""
    m = feather_mask(face['r'].shape, x0, y0, x1, y1, f)
    for k in ['a', 'r', 'ao', 'n']:
        src = np.roll(face[k], (-sy, -sx), axis=(0, 1))
        if k == 'n' and flat_normal:
            src = np.zeros_like(face[k]); src[..., 0] = 128; src[..., 1] = 128; src[..., 2] = 255
        if k == 'ao' and ao_to is not None:
            src = np.full_like(face[k], ao_to)
        mm = m[..., None] if face[k].ndim == 3 else m
        face[k] = face[k] * (1 - mm) + src * mm


# петли (у модели — свои бочонки и валик крышки): чистый пластик с упора для ладони (z ≈ +84…+100 мм)
for sgn in (-1, 1):
    xa, xb = sorted((sgn * 114.0, sgn * 145.5))
    patch_copy(dk, X(xa), -40, X(xb), Z(-103.5), 0, Z(84.0), f=7, ao_to=205)
# выступ рамки клавиатуры под стрелки (на фото блок стрелок ниже, чем у модели): копия полосы слева.
# 26.11: закрывается весь выступ до нижней кромки (z до 39,5 мм) — раньше только верх, и ниже оставались
# его левая грань и тень: место читалось «ровнее соседних». Копия берётся с рельефом и шероховатостью.
patch_copy(dk, X(90.5), Z(25.3), X(150.5), Z(39.5), X(-59.0) - X(0.0), 0, f=5, flat_normal=False)


# ---------- дно: «пустой прямоугольник» на старом месте наклейки ----------
# На фото дна генератор оставил место под наклейку чуть темнее и глаже. Наклейка уехала к углу, место открыто:
# закрыть чистым пластиком той же грани (две заплаты с разных мест, чтобы не читался повтор), крупный тон —
# по окружению (иначе заплата видна ступенькой яркости).
def patch_clean(face, x0, y0, x1, y1, sx, sy, f=9, sigma=110):
    import cv2                                   # точное (не 8-битное) размытие: тон окружения тянется далеко внутрь
    fb = lambda a_, s_: cv2.GaussianBlur(a_.astype(np.float32), (0, 0), s_)
    m = feather_mask(face['r'].shape, x0, y0, x1, y1, f)
    hard = np.ones(face['r'].shape, np.float32); hard[y0 - 2 * f:y1 + 2 * f, x0 - 2 * f:x1 + 2 * f] = 0
    den = np.maximum(fb(hard, sigma), 1e-6)
    for k in ['a', 'r', 'ao', 'n']:
        src = np.roll(face[k], (-sy, -sx), axis=(0, 1))
        if k in ('a', 'r'):
            chans = src[..., None] if src.ndim == 2 else src
            cur = face[k][..., None] if face[k].ndim == 2 else face[k]
            out = np.empty_like(chans)
            for c in range(chans.shape[2]):
                around = fb(cur[..., c] * hard, sigma) / den              # тон окружения, протянутый внутрь
                out[..., c] = chans[..., c] - fb(chans[..., c], 30) + around
            src = out[..., 0] if src.ndim == 2 else out
        mm = m[..., None] if face[k].ndim == 3 else m
        face[k] = face[k] * (1 - mm) + src * mm


bt = faces['bottom']; bh_, bw_ = bt['r'].shape
BS = bw_ / 2048.0
bq = lambda *v: [int(round(t * BS)) for t in v]
patch_clean(bt, *bq(160, 720, 695, 955, 0, -322))
patch_clean(bt, *bq(160, 945, 695, 1185, 110, -513))


# ---------- бока, зад, перед: тёплые пятна в серое ----------
# Пыль и сор на фото боков вышли рыжеватыми; под тёплой лампой решётка выдува «ржавела».
# Всё, что теплее нейтрального, приводится к серому (синяя вставка VGA не трогается: у неё b > r).
def neutralize(face, keep=0.15):
    a = face['a']; g = a.mean(2, keepdims=True)
    warm = np.clip((a[..., 0] - a[..., 2]) / 10.0, 0, 1)[..., None]
    face['a'] = a * (1 - warm) + (g + (a - g) * keep) * warm


for f in ['left', 'right', 'back', 'front']:
    neutralize(faces[f])

# ---------- цвет без «пятен» ----------
# На фото затёртые места (тачпад, отпечатки на крышке и рамке) вышли тёмными пятнами в цвете.
# По паспорту износ — только лоск: крупные пятна из цвета убираются (остаются в карте шероховатости),
# мелкий рисунок поверхности сохраняется.
def flatten(face, x0, y0, x1, y1, sigma=14, keep=0.15, f=6):
    a = face['a']
    m = feather_mask(a.shape, x0, y0, x1, y1, f)
    hard = np.zeros(a.shape[:2], np.float32); hard[max(0, y0):y1, max(0, x0):x1] = 1
    den = np.maximum(blur(hard * 255, sigma) / 255.0, 1e-3)
    for c in range(3):
        low = blur(a[..., c] * hard, sigma) / den
        base = np.median(a[max(0, y0):y1, max(0, x0):x1, c])
        a[..., c] = a[..., c] - (low - base) * (1 - keep) * m


flatten(dk, X(-48.3), Z(40.4), X(24.4), Z(85.0))                       # площадка тачпада
flatten(dk, X(-48.3), Z(86.9), X(24.4), Z(99.9))                       # кнопки тачпада
ld = faces['lid']; lh, lw = ld['r'].shape
flatten(ld, int(lw * 0.012), int(lh * 0.018), int(lw * 0.988), int(lh * 0.982), sigma=18)
bz = faces['bezel']; bh, bw = bz['r'].shape
BXp = lambda mm: int(round((mm + W / 2) / W * bw))
BYp = lambda mm: int(round(mm / 226.0 * bh))                              # мм от свободного края вниз
flatten(bz, BXp(-164.0), BYp(1.5), BXp(164.0), BYp(11.0), sigma=16)      # верхняя планка рамки
flatten(bz, BXp(-164.0), BYp(12.0), BXp(-155.0), BYp(205.0), sigma=16)   # левая стойка
flatten(bz, BXp(155.0), BYp(12.0), BXp(164.0), BYp(205.0), sigma=16)     # правая стойка

# ---------- упаковка граней ----------
for f, m in faces.items():
    save_jpg(m['a'], f + '_a.jpg', 90, 0)
    save_jpg(m['n'], f + '_n.jpg', 90, 0)
    save_jpg(np.dstack([m['ao'], m['r'], cavity(m['ao'])]), f + '_orc.jpg', 88, 0)


# ---------- глубина для смещения сетки ----------
def side_depth(f):
    rgb = np.asarray(load(f + '_albedo.jpg', 'RGB'))
    d = depth_from_lum(rgb)
    r, g, b = [rgb[..., i].astype(np.float32) for i in range(3)]
    blue = np.clip((b - r - 25.0) / 30.0, 0, 1)            # синяя вставка VGA утоплена
    d = np.maximum(d, blue * 0.45)
    h, w = d.shape
    # только плоская часть бока базы (кадр фото — рамка вещи: y от -1,04 до 31,37 мм снизу вверх)
    yy = (Y_TOP - (np.arange(h) + 0.5) / h * (Y_TOP - Y_BOT))[:, None]
    zz = ((np.arange(w) + 0.5) / w * D - D / 2)[None, :]
    if f == 'right':
        zz = -zz
    top = (18.5 + 3.0 * (D / 2 - zz) / D) - 3.4            # высота базы минус скругление кромки
    win = np.clip((yy - 6.3) / 0.6, 0, 1) * np.clip((top - yy) / 0.6, 0, 1) * np.clip((D / 2 - 10.0 - np.abs(zz)) / 0.8, 0, 1)
    d = blur(d * win * 255, 2.2)
    # металл гнёзд: светлое и нейтральное в окне портов (u — мм вдоль фото слева направо)
    u = ((np.arange(w) + 0.5) / w * D)[None, :]
    u0, u1 = METAL_WIN[f]
    mwin = np.clip((u - u0) / 1.0, 0, 1) * np.clip((u1 - u) / 1.0, 0, 1) * np.clip((yy - 5.5) / 0.6, 0, 1) * np.clip((19.0 - yy) / 0.6, 0, 1)
    save_dm(d, metal_mask(rgb, mwin), f, (2048, 279))


METAL_WIN = {'left': (29.0, 112.0), 'right': (158.0, 229.0)}


def metal_mask(rgb, win, thr=78.0):
    r, g, b = [rgb[..., i].astype(np.float32) for i in range(3)]
    L = 0.3 * r + 0.59 * g + 0.11 * b
    m = np.clip((L - thr) / 30.0, 0, 1) * np.clip(1.0 - (b - r - 12.0) / 12.0, 0, 1) * win
    m = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))   # пылинки — не металл
    return blur(np.asarray(m).astype(np.float32), 1.0)


def save_dm(d, met, f, size):
    im = Image.fromarray(np.dstack([d, met, np.zeros_like(d)]).clip(0, 255).astype(np.uint8)).resize(size, Image.LANCZOS)
    im.save(OUT + f + '_d.png', optimize=True)


side_depth('left')
side_depth('right')

# зад: глубина только в окнах гнёзд (Ethernet слева для зрителя, USB справа), швы батареи — нормалями
rgb = np.asarray(load('back_albedo.jpg', 'RGB'))
d = depth_from_lum(rgb)
h, w = d.shape
yy = (Y_TOP - (np.arange(h) + 0.5) / h * (Y_TOP - Y_BOT))[:, None]
u = ((np.arange(w) + 0.5) / w * W)[None, :]
BACK_PORTS = [(29.0, 53.0), (297.0, 318.0)]
win = sum(np.clip((u - a) / 0.8, 0, 1) * np.clip((b - u) / 0.8, 0, 1) for a, b in BACK_PORTS) * np.clip((yy - 6.3) / 0.6, 0, 1) * np.clip((18.2 - yy) / 0.6, 0, 1)
save_dm(blur(d * win * 255, 1.6), metal_mask(rgb, win, 64.0), 'back', (w, h))

rgb = np.asarray(load('bottom_albedo.jpg', 'RGB'))
d = depth_from_lum(rgb, 12.0, 30.0)
h, w = d.shape
BX = lambda mm: (W / 2 - mm) / W * w        # дно: X зеркален
BZ = lambda mm: (mm + D / 2) / D * h
win = np.zeros_like(d)
for (xa, xb, za, zb) in [(0.5, 19.5, -46.0, 62.0), (-130.0, -89.0, -42.0, -1.0)]:
    x0, x1 = sorted((int(BX(xa)), int(BX(xb))))
    win[int(BZ(za)) + 6:int(BZ(zb)) - 6, x0 + 6:x1 - 6] = 1
d = blur(d * blur(win * 255, 3), 1.6)
Image.fromarray(d.astype(np.uint8)).save(OUT + 'bottom_d.png', optimize=True)

# ---------- лоск клавиатуры по месту (только крупные пятна) ----------
TR = dict(x0=-142.5, x1=142.5, z0=-86.0, z1=25.5)
r = faces['deck']['r']
crop = r[Z(TR['z0']):Z(TR['z1']), X(TR['x0']):X(TR['x1'])]
lf = blur(crop, 16)                                        # ≈ 2.6 мм
lf = np.clip(128 + (lf - np.median(lf)) * 1.6, 0, 255)
Image.fromarray(lf.astype(np.uint8)).resize((512, 200), Image.LANCZOS).save(OUT + 'keys_wear.jpg', quality=88)

# ---------- макро-плитки ----------
load('macro_grain_albedo.jpg', 'RGB').save(OUT + 'grain_a.jpg', quality=88)
load('macro_grain_normal.jpg', 'RGB').save(OUT + 'grain_n.jpg', quality=90, subsampling=0)
load('macro_brushed_normal.jpg', 'RGB').save(OUT + 'brushed_n.jpg', quality=90, subsampling=0)
load('macro_dust_mask.png', 'L').save(OUT + 'dust.jpg', quality=88)
load('macro_smudge.png', 'L').save(OUT + 'smudge.jpg', quality=88)
# ---------- ярлык бюро ----------
if os.path.exists(SRC + 'label_albedo.png'):
    load('label_albedo.png', 'RGB').save(OUT + 'label_a.jpg', quality=92, subsampling=0)
    load('label_normal.png', 'RGB').save(OUT + 'label_n.jpg', quality=92, subsampling=0)
    load('label_rough.png', 'L').save(OUT + 'label_r.jpg', quality=90)


# ---------- облегчённый набор (телефон; вещь «на столе») ----------
# ART-63: в руках ≈ 60 пикс/см, надписи 200–250; на столе ≈ 15. Полный набор — 2048 px на 335 мм (61 пикс/см).
# Облегчённый: грани 1024 (≈ 30 пикс/см), карта AO/шероховатость/щели — 512, плитки 512, ярлык 1024 (146 пикс/см).
def low_size(name, w, h):
    stem = name.rsplit('.', 1)[0]
    if name.endswith('_d.png'): return w // 2, h // 2
    if stem == 'keys_wear': return w, h
    if stem in ('grain_a', 'grain_n', 'brushed_n', 'dust', 'smudge'): return 512, 512
    if stem == 'label_a': tw = 1024
    elif stem.startswith('label_'): tw = 512
    elif stem.endswith('_orc'): tw = 512
    elif stem.startswith('bezel'): tw = 768
    else: tw = 1024
    return tw, max(2, int(round(h * tw / w)))


def shrink(im, size, normal=False):
    im = im.resize(size, Image.LANCZOS)
    if normal:                                   # после уменьшения нормали снова единичной длины
        n = np.asarray(im).astype(np.float32) / 127.5 - 1.0
        n /= np.maximum(np.linalg.norm(n, axis=2, keepdims=True), 1e-4)
        im = Image.fromarray(((n * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8))
    return im


for n in sorted(os.listdir(OUT)):
    im = Image.open(OUT + n)
    im2 = shrink(im, low_size(n, *im.size), normal=n.endswith('_n.jpg'))
    if n.endswith('.png'): im2.save(LOW + n, optimize=True)
    else: im2.save(LOW + n, quality=88, subsampling=0)
for src, dst, tw in [('sticker_47_v4_rgba.png', 'sticker_47_v4_rgba_low.png', 1024), ('sticker_47_v4_rough.png', 'sticker_47_v4_rough_low.png', 512)]:
    if os.path.exists(src):
        im = Image.open(src); im.resize((tw, int(round(im.size[1] * tw / im.size[0]))), Image.LANCZOS).save(dst, optimize=True)
tot = sum(os.path.getsize(LOW + n) for n in os.listdir(LOW))
print('pack_low total MB', round(tot / 1e6, 2), len(os.listdir(LOW)), 'files')

print('grain albedo mean', np.asarray(load('macro_grain_albedo.jpg', 'RGB')).reshape(-1, 3).mean(0).round(1))
for f, m in faces.items():
    print(f, 'albedo median', np.median(m['a'].reshape(-1, 3), 0))
tot = sum(os.path.getsize(OUT + n) for n in os.listdir(OUT))
print('pack total MB', round(tot / 1e6, 2), len(os.listdir(OUT)), 'files')
