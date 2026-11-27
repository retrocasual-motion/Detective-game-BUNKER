# lid_video.py — видео открытия и закрытия крышки и нажатия кнопок тачпада (Playwright, запись экрана страницы).
# Запуск: python tools/lid_video.py http://127.0.0.1:8747/ <out_dir>
import sys, os, glob, shutil
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True); tmp = os.path.join(out, '_vid')
PT = '''([name, off]) => { const o = window.__laptop.getObjectByName(name); o.updateWorldMatrix(true, false);
  const p = o.localToWorld(new o.position.constructor(off[0], off[1], off[2])).project(window.__camera);
  const r = document.getElementById('view').getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; }'''
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
    for name, url in (('lid', 'index.html#lid=0'), ('pad', 'index.html#view=pad')):
        ctx = b.new_context(viewport={'width': 960, 'height': 600}, record_video_dir=tmp, record_video_size={'width': 960, 'height': 600}); pg = ctx.new_page()
        pg.goto(base + url); pg.wait_for_function('document.documentElement.dataset.laptop47', timeout=60000); pg.wait_for_timeout(1500)
        if name == 'lid':
            for i in range(2): pg.click('#bLid'); pg.wait_for_timeout(1700)
            pg.click('#bLid'); pg.wait_for_timeout(1700)
        else:
            for k in ('btn_pad_l', 'btn_pad_r', 'btn_pad_l', 'btn_pad_r'):
                x, y = pg.evaluate(PT, [k, [0, 0.0016, 0.007]]); pg.mouse.move(x, y, steps=8); pg.wait_for_timeout(250); pg.mouse.down(); pg.wait_for_timeout(350); pg.mouse.up(); pg.wait_for_timeout(450)
        path = pg.video.path(); ctx.close(); shutil.move(path, os.path.join(out, name + '.webm')); print(name, 'ok')
    b.close()
shutil.rmtree(tmp, ignore_errors=True)
