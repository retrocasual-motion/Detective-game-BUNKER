# -*- coding: utf-8 -*-
# label_make.py — снять карты ярлыка бюро со страницы tools/label_make.html (вёрстка canvas, без генерации).
# Пишет textures/pbr/label_{albedo,normal,rough}.png (1540×880, 220 пикс/см); в набор страницы их кладёт prep_pbr.py.
# Запуск из папки страницы при работающем сервере:  python tools/label_make.py [http://127.0.0.1:8748]
import sys, base64
from playwright.sync_api import sync_playwright
base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8748'
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    pg = b.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(base + '/tools/label_make.html')
    pg.wait_for_function('document.documentElement.dataset.ready', timeout=30000)
    for k in ['color', 'normal', 'rough']:
        d = pg.evaluate("window.__label.%s.toDataURL('image/png')" % k)
        name = {'color': 'albedo', 'normal': 'normal', 'rough': 'rough'}[k]
        open('textures/pbr/label_%s.png' % name, 'wb').write(base64.b64decode(d.split(',')[1]))
    print('fonts ok:', pg.evaluate("document.fonts.check('80px \"Segoe Script\"')"), 'errors:', errs)
    b.close()
