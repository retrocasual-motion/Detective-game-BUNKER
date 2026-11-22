"""Протоколы опросов 30–36: пакет игрока (markdown) → вёрстка по шаблону бюро + рецепт сборки.
Текст — дословно из пакета: шапка «Дело № · дата, время · опрашивал …», строки об опрашиваемом,
пересказ (абзацы, **заголовки**, *вопросы*), «Подпись: …». Ничего не добавляется.

python -P -E -X utf8 make_protocols.py <папка пакета player> <папка вывода (медиа)> <папка рецептов>
Пишет <вывод>/<№>.html и <рецепты>/<№>.json.
"""
import html, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, '..', '..', 'documents', 'layouts', 'protocol_template.html')

# № → (файл-префикс, класс руки, подпись рукой, одна мелочь по WEAR.md 30–36 — не повторять)
SERIES = {
    '30': ('30__', 'h-miller', None, {'kind': 'proc:corner', 'why': 'чуть загнутый угол'}),
    '31': ('31__', 'h-moro', None, None),
    '32': ('32__', 'h-pierce', None, {'kind': 'proc:clip', 'why': 'след от скрепки'}),
    '33': ('33__', 'h-sato', None, {'kind': 'proc:perforation', 'why': 'неровно оторванный край в перфорации'}),
    '34': ('34__', 'h-silva', 'G. Silva', None),          # канон: «подпись латиницей»
    '35': ('35__', 'h-walsh', None, {'kind': 'stain', 'why': 'лёгкий отпечаток пальца у подписи', 'prefer': ['HF-W11a'],
           'place': 'object', 'size_mm': [16, 22], 'at': {'box': 'sign', 'dx_mm': 6, 'dy_mm': 2}, 'strength': [0.4, 0.55]}),
    '36': ('36__', 'h-hart', None, None),
}


def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'\*(.+?)\*', r'<i>\1</i>', s)
    return s


def build(md_text):
    lines = md_text.split('\n')
    assert lines[0].startswith('# Протокол опроса')
    rest = [l for l in lines[1:]]
    while rest and not rest[0].strip():
        rest.pop(0)
    # шапка — до первой пустой строки
    head = []
    while rest and rest[0].strip():
        head.append(rest.pop(0))
    case = re.search(r'Дело № ([\d-]+)', head[0]).group(1)
    meta_first = head[0].split(' · ', 1)[1]           # «28.10.2009, 19:40–20:25 · опрашивал …»
    meta = '<br>'.join([inline(meta_first)] + [inline(h) for h in head[1:]])
    paras, cur, sign = [], [], None
    for l in rest:
        if l.startswith('Подпись:'):
            sign = l
            continue
        if not l.strip():
            if cur:
                paras.append(' '.join(cur)); cur = []
        else:
            cur.append(l.strip())
    if cur:
        paras.append(' '.join(cur))
    body = ''.join(f'<p>{inline(p)}</p>' for p in paras)
    m = re.match(r'Подпись: (.+?)\.?( \(подпись латиницей\))?\.?$', sign)
    return case, meta, body, m.group(1)


def main():
    pack, out, recipes = sys.argv[1:4]
    os.makedirs(out, exist_ok=True)
    tpl = open(TEMPLATE, encoding='utf-8').read()
    for num, (pref, hand, latin, extra) in SERIES.items():
        fn = [f for f in os.listdir(pack) if f.startswith(pref)][0]
        case, meta, body, name = build(open(os.path.join(pack, fn), encoding='utf-8').read())
        page = (tpl.replace('{{CASE}}', case).replace('{{META}}', meta).replace('{{BODY}}', body)
                .replace('{{SIGN_LABEL}}', 'Подпись:').replace('{{HAND}}', hand)
                .replace('{{SIGN}}', html.escape(latin or name)).replace('{{SIGN_TOP}}', '0'))
        open(os.path.join(out, f'{num}.html'), 'w', encoding='utf-8').write(page)
        traces = [{'kind': 'proc:staple', 'why': 'скоба (WEAR: у всех протоколов)'},
                  {'kind': 'proc:punch', 'why': 'два отверстия дырокола (подшито в дело)'}]
        if extra:
            traces.append(extra)
        recipe = {
            'doc': num, 'title': f'Протокол опроса ({fn[4:-3]})',
            'layout': 'make_protocols.py ← design/documents/layouts/protocol_template.html',
            'wear_md': 'О, Р бюро; скоба и дырокол у всех; разные мелочи, по одной на протокол, не повторять',
            'paper': {'prefer': ['TL-316'], 'tone': [0.975, 0.973, 0.966], 'contrast': 0.3, 'fibre_relief': 0.5,
                      'why': 'бюро: белая офисная 80 г, самая свежая в деле (паспорт бумаги)'},
            'hands': {'hand': {'why': 'подпись опрашиваемого синей ручкой бюро', 'tremor': 0.8,
                               'pressure': [0.85, 1.0], 'indent': 0.2}},
            'traces': traces,
            'profile': 'scan_bureau', 'relief_strength': 6,
        }
        json.dump(recipe, open(os.path.join(recipes, f'{num}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(num, fn, '→', name, '| следы:', ', '.join(t['kind'] for t in traces))


if __name__ == '__main__':
    main()
