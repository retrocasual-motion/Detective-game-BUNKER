# export_masks.py — выгрузить холсты процедурного рисунка (маски областей) в PNG.
# Запуск: python tools/export_masks.py http://127.0.0.1:8749/ <out_dir> [size]
import sys, os, base64
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]; size = sys.argv[3] if len(sys.argv) > 3 else '4096'; only = sys.argv[4] if len(sys.argv) > 4 else ''
os.makedirs(out, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    rec = sys.argv[5] if len(sys.argv) > 5 else ''   # 'dot' — прежняя точка на красной клавише (по умолчанию — значок «в начало»)
    pg.goto(base + 'masks.html#size=' + size + ('&only=' + only if only else '') + ('&rec=' + rec if rec else '')); pg.wait_for_function('window.__ready === true', timeout=60000)
    for k, v in pg.evaluate('window.__masks').items():
        open(os.path.join(out, 'proc_' + k + ('_' + size if only else '') + '.png'), 'wb').write(base64.b64decode(v.split(',', 1)[1])); print('proc_' + k)
    b.close()
