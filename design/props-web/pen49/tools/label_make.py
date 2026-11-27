# -*- coding: utf-8 -*-
# label_make.py — снять карту флажка вещдока со страницы tools/label_make.html (вёрстка canvas, без генерации).
# Пишет <out>/flag_albedo.png (960 × 640: верхняя половина — лицо 24 × 8 мм, нижняя — оборот; 400 пикс/см).
# Запуск: python tools/label_make.py http://127.0.0.1:8749/ textures/pbr/src   (потом — tools/make_maps.py)
import sys, os, base64
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(base + 'tools/label_make.html')
    pg.wait_for_function('document.documentElement.dataset.ready', timeout=30000)
    d = pg.evaluate("window.__label.flag.toDataURL('image/png')")
    open(os.path.join(out, 'flag_albedo.png'), 'wb').write(base64.b64decode(d.split(',')[1]))
    print('fonts ok:', pg.evaluate("document.fonts.check('80px \"Segoe Script\"')"), 'errors:', errs)
    b.close()
