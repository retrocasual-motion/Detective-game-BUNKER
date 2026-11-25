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
# Запуск: python tools/prep_pbr.py   (из папки страницы)
import os
import numpy as np
from PIL import Image, ImageFilter

SRC = 'textures/pbr/'
OUT = 'textures/pbr/pack/'
os.makedirs(OUT, exist_ok=True)
W, D = 335.0, 238.0


def load(name, mode=None):
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
for f in ['deck', 'bottom', 'lid', 'bezel', 'left', 'right']:
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
# выступ рамки клавиатуры под стрелки (на фото блок стрелок ниже, чем у модели): копия полосы слева
patch_copy(dk, X(90.0), Z(25.3), X(146.0), Z(30.5), X(-58.0) - X(0.0), 0, f=4, flat_normal=False)

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
    # только плоская часть бока базы (кадр фото: y от -1 до 33 мм снизу вверх)
    yy = (33.0 - (np.arange(h) + 0.5) / h * 34.0)[:, None]
    zz = ((np.arange(w) + 0.5) / w * D - D / 2)[None, :]
    if f == 'right':
        zz = -zz
    top = (18.5 + 3.0 * (D / 2 - zz) / D) - 3.4            # высота базы минус скругление кромки
    win = np.clip((yy - 6.3) / 0.6, 0, 1) * np.clip((top - yy) / 0.6, 0, 1) * np.clip((D / 2 - 10.0 - np.abs(zz)) / 0.8, 0, 1)
    d = blur(d * win * 255, 2.2)
    Image.fromarray(d.astype(np.uint8)).resize((2048, 279), Image.LANCZOS).save(OUT + f + '_d.png', optimize=True)


side_depth('left')
side_depth('right')

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
print('grain albedo mean', np.asarray(load('macro_grain_albedo.jpg', 'RGB')).reshape(-1, 3).mean(0).round(1))
for f, m in faces.items():
    print(f, 'albedo median', np.median(m['a'].reshape(-1, 3), 0))
tot = sum(os.path.getsize(OUT + n) for n in os.listdir(OUT))
print('pack total MB', round(tot / 1e6, 2), len(os.listdir(OUT)), 'files')
