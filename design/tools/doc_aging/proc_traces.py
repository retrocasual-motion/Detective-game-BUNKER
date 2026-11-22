"""Следы-геометрия, которые скрипт рисует сам (без текстуры), сразу с рельефом (ART-39).
Каждая функция: (rng, h, w, t) → (множитель HxWx3, добавка рельефа HxW, маска дыры HxW).
Маска дыры = бумаги нет (дырокол, оторванная перфорация): там виден фон скана.
Размеры — в миллиметрах листа A4 (210 мм по ширине).

Виды (в рецепте "kind": "proc:<вид>"):
  punch      — два отверстия дырокола у левого края (ISO 838: Ø6 мм, 80 мм между центрами)
  staple     — скоба в левом верхнем углу, по диагонали
  corner     — чуть загнутый угол: залом поперёк угла
  perforation — край, оторванный по перфорации (верх листа)
  clip       — след скрепки у верхнего края: вдавленная петля
"""
import cv2, numpy as np


def _mm(w):
    return w / 210.0


def _blank(h, w):
    return np.ones((h, w, 3), np.float32), np.zeros((h, w), np.float32), np.zeros((h, w), np.float32)


def punch(rng, h, w, t):
    mult, rel, hole = _blank(h, w)
    k = _mm(w)
    cx = (12 + rng.uniform(-1.5, 1.5)) * k
    mid = h / 2 + rng.uniform(-3, 3) * k
    r = 3.0 * k
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    for dy in (-40 * k, 40 * k):
        cy = mid + dy + rng.uniform(-0.8, 0.8) * k
        d = np.hypot(yy - cy, xx - cx - rng.uniform(-0.5, 0.5) * k)
        hole = np.maximum(hole, np.clip(r - d + 0.5, 0, 1))
        ring = np.exp(-((d - r - 0.6 * k) / (0.6 * k)) ** 2)
        rel -= 0.25 * ring                          # край отверстия вдавлен
        mult *= (1 - 0.05 * ring)[..., None]        # и чуть темнее
    return mult, rel, hole


def staple(rng, h, w, t):
    mult, rel, hole = _blank(h, w)
    k = _mm(w)
    L = rng.uniform(11, 13) * k
    ang = np.deg2rad(rng.uniform(35, 55))
    x0, y0 = rng.uniform(7, 11) * k, rng.uniform(7, 11) * k
    p1 = np.array([x0, y0 + L * np.sin(ang)]); p2 = np.array([x0 + L * np.cos(ang), y0])
    img = np.zeros((h, w), np.float32)
    cv2.line(img, tuple(int(v) for v in p1), tuple(int(v) for v in p2), 1.0, max(1, int(0.45 * k)), cv2.LINE_AA)
    crown = cv2.GaussianBlur(img, (0, 0), 0.6)
    # металл: серый с бликом по одной стороне
    hi = np.clip(np.roll(crown, -1, axis=0) - crown, 0, 1)    # блик по верхней кромке проволоки
    tone = np.array([0.62, 0.63, 0.66], np.float32)              # серебристый, не чёрный
    mult *= (1 - crown[..., None] * (1 - tone)) + 0.25 * hi[..., None]
    rel += 0.35 * cv2.GaussianBlur(img, (0, 0), 1.0) - 0.12 * cv2.GaussianBlur(img, (0, 0), 2.5 * k)
    for p in (p1, p2):                              # проколы на концах
        cv2.circle(img, tuple(int(v) for v in p), max(2, int(0.5 * k)), 1.0, -1)
        dot = np.zeros((h, w), np.float32)
        cv2.circle(dot, tuple(int(v) for v in p), max(2, int(0.45 * k)), 1.0, -1)
        mult *= (1 - 0.35 * cv2.GaussianBlur(dot, (0, 0), 0.8))[..., None]
    return mult, rel, hole


def corner(rng, h, w, t):
    mult, rel, hole = _blank(h, w)
    k = _mm(w)
    cy, cx = rng.choice([(0, w), (h, w), (h, 0)])   # левый верх занят скобой
    s = rng.uniform(14, 26) * k
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dist = (np.abs(yy - cy) + np.abs(xx - cx)) - s   # линия залома поперёк угла
    line = np.exp(-(dist / (0.5 * k)) ** 2)
    inside = (dist < 0).astype(np.float32)
    rel += 0.6 * line - 0.15 * inside * np.clip(-dist / s, 0, 1)
    mult *= (1 - 0.06 * line - 0.03 * inside)[..., None]
    return mult, rel, hole


def perforation(rng, h, w, t):
    mult, rel, hole = _blank(h, w)
    k = _mm(w)
    step = 2.0 * k
    base = 1.2 * k
    edge = np.zeros(w, np.float32)
    x = 0.0
    while x < w:                                    # зубцы: часть перемычек порвана неровно
        seg = int(step)
        depth = base + (rng.uniform(-0.3, 0.5) if rng.random() < 0.75 else rng.uniform(0.5, 1.6)) * k
        edge[int(x):int(x) + seg] = depth
        x += step
    edge = cv2.GaussianBlur(edge[None, :], (0, 0), 0.8)[0] + np.random.default_rng(rng.randrange(1 << 30)).normal(0, 0.15 * k, w)
    yy = np.arange(h, dtype=np.float32)[:, None]
    hole = np.clip(edge[None, :] - yy + 0.5, 0, 1)
    fib = np.exp(-((yy - edge[None, :]) / (0.8 * k)) ** 2)
    rel += 0.1 * fib
    mult *= (1 - 0.03 * fib)[..., None]
    return mult, rel, hole


def clip(rng, h, w, t):
    mult, rel, hole = _blank(h, w)
    k = _mm(w)
    x = rng.uniform(60, 150) * k
    img = np.zeros((h, w), np.float32)
    wd, ln = 7 * k, rng.uniform(24, 30) * k
    for off, l in ((0, ln), (2.2 * k, ln * 0.7)):  # две петли скрепки
        cv2.ellipse(img, (int(x), int(off + l / 2 - 2 * k)), (int(wd / 2 - off), int(l / 2)), 0, 0, 360, 1.0,
                    max(2, int(0.5 * k)), cv2.LINE_AA)
    img[int(2 * k):, :] *= 1.0
    g = cv2.GaussianBlur(img, (0, 0), 1.6 * k / 2)
    rel -= 0.12 * g                                 # вдавлено, краски нет: видно только под лампой
    mult *= (1 - 0.01 * g)[..., None]
    return mult, rel, hole


KINDS = {'punch': punch, 'staple': staple, 'corner': corner, 'perforation': perforation, 'clip': clip}
