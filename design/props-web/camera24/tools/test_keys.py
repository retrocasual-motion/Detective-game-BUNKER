# test_keys.py — проверка нажатия кнопок камеры 24 на странице пробы (headless Chrome, Playwright).
# Запуск: python tools/test_keys.py http://127.0.0.1:8750/ shots
import sys
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]
# точка на экране для кнопки: центр группы, у кольца стрелок и качельки — со сдвигом в свою сторону (в координатах группы, м)
PT = '''([name, off]) => { const o = window.__phone.getObjectByName(name); o.updateWorldMatrix(true, false);
  const p = o.localToWorld(new o.position.constructor(off[0], off[1], off[2])).project(window.__camera);
  const r = document.getElementById('view').getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; }'''
BACK = [('btn_play', 'btn_play', (0, -0.0006, 0)), ('btn_menu', 'btn_menu', (0, -0.0006, 0)), ('btn_home', 'btn_home', (0, -0.0006, 0)), ('btn_ok', 'btn_ok', (0, -0.0011, 0)),
        ('btn_up', 'pad_ring', (0, -0.0009, -0.0069)), ('btn_down', 'pad_ring', (0, -0.0009, 0.0069)), ('btn_left', 'pad_ring', (0.0069, -0.0009, 0)), ('btn_right', 'pad_ring', (-0.0069, -0.0009, 0)),
        ]
ZOOM = [('btn_zoom_w', 'zoom_rocker', (0.0045, -0.001, 0)), ('btn_zoom_t', 'zoom_rocker', (-0.0045, -0.001, 0))]   # в ракурсе controls качелька за краем кадра
TOP = [('btn_shutter', 'btn_shutter', (0, 0, -0.0013)), ('btn_power', 'btn_power', (0, 0, -0.0003))]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800}); msgs = []
    pg.on('console', lambda m: msgs.append(m.text) if m.type in ('error', 'warning') else None); pg.on('pageerror', lambda e: msgs.append('ERR ' + str(e)))
    depth = lambda n: round(pg.evaluate('(n)=>window.__phone.userData.keyDepth(n)', n), 2)
    bad = 0
    for view, keys in (('controls', BACK), ('back', ZOOM), ('top', TOP)):
        pg.goto(base + 'index.html#view=' + view); pg.reload(); pg.wait_for_function('window.__ready===true'); pg.wait_for_timeout(900)
        for name, obj, off in keys:
            x, y = pg.evaluate(PT, [obj, list(off)])
            hit = pg.evaluate('([x,y])=>window.__keyAt({clientX:x, clientY:y})', [x, y])
            pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(220); held = depth(name)
            if name in ('btn_left', 'btn_shutter', 'btn_zoom_w', 'btn_ok'): pg.screenshot(path=f'{out}/press_{name}.png')
            pg.mouse.up(); pg.wait_for_timeout(350); rel = depth(name)
            ok = hit == name and held == 1 and rel == 0; bad += 0 if ok else 1
            print(('ok  ' if ok else 'ПЛОХО ') + f'{name}: луч попал в {hit} | держим {held} | отпустили {rel}')
    # быстрый щелчок и ведение с кнопки
    pg.goto(base + 'index.html#view=controls'); pg.reload(); pg.wait_for_function('window.__ready===true'); pg.wait_for_timeout(900)
    x, y = pg.evaluate(PT, ['btn_menu', [0, -0.0006, 0]]); pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.up(); mx = 0
    for i in range(12): pg.wait_for_timeout(20); mx = max(mx, depth('btn_menu'))
    pg.wait_for_timeout(300); print('быстрый щелчок: макс. глубина', mx, '| потом', depth('btn_menu'))
    q0 = pg.evaluate('window.__st.q.toArray()'); pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 60, y + 10, steps=6); pg.mouse.up(); pg.wait_for_timeout(500)
    q1 = pg.evaluate('window.__st.q.toArray()'); print('ведение с кнопки: поворот изменился', any(abs(a - c) > 1e-3 for a, c in zip(q0, q1)), '| кнопка в конце', depth('btn_menu'))
    # спереди кнопки задней стенки сквозь корпус не нажимаются
    pg.goto(base + 'index.html#view=front'); pg.reload(); pg.wait_for_function('window.__ready===true'); pg.wait_for_timeout(900)
    x, y = pg.evaluate(PT, ['btn_ok', [0, -0.0011, 0]]); print('спереди луч попал в', pg.evaluate('([x,y])=>window.__keyAt({clientX:x, clientY:y})', [x, y]))
    f0 = pg.evaluate('window.__frames()'); pg.wait_for_timeout(1500); print('кадров в покое', pg.evaluate('window.__frames()') - f0, '| консоль', msgs[:3], '| ошибок', bad)
    b.close()
