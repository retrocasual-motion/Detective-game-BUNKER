# test_keys.py — проверка клавиш, перемотки и ленты проигрывателя L462 на странице пробы (headless Chrome, Playwright).
# Запуск: python tools/test_keys.py http://127.0.0.1:8751/ shots
import sys
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]
PT = '''([name, off]) => { const o = window.__phone.getObjectByName(name); o.updateWorldMatrix(true, false);
  const p = o.localToWorld(new o.position.constructor(off[0], off[1], off[2])).project(window.__camera);
  const r = document.getElementById('view').getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; }'''
# точка на детали в координатах её группы (м). Пустое место прорези у стрелок — в координатах корпуса (грань x = 31,3 мм, ось клавиш y = 12,5 мм,
# середина прорези z = 7,5 мм): к верху вещи — «вперёд», к низу — «назад».
KEYS = [('btn_play', 'btn_play', (0.0019, 0, 0.002)), ('btn_stop', 'btn_stop', (0.0019, 0, 0)),
        ('btn_ff', 'recorder462_body', (0.0313, 0.0125, 0.0075 - 0.0068)), ('btn_rew', 'recorder462_body', (0.0313, 0.0125, 0.0075 + 0.0068)),
        ('btn_rec', 'btn_rec', (0.0016, 0, 0))]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800}); msgs = []
    pg.on('console', lambda m: msgs.append(m.text) if m.type in ('error', 'warning') else None); pg.on('pageerror', lambda e: msgs.append('ERR ' + str(e)))
    depth = lambda n: round(pg.evaluate('(n)=>window.__phone.userData.keyDepth(n)', n), 2)
    tape = lambda: round(pg.evaluate('window.__phone.userData.tapeTime()'), 2)
    cnt = lambda: pg.evaluate('window.__phone.userData.counterValue()')
    lamp = lambda: pg.evaluate('window.__phone.userData.lampOn()')
    quat = lambda: pg.evaluate('window.__st.q.toArray()')
    turned = lambda a, c: any(abs(x - y) > 1e-3 for x, y in zip(a, c))
    bad = 0
    def say(ok, text):
        global bad
        bad += 0 if ok else 1; print(('ok  ' if ok else 'ПЛОХО ') + text)
    pg.goto(base + 'index.html#view=keys'); pg.reload(); pg.wait_for_function('window.__ready===true'); pg.wait_for_timeout(900)
    start = tape()
    for name, obj, off in KEYS:
        if name == 'btn_rec': pg.evaluate('(t)=>window.__phone.userData.setTapeTime(t)', start + 10)   # лента заведомо не в начале
        x, y = pg.evaluate(PT, [obj, list(off)])
        hit = pg.evaluate('([x,y])=>window.__keyAt({clientX:x, clientY:y})', [x, y])
        q0 = quat(); t0 = tape(); pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(450); held = depth(name); t1 = tape()
        if name in ('btn_ff', 'btn_rew'):          # перемотку держат: палец дрожит на 20 пикселей — вещь не вращается, перемотка идёт
            pg.mouse.move(x + 14, y + 14, steps=4); pg.wait_for_timeout(250); held = depth(name); t1 = tape(); still = not turned(q0, quat())
        pg.screenshot(path=f'{out}/press_{name}.png')
        pg.mouse.up(); pg.wait_for_timeout(450); rel = depth(name); mode = pg.evaluate('window.__transport()')
        if name == 'btn_play':
            pg.wait_for_timeout(800); t2 = tape(); l_ = lamp(); pg.screenshot(path=f'{out}/lamp_on.png')
            say(hit == name and held == 1 and rel == 1 and mode == 'play' and t2 > t0 + 0.8 and l_, f'{name}: луч попал в {hit} | держим {held} | отпустили {rel} | лента {t0} → {t2} с, лампочка горит: {l_}')
        elif name == 'btn_stop':
            ta = tape(); pg.wait_for_timeout(500); tb = tape(); l_ = lamp()
            say(hit == name and held == 1 and rel == 0 and depth('btn_play') == 0 and mode == 'stop' and ta == tb and not l_, f'{name}: луч попал в {hit} | держим {held} | отпустили {rel} | пуск отпущен, лента стоит: {ta == tb}, лампочка погасла: {not l_}')
        elif name == 'btn_ff':
            say(hit == name and held == 1 and rel == 0 and t1 > t0 + 3 and still, f'{name}: пустое место у стрелки «вперёд» → {hit} | ползунок ушёл {held} | вернулся {rel} | лента {t0} → {t1} с | вещь не повернулась: {still}')
        elif name == 'btn_rew':
            say(hit == name and held == 1 and rel == 0 and t1 < t0 - 3 and still, f'{name}: пустое место у стрелки «назад» → {hit} | ползунок ушёл {held} | вернулся {rel} | лента {t0} → {t1} с | вещь не повернулась: {still}')
        else:                                       # красная клавиша: запись уходит в самое начало, счётчик 000
            pg.wait_for_timeout(700); t2 = tape()
            say(hit == name and held == 1 and rel == 0 and t0 > start + 1 and t2 == start and cnt() == 0 and mode == 'stop', f'{name}: луч попал в {hit} | держим {held} | отпустили {rel} | лента {t0} → {t2} с (начало {start}), счётчик {cnt()}, режим {mode}')
    # взять сам ползунок и вести: он едет за указателем, вещь не вращается, дальше 40 % хода — перемотка; отпустили — вернулся
    x0, y0 = pg.evaluate(PT, ['wind_slider', [0.0015, 0, 0]]); x1, y1 = pg.evaluate(PT, ['wind_slider', [0.0015, 0, -0.003]])
    dx, dy = x1 - x0, y1 - y0
    q0 = quat(); t0 = tape(); pg.mouse.move(x0, y0); pg.mouse.down(); pg.wait_for_timeout(250); t_hold = tape()
    pg.mouse.move(x0 + dx * 0.2, y0 + dy * 0.2, steps=3); pg.wait_for_timeout(200); part = depth('btn_ff'); t_part = tape()
    pg.mouse.move(x0 + dx * 1.4, y0 + dy * 1.4, steps=5); pg.wait_for_timeout(450); full = depth('btn_ff'); t_full = tape(); pg.screenshot(path=f'{out}/slider_drag.png')
    pg.mouse.move(x0 - dx * 1.4, y0 - dy * 1.4, steps=8); pg.wait_for_timeout(450); back = depth('btn_rew'); t_back = tape()
    still = not turned(q0, quat()); pg.mouse.up(); pg.wait_for_timeout(500)
    say(t_hold == t0 and 0.1 < part < 0.4 and t_part == t0 and full == 1 and t_full > t0 + 3 and back == 1 and t_back < t_full - 3 and still and depth('btn_ff') == 0 and depth('btn_rew') == 0,
        f'ползунок рукой: нажали — лента стоит ({t_hold == t0}) | на 20 % хода {part}, лента стоит ({t_part == t0}) | до упора вперёд {full}, лента {t0} → {t_full} | назад {back}, лента → {t_back} | вещь не повернулась: {still} | отпустили: {depth("btn_ff")}, {depth("btn_rew")}')
    # перемотка во время воспроизведения: отпустили — играет дальше
    x, y = pg.evaluate(PT, ['btn_play', [0.0019, 0, 0.002]]); pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.up(); pg.wait_for_timeout(300)
    x, y = pg.evaluate(PT, ['recorder462_body', [0.0313, 0.0125, 0.0075 - 0.0068]]); pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(400); pg.mouse.up(); pg.wait_for_timeout(300)
    ta = tape(); pg.wait_for_timeout(600); tb = tape(); say(pg.evaluate('window.__transport()') == 'play' and tb > ta + 0.4 and depth('btn_play') == 1, f'перемотка во время воспроизведения: отпустили — играет дальше ({ta} → {tb} с), пуск утоплен {depth("btn_play")}')
    x, y = pg.evaluate(PT, ['btn_stop', [0.0019, 0, 0]]); pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.up(); pg.wait_for_timeout(400)
    # счётчик и втулки считаются из места ленты
    r0 = pg.evaluate("window.__phone.getObjectByName('reel_takeup').rotation.y"); c0 = cnt(); tt = tape()
    pg.evaluate('window.__phone.userData.setTapeTime(window.__phone.userData.tapeTime() + 35)'); pg.wait_for_timeout(200)
    r1 = pg.evaluate("window.__phone.getObjectByName('reel_takeup').rotation.y"); c1 = cnt(); pg.evaluate('(t)=>window.__phone.userData.setTapeTime(t)', tt)
    print(f'35 с ленты: приёмная втулка повернулась на {round(abs(r1 - r0) / 6.2832, 1)} оборота, счётчик {c0} → {c1}')
    # быстрый щелчок и ведение с клавиши
    x, y = pg.evaluate(PT, ['btn_stop', [0.0019, 0, 0]]); pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.up(); mx = 0
    for i in range(12): pg.wait_for_timeout(20); mx = max(mx, depth('btn_stop'))
    pg.wait_for_timeout(300); print('быстрый щелчок: макс. глубина', mx, '| потом', depth('btn_stop'))
    q0 = quat(); pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 60, y + 10, steps=6); pg.mouse.up(); pg.wait_for_timeout(500)
    print('ведение с клавиши «стоп»: поворот изменился', turned(q0, quat()), '| клавиша в конце', depth('btn_stop'))
    # с другой стороны клавиши сквозь корпус не нажимаются
    pg.goto(base + 'index.html#view=left'); pg.reload(); pg.wait_for_function('window.__ready===true'); pg.wait_for_timeout(900)
    x, y = pg.evaluate(PT, ['btn_play', [0.0019, 0, 0]]); print('с левой грани луч попал в', pg.evaluate('([x,y])=>window.__keyAt({clientX:x, clientY:y})', [x, y]))
    f0 = pg.evaluate('window.__frames()'); pg.wait_for_timeout(1500); print('кадров в покое', pg.evaluate('window.__frames()') - f0, '| консоль', msgs[:3], '| ошибок', bad)
    b.close()
