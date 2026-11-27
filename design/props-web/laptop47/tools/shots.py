# shots.py — снимки страниц пробы ноутбука 47 (headless Chrome, Playwright).
# Запуск: python tools/shots.py <base_url> <out_dir> name=page#hash[@WxH] ...
import sys, os
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
jobs = []
for a in sys.argv[3:]:
    name, rest = a.split('=', 1); size = (1280, 800)
    if '@' in rest: rest, s = rest.rsplit('@', 1); size = tuple(int(v) for v in s.split('x'))
    jobs.append((name, rest, size))
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
    for name, url, size in jobs:
        pg = b.new_page(viewport={'width': size[0], 'height': size[1]}); msgs = []
        pg.on('console', lambda m: msgs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None); pg.on('pageerror', lambda e: msgs.append('pageerror: ' + str(e)))
        pg.goto(base + url)
        try: pg.wait_for_function('document.documentElement.dataset.laptop47', timeout=60000)
        except Exception as e: msgs.append('not ready')
        pg.wait_for_timeout(1000); pg.screenshot(path=os.path.join(out, name + '.png'))
        print(name, '|', '; '.join(m for m in msgs if 'favicon' not in m)[:300]); pg.close()
    b.close()
