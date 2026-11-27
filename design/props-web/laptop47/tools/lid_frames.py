# lid_frames.py — открытие и закрытие крышки ноутбука 47 по кадрам (headless Chrome, Playwright).
# Запуск: python tools/lid_frames.py http://127.0.0.1:8747/ shots_lid [view]
import sys, os
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]; view = sys.argv[3] if len(sys.argv) > 3 else ''
os.makedirs(out, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 960, 'height': 600}); msgs = []
    pg.on('console', lambda m: msgs.append(m.text) if m.type in ('error', 'warning') else None); pg.on('pageerror', lambda e: msgs.append('ERR ' + str(e)))
    pg.goto(base + 'index.html' + ('#view=' + view if view else '')); pg.wait_for_function('document.documentElement.dataset.laptop47', timeout=60000); pg.wait_for_timeout(1200)
    tag = view or 'front'
    for phase in ('close', 'open'):
        pg.click('#bLid')
        for i in range(10):
            pg.wait_for_timeout(90); pg.screenshot(path=f'{out}/{tag}_{phase}_{i:02d}.png')
        pg.wait_for_timeout(900); pg.screenshot(path=f'{out}/{tag}_{phase}_end.png')
    print(tag, 'консоль', msgs[:3]); b.close()
