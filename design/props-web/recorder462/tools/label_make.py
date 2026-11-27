# -*- coding: utf-8 -*-
# label_make.py — снять карты ярлыка бюро со страницы tools/label_make.html (вёрстка canvas, без генерации).
# Пишет <out>/label_{albedo,normal,rough}.png (1540×880; на телефоне ярлык 40 × 22,9 мм → 385 пикс/см).
# Запуск: python tools/label_make.py http://127.0.0.1:8749/ textures/pbr/src
import sys, os, base64
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(base + 'tools/label_make.html')
    pg.wait_for_function('document.documentElement.dataset.ready', timeout=30000)
    for k, name in (('color', 'label_albedo'), ('normal', 'label_normal'), ('rough', 'label_rough'), ('cass', 'cass_strip'), ('cassInk', 'cass_ink')):
        d = pg.evaluate("window.__label.%s.toDataURL('image/png')" % k)
        open(os.path.join(out, '%s.png' % name), 'wb').write(base64.b64decode(d.split(',')[1]))
    print('fonts ok:', pg.evaluate("document.fonts.check('80px \"Ink Free\"')"), 'errors:', errs)
    b.close()
