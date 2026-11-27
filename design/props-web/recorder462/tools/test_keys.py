# test_keys.py — проверка клавиш и ленты проигрывателя L462 на странице пробы (headless Chrome, Playwright).
# Запуск: python tools/test_keys.py http://127.0.0.1:8751/ shots
import sys
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]
PT = '''([name, off]) => { const o = window.__phone.getObjectByName(name); o.updateWorldMatrix(true, false);
  const p = o.localToWorld(new o.position.constructor(off[0], off[1], off[2])).project(window.__camera);
  const r = document.getElementById('view').getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; }'''
# точка на детали в координатах её группы (м): клавиши растут в +X от грани; у ползунка — ближе к своему концу
KEYS = [('btn_rec', 'btn_rec', (0.0016, 0, 0)), ('btn_play', 'btn_play', (0.0019, 0, 0.002)), ('btn_stop', 'btn_stop', (0.0019, 0, 0)),
        ('btn_ff', 'wind_slider', (0.0015, 0, -0.0025)), ('btn_rew', 'wind_slider', (0.0015, 0, 0.0025))]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800}); msgs = []
    pg.on('console', lambda m: msgs.append(m.text) if m.type in ('error', 'warning') else None); pg.on('pageerror', lambda e: msgs.append('ERR ' + str(e)))
    depth = lambda n: round(pg.evaluate('(n)=>window.__phone.userData.keyDepth(n)', n), 2)
    tape = lambda: round(pg.evaluate('window.__phone.userData.tapeTime()'), 2)
    cnt = lambda: pg.evaluate('window.__phone.userData.counterValue()')
    bad = 0
    pg.goto(base + 'index.html#view=keys'); pg.reload(); pg.wait_for_function('window.__ready===true'); pg.wait_for_timeout(900)
    for name, obj, off in KEYS:
        x, y = pg.evaluate(PT, [obj, list(off)])
        hit = pg.evaluate('([x,y])=>window.__keyAt({clientX:x, clientY:y})', [x, y])
        t0 = tape(); pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(450); held = depth(name); t1 = tape()
        pg.screenshot(path=f'{out}/press_{name}.png')
        pg.mouse.up(); pg.wait_for_timeout(450); rel = depth(name); mode = pg.evaluate('window.__transport()')
        if name == 'btn_play':       # пуск остаётся утопленным, лента идёт
            pg.wait_for_timeout(800); t2 = tape(); lamp = pg.evaluate('window.__phone.userData.lampOn()'); ok = hit == name and held == 1 and rel == 1 and mode == 'play' and t2 > t0 + 0.8 and lamp
            pg.screenshot(path=f'{out}/lamp_on.png'); note = f'лента {t0} → {t2} с, режим {mode}, лампочка горит: {lamp}'
        elif name == 'btn_stop':     # стоп отпускает пуск, лента стоит
            ta = tape(); pg.wait_for_timeout(500); tb = tape(); lamp = pg.evaluate('window.__phone.userData.lampOn()'); ok = hit == name and held == 1 and rel == 0 and depth('btn_play') == 0 and mode == 'stop' and ta == tb and not lamp
            note = f'пуск отпущен: {depth("btn_play")}, лента стоит: {ta == tb}, лампочка погасла: {not lamp}'
        elif name == 'btn_ff': ok = hit == name and held == 1 and rel == 0 and t1 > t0 + 3; note = f'лента {t0} → {t1} с'
        elif name == 'btn_rew': ok = hit == name and held == 1 and rel == 0 and t1 < t0 - 3; note = f'лента {t0} → {t1} с'
        else: ok = hit == name and held == 1 and rel == 0 and t1 == t0; note = 'запись: клавиша упирается, лента не идёт'
        bad += 0 if ok else 1
        print(('ok  ' if ok else 'ПЛОХО ') + f'{name}: луч попал в {hit} | держим {held} | отпустили {rel} | {note}')
    # счётчик и катушки считаются из места ленты
    r0 = pg.evaluate("window.__phone.getObjectByName('reel_takeup').rotation.y"); c0 = cnt()
    pg.evaluate('window.__phone.userData.setTapeTime(window.__phone.userData.tapeTime() + 35)'); pg.wait_for_timeout(200)
    r1 = pg.evaluate("window.__phone.getObjectByName('reel_takeup').rotation.y"); c1 = cnt()
    print(f'35 с ленты: приёмная катушка повернулась на {round(abs(r1 - r0) / 6.2832, 1)} оборота, счётчик {c0} → {c1}')
    # быстрый щелчок и ведение с клавиши
    x, y = pg.evaluate(PT, ['btn_stop', [0.0019, 0, 0]]); pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.up(); mx = 0
    for i in range(12): pg.wait_for_timeout(20); mx = max(mx, depth('btn_stop'))
    pg.wait_for_timeout(300); print('быстрый щелчок: макс. глубина', mx, '| потом', depth('btn_stop'))
    q0 = pg.evaluate('window.__st.q.toArray()'); pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 60, y + 10, steps=6); pg.mouse.up(); pg.wait_for_timeout(500)
    q1 = pg.evaluate('window.__st.q.toArray()'); print('ведение с клавиши: поворот изменился', any(abs(a - c) > 1e-3 for a, c in zip(q0, q1)), '| клавиша в конце', depth('btn_stop'))
    # с другой стороны клавиши сквозь корпус не нажимаются
    pg.goto(base + 'index.html#view=left'); pg.reload(); pg.wait_for_function('window.__ready===true'); pg.wait_for_timeout(900)
    x, y = pg.evaluate(PT, ['btn_play', [0.0019, 0, 0]]); print('с левой грани луч попал в', pg.evaluate('([x,y])=>window.__keyAt({clientX:x, clientY:y})', [x, y]))
    f0 = pg.evaluate('window.__frames()'); pg.wait_for_timeout(1500); print('кадров в покое', pg.evaluate('window.__frames()') - f0, '| консоль', msgs[:3], '| ошибок', bad)
    b.close()
