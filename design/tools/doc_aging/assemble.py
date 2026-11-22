"""Сборка состаренного документа v2 (DOC-A, ART-36): вёрстка → бумага → документ умножением →
следы из библиотеки по рецепту документа (WEAR.md) → профиль носителя (раздел 4) → проверка
читаемости. Текст вёрстки не меняется: всё, что поверх, только умножается.

python -I assemble.py <рецепт.json> <префикс рендера> <library> <выход.png> [--seed N] [--log путь]
  префикс рендера — то, что написал render.js: <префикс>_print.png, _<рука>.png, _boxes.json.
  library — E:/Projects/bunker-media/references/traces/library (слои — см. extract_wear.py).
  --log — журнал использования (по умолчанию <library>/_usage.json): один экземпляр текстуры не
          идёт два раза подряд в одном виде следа.
Рядом с выходом пишется <выход>.json: зерно, взятые экземпляры, параметры, итог проверки.
"""
import argparse, json, os, random, glob, zlib
import cv2, numpy as np

NEUTRAL = 200.0


# ---------- служебное ----------
def load_rgb(p):
    a = cv2.imread(p, cv2.IMREAD_COLOR)
    if a is None:
        raise SystemExit(f'нет файла: {p}')
    return cv2.cvtColor(a, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0


def lowfreq_noise(rng, h, w, cell, lo=0.0, hi=1.0):
    g = np.random.default_rng(rng.randrange(1 << 30))
    n = g.random((max(2, h // cell + 2), max(2, w // cell + 2))).astype(np.float32)
    n = cv2.resize(n, (w, h), interpolation=cv2.INTER_CUBIC)
    return lo + (hi - lo) * np.clip(n, 0, 1)


def pick_instance(kind_dir, prefer, usage, kind, rng):
    files = sorted(glob.glob(os.path.join(kind_dir, '*.png')))
    if prefer:
        pf = [f for f in files if any(os.path.basename(f).startswith(p) for p in prefer)]
        files = pf or files
    if not files:
        return None
    last = usage.get(kind, [])[-1:] or [None]
    cand = [f for f in files if os.path.basename(f) != last[0]] or files
    return cand[rng.randrange(len(cand))]


def fit_crop(tex, h, w, rng, crop=(0.55, 1.0), rot90=True, flip=True):
    """Случайный кусок текстуры, растянутый на h×w: положение, масштаб (обрезка), поворот, отражение."""
    if rot90 and rng.random() < 0.5:
        tex = np.ascontiguousarray(np.rot90(tex, rng.choice([1, 3])))
    if flip and rng.random() < 0.5:
        tex = tex[:, ::-1]
    if flip and rng.random() < 0.5:
        tex = tex[::-1]
    th, tw = tex.shape[:2]
    asp = w / h
    s = rng.uniform(*crop)
    ch = int(min(th, tw / asp) * s); cw = int(ch * asp)
    y = rng.randrange(0, th - ch + 1); x = rng.randrange(0, tw - cw + 1)
    return cv2.resize(np.ascontiguousarray(tex[y:y + ch, x:x + cw]), (w, h), interpolation=cv2.INTER_AREA)


def place_mask(place, h, w, rng, t):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    rough = lowfreq_noise(rng, h, w, max(8, w // 40), 0.6, 1.4)
    if place == 'cover':
        return np.ones((h, w), np.float32)
    if place == 'edge':
        side = rng.choice(t.get('sides', ['top', 'bottom', 'left', 'right']))
        d = {'top': yy, 'bottom': h - 1 - yy, 'left': xx, 'right': w - 1 - xx}[side]
        depth = w * rng.uniform(*t.get('depth', [0.04, 0.09]))
        m = np.clip(1 - d / (depth * rough), 0, 1) ** 1.6
        # не по всей длине: затухает к одному концу
        along = (xx / w if side in ('top', 'bottom') else yy / h)
        if rng.random() < 0.5:
            along = 1 - along
        m *= np.clip(0.25 + along * rng.uniform(0.9, 1.6), 0, 1)
        t['_side'] = side
        return m
    if place == 'corner':
        cy, cx = rng.choice([(0, 0), (0, w), (h, 0), (h, w)])
        r = w * rng.uniform(*t.get('radius', [0.08, 0.16]))
        d = np.hypot(yy - cy, xx - cx)
        return np.clip(1 - d / (r * rough), 0, 1) ** 1.3
    if place == 'spot':
        cx = w * rng.uniform(*t.get('x', [0.1, 0.9])); cy = h * rng.uniform(*t.get('y', [0.1, 0.9]))
        r = w * rng.uniform(*t.get('radius', [0.06, 0.12]))
        d = np.hypot(yy - cy, xx - cx)
        return np.clip(1.2 - d / (r * rough), 0, 1)
    raise SystemExit(f'неизвестное размещение: {place}')


def keep_mask(boxes, h, w, pad):
    m = np.zeros((h, w), np.float32)
    for b in boxes:
        x0, y0 = int(max(0, b['x'] - pad)), int(max(0, b['y'] - pad))
        x1, y1 = int(min(w, b['x'] + b['w'] + pad)), int(min(h, b['y'] + b['h'] + pad))
        m[y0:y1, x0:x1] = 1
    return cv2.GaussianBlur(m, (0, 0), pad / 2 + 1)


# ---------- рукопись: дрожание, нажим, мазок ----------
def hand_layer(layer, rng, cfg):
    h, w = layer.shape[:2]
    dens = 1.0 - layer                                   # плотность чернил по каналам
    amp = cfg.get('tremor', 1.0) * 1.3 * (w / 1588)
    cell = int(28 * w / 1588)
    dx = (lowfreq_noise(rng, h, w, cell) - 0.5) * 2 * amp
    dy = (lowfreq_noise(rng, h, w, cell) - 0.5) * 2 * amp
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    dens = cv2.remap(dens, gx + dx, gy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    p = cfg.get('pressure', [0.82, 1.0])                 # нажим: неровная плотность по строке
    dens *= lowfreq_noise(rng, h, w, int(60 * w / 1588), p[0], p[1])[..., None]
    dens = cv2.GaussianBlur(dens, (0, 0), 0.55)           # шарик ручки чуть растекается
    if cfg.get('smear'):                                  # ручка чуть мажет: слабый след вдоль строки
        k = int(rng.uniform(10, 18) * w / 1588)
        ker = np.zeros((k, k), np.float32); ker[k // 2, :] = 1; ker /= k
        ang = rng.uniform(-12, 4)
        M = cv2.getRotationMatrix2D((k / 2, k / 2), ang, 1)
        ker = cv2.warpAffine(ker, M, (k, k)); ker /= ker.sum()
        sm = cv2.filter2D(dens, -1, ker)
        ys, xs = np.nonzero(dens.mean(2) > 0.3)
        if len(xs):
            i = rng.randrange(len(xs))
            spot = place_mask('spot', h, w, rng, {'x': [xs[i] / w] * 2, 'y': [ys[i] / h] * 2,
                                                   'radius': [0.05, 0.09]})
            dens = np.maximum(dens, sm * cfg.get('smear_strength', 0.35) * spot[..., None])
    return np.clip(1.0 - dens, 0, 1)


# ---------- профили носителя (раздел 4) ----------
def profile(img, name, rng, text_mask):
    h, w = img.shape[:2]
    if name == 'none':
        return img, text_mask
    if name == 'scan_bureau':   # сканер бюро: 300 dpi, ровно, видна бумага, лёгкий перекос
        ang = rng.uniform(-0.45, 0.45)
        M = cv2.getRotationMatrix2D((w / 2, h / 2), ang, 1.0)
        M[:, 2] += [rng.uniform(-4, 4), rng.uniform(-4, 4)]
        lid = np.array([0.93, 0.925, 0.91], np.float32)  # крышка сканера за краем листа
        img = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT,
                             borderValue=tuple(float(v) for v in lid))
        text_mask = cv2.warpAffine(text_mask, M, (w, h), flags=cv2.INTER_LINEAR)
        grad = np.linspace(rng.uniform(0.985, 1.0), rng.uniform(0.985, 1.0), w, dtype=np.float32)
        img = img * grad[None, :, None]
        img = cv2.GaussianBlur(img, (0, 0), 0.45)
        img = img + np.random.default_rng(rng.randrange(1 << 30)).normal(0, 0.008, img.shape).astype(np.float32)
        return np.clip(img, 0, 1), text_mask
    if name == 'xerox':         # ксерокс: контраст сжат, серость, полоса тонера, текст читается
        g = img.mean(2, keepdims=True)
        img = np.repeat(np.clip((g - 0.08) / 0.84, 0, 1) ** 1.15 * 0.93 + 0.03, 3, 2)
        x = int(w * rng.choice([rng.uniform(0.01, 0.04), rng.uniform(0.96, 0.99)]))
        band = np.exp(-((np.arange(w) - x) / (w * 0.006)) ** 2).astype(np.float32)
        img = img * (1 - 0.35 * band[None, :, None] * lowfreq_noise(rng, h, 1, 40, 0.4, 1)[:, :, None])
        img = img + np.random.default_rng(rng.randrange(1 << 30)).normal(0, 0.015, img.shape).astype(np.float32)
        return np.clip(img, 0, 1), text_mask
    raise SystemExit(f'неизвестный профиль: {name}')


# ---------- проверка читаемости ----------
def legibility(clean_lum, final_lum, mask_before, mask_after, boxes, w):
    pad = int(6 * w / 1588)
    out = []
    for b in boxes:
        x0, y0 = int(max(0, b['x'] - pad)), int(max(0, b['y'] - pad))
        x1, y1 = int(b['x'] + b['w'] + pad), int(b['y'] + b['h'] + pad)
        def ratio(L, M):
            tm = M[y0:y1, x0:x1] > 0.5
            bm = (cv2.dilate(tm.astype(np.uint8), np.ones((7, 7), np.uint8)) == 0) & (M[y0:y1, x0:x1] < 0.05)
            if tm.sum() < 20 or bm.sum() < 20:
                return None
            t, bg = float(np.percentile(L[y0:y1, x0:x1][tm], 30)), float(np.median(L[y0:y1, x0:x1][bm]))
            return (bg + 0.05) / (t + 0.05)
        before, after = ratio(clean_lum, mask_before), ratio(final_lum, mask_after)
        if before is None or after is None:
            continue
        out.append({'id': b['id'], 'before': round(before, 2), 'after': round(after, 2),
                    'kept': round(after / before, 2), 'ok': after >= 4.5 and after / before >= 0.6})
    return out


def lum(a):
    """Относительная яркость (линейная, как в WCAG)."""
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    return lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('recipe'); ap.add_argument('prefix'); ap.add_argument('library'); ap.add_argument('out')
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--log', default=None)
    a = ap.parse_args()
    R = json.load(open(a.recipe, encoding='utf-8'))
    rng = random.Random(a.seed * 7919 + zlib.crc32(str(R.get('doc', '')).encode()))
    nrng = np.random.default_rng(rng.randrange(1 << 30))
    logp = a.log or os.path.join(a.library, '_usage.json')
    usage = json.load(open(logp, encoding='utf-8')) if os.path.exists(logp) else {}
    meta = {'doc': R.get('doc'), 'seed': a.seed, 'paper': None, 'traces': [], 'hands': {}}

    boxes_j = json.load(open(a.prefix + '_boxes.json', encoding='utf-8'))
    printed = load_rgb(a.prefix + '_print.png')
    h, w = printed.shape[:2]

    # 1. бумага
    pcfg = R.get('paper', {})
    pf = pick_instance(os.path.join(a.library, 'paper_base'), pcfg.get('prefer'), usage, 'paper_base', rng)
    if pf:
        paper = fit_crop(load_rgb(pf), h, w, rng, crop=(0.5, 0.8))
        paper = paper / np.percentile(paper.reshape(-1, 3), 60, 0) * np.array(pcfg.get('tone', [0.965, 0.96, 0.945]), np.float32)
        usage.setdefault('paper_base', []).append(os.path.basename(pf))
        meta['paper'] = os.path.basename(pf)
    else:  # нет основы в библиотеке — ровный тон + волокно формулой (временно)
        paper = np.ones((h, w, 3), np.float32) * np.array(pcfg.get('tone', [0.965, 0.96, 0.945]), np.float32)
        paper *= (lowfreq_noise(rng, h, w, 3, 0.985, 1.0) * lowfreq_noise(rng, h, w, 50, 0.985, 1.0))[..., None]
        meta['paper'] = 'formula'

    # 2. документ умножением; рукописи — с дрожанием, нажимом, мазком
    ink = printed.copy()                                  # вёрстка с почерком на белом — «до»
    for hand, cfg in R.get('hands', {}).items():
        lp = f'{a.prefix}_{hand}.png'
        if os.path.exists(lp):
            ink = ink * hand_layer(load_rgb(lp), rng, cfg)
            meta['hands'][hand] = cfg
    clean = ink
    doc = paper * ink

    # 3. следы по рецепту
    km = keep_mask(boxes_j['boxes'], h, w, pad=int(18 * w / 1588))
    for t in R.get('traces', []):
        t = dict(t)
        for _ in range(t.get('count', 1)):
            f = pick_instance(os.path.join(a.library, t['kind']), t.get('prefer'), usage, t['kind'], rng)
            if not f:
                meta['traces'].append({'kind': t['kind'], 'why': t.get('why'), 'skipped': 'нет слоёв в библиотеке'})
                continue
            tex = load_rgb(f) * 255.0 / NEUTRAL                       # множитель, бумага = 1
            tex = fit_crop(tex, h, w, rng, crop=tuple(t.get('crop', [0.45, 1.0])),
                           rot90=t.get('rot90', True))
            s = rng.uniform(*t.get('strength', [0.6, 1.0]))
            m = place_mask(t.get('place', 'cover'), h, w, rng, t) * s
            if t.get('avoid_keep', True):
                m *= (1 - km)
            doc = doc * (1 + (tex - 1) * m[..., None])
            usage.setdefault(t['kind'], []).append(os.path.basename(f))
            meta['traces'].append({'kind': t['kind'], 'why': t.get('why'), 'instance': os.path.basename(f),
                                   'place': t.get('place', 'cover'), 'side': t.get('_side'),
                                   'strength': round(s, 2)})

    # 4. профиль носителя
    mask_before = (lum(clean) < 0.35).astype(np.float32)  # ядро штриха, без полутонов края
    doc, text_mask = profile(np.clip(doc, 0, 1), R.get('profile', 'none'), rng, mask_before.copy())

    # 5. проверка читаемости строк вывода
    meta['legibility'] = legibility(lum(clean), lum(doc), mask_before, text_mask, boxes_j['boxes'], w)
    meta['legibility_ok'] = all(x['ok'] for x in meta['legibility'])

    cv2.imwrite(a.out, cv2.cvtColor((doc * 255 + 0.5).astype(np.uint8), cv2.COLOR_RGB2BGR))
    json.dump(meta, open(a.out.rsplit('.', 1)[0] + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for k in usage:
        usage[k] = usage[k][-50:]
    json.dump(usage, open(logp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({'out': a.out, 'paper': meta['paper'], 'traces': meta['traces'],
                      'legibility_ok': meta['legibility_ok']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
