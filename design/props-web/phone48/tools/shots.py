# shots.py — снимки страниц пробы телефона 48 в headless Chrome (Playwright).
# Запуск:  python tools/shots.py <base_url> <out_dir> name=page#hash[@WxH] ...
#   пример: python tools/shots.py http://127.0.0.1:8748/ shots front=index.html#view=front back=index.html#view=back@1280x800
import sys, os, json
from playwright.sync_api import sync_playwright

base, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
jobs = []
for a in sys.argv[3:]:
    name, rest = a.split('=', 1)
    size = (1280, 800)
    if '@' in rest:
        rest, s = rest.rsplit('@', 1); size = tuple(int(v) for v in s.split('x'))
    jobs.append((name, rest, size))

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'])
    for name, url, size in jobs:
        pg = b.new_page(viewport={'width': size[0], 'height': size[1]}, device_scale_factor=1)
        msgs = []
        pg.on('console', lambda m: msgs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: msgs.append('pageerror: ' + str(e)))
        pg.goto(base + url)
        try:
            pg.wait_for_function('window.__ready === true', timeout=30000)
        except Exception as e:
            msgs.append('not ready: ' + str(e)[:80])
        pg.wait_for_timeout(900)
        pg.screenshot(path=os.path.join(out, name + '.png'))
        st = pg.evaluate('window.__stats ? JSON.stringify({t: window.__stats.triangles, m: window.__stats.meshes, set: window.__stats.mapSet, mb: window.__stats.texMB}) : ""')
        print(name, st, '|', '; '.join(m for m in msgs if 'favicon' not in m)[:600])
        pg.close()
    b.close()
