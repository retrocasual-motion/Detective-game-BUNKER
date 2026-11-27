# test_lid_keys.py — проверка движения крышки и нажатия кнопок ноутбука 47 на странице пробы (headless Chrome, Playwright).
# Запуск: python tools/test_lid_keys.py http://127.0.0.1:8747/ shots_lid
import sys, os
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
PT = '''([name, off]) => { const o = window.__laptop.getObjectByName(name); o.updateWorldMatrix(true, false);
  const p = o.localToWorld(new o.position.constructor(off[0], off[1], off[2])).project(window.__camera);
  const r = document.getElementById('view').getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; }'''
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800}); msgs = []; bad = 0
    pg.on('console', lambda m: msgs.append(m.text) if m.type in ('error', 'warning') else None); pg.on('pageerror', lambda e: msgs.append('ERR ' + str(e)))
    def say(ok, text):
        global bad
        bad += 0 if ok else 1; print(('ok  ' if ok else 'ПЛОХО ') + text)
    ang = lambda: pg.evaluate('window.__laptop.userData.lidAngle')
    pg.goto(base + 'index.html'); pg.wait_for_function('document.documentElement.dataset.laptop47', timeout=60000); pg.wait_for_timeout(1200)
    # кривая движения: углы крышки каждые 16 мс после нажатия «Крышка»
    SAMPLE = '''() => new Promise((res) => { const a = [], t0 = performance.now(); const f = () => { a.push([Math.round(performance.now() - t0), window.__laptop.userData.lidAngle]);
      if (performance.now() - t0 < 1700) requestAnimationFrame(f); else res(a); }; document.getElementById('bLid').click(); requestAnimationFrame(f); })'''
    for phase, a0, a1 in (('закрытие', 1.92, 0.0), ('открытие', 0.0, 1.92)):
        s = pg.evaluate(SAMPLE); deg = lambda v: round(v * 57.2958, 1)
        at = lambda ms: next(v for t, v in s if t >= ms)
        vmax = max(abs(s[i + 1][1] - s[i][1]) / max(1, s[i + 1][0] - s[i][0]) for i in range(len(s) - 1)) * 1000
        v0 = abs(at(60) - a0) / 0.06
        t_end = next(t for t, v in s if abs(v - a1) < 0.03)
        over = (max(v for t, v in s) - a1) if a1 > 0 else max(v for t, v in s if t > t_end)
        print(f'{phase}: 0 мс {deg(s[0][1])}°, 100 мс {deg(at(100))}°, 300 мс {deg(at(300))}°, 500 мс {deg(at(500))}°, 700 мс {deg(at(700))}°, 900 мс {deg(at(900))}°, конец {deg(s[-1][1])}°')
        say(abs(s[-1][1] - a1) < 1e-4 and abs(at(100) - a0) < 0.25 * 1.92 and 500 < t_end < 1100 and v0 < 0.45 * vmax and 0 < over < 0.035,
            f'{phase}: за первые 100 мс пройдено {round(abs(at(100) - a0) / 1.92 * 100)} % пути (было ≈ 50 %) | до места за {t_end} мс | старт мягкий (скорость {round(v0, 1)} против наибольшей {round(vmax, 1)} рад/с) | покачивание в конце {deg(over)}°')
    # кадр не прыгает: положение переднего левого угла базы на экране во время открытия
    pg.click('#bLid'); pg.wait_for_timeout(1500)
    TRACK = '''() => new Promise((res) => { const a = [], t0 = performance.now(), V = window.__laptop.position.constructor; const f = () => {
      const p = window.__laptop.localToWorld(new V(-0.16, 0, 0.115)).project(window.__camera); a.push([p.x * 640, p.y * 400]);
      if (performance.now() - t0 < 1600) requestAnimationFrame(f); else res(a); }; document.getElementById('bLid').click(); requestAnimationFrame(f); })'''
    tr = pg.evaluate(TRACK); steps = [((tr[i + 1][0] - tr[i][0]) ** 2 + (tr[i + 1][1] - tr[i][1]) ** 2) ** 0.5 for i in range(len(tr) - 1)]
    total = ((tr[-1][0] - tr[0][0]) ** 2 + (tr[-1][1] - tr[0][1]) ** 2) ** 0.5
    say(max(steps) < 5 and total < 110, f'кадр при открытии: угол базы сместился всего на {round(total)} пикс., наибольший шаг за кадр {round(max(steps), 1)} пикс.')
    # кнопки тачпада и питания
    pg.goto(base + 'index.html#view=pad'); pg.reload(); pg.wait_for_function('document.documentElement.dataset.laptop47', timeout=60000); pg.wait_for_timeout(1200)
    depth = lambda n: round(pg.evaluate('(n)=>window.__laptop.userData.keyDepth(n)', n), 2)
    for name, off in (('btn_pad_l', (0, 0.0016, 0.007)), ('btn_pad_r', (0, 0.0016, 0.007)), ('btn_power', (0, 0.0005, 0))):
        if name == 'btn_power': pg.goto(base + 'index.html#view=keys'); pg.reload(); pg.wait_for_function('document.documentElement.dataset.laptop47', timeout=60000); pg.wait_for_timeout(1200)   # кнопка питания — в другом ракурсе
        x, y = pg.evaluate(PT, [name, list(off)])
        hit = pg.evaluate('([x,y])=>window.__keyAt({clientX:x, clientY:y})', [x, y])
        assert pg.evaluate('([x,y])=>document.elementFromPoint(x,y).id', [x, y]) == 'view', 'точка закрыта подсказкой страницы'
        y0 = pg.evaluate("(n)=>{const o=window.__laptop.getObjectByName(n==='btn_power'?'power_button':(n==='btn_pad_l'?'pad_button_l':'pad_button_r')); o.updateWorldMatrix(true,false); const V=o.position.constructor; return o.localToWorld(new V(0,0,n==='btn_power'?0:0.006)).y}", name)
        pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(260); held = depth(name)
        y1 = pg.evaluate("(n)=>{const o=window.__laptop.getObjectByName(n==='btn_power'?'power_button':(n==='btn_pad_l'?'pad_button_l':'pad_button_r')); o.updateWorldMatrix(true,false); const V=o.position.constructor; return o.localToWorld(new V(0,0,n==='btn_power'?0:0.006)).y}", name)
        pg.screenshot(path=f'{out}/press_{name}.png'); pg.mouse.up(); pg.wait_for_timeout(350); rel = depth(name)
        say(hit == name and held == 1 and rel == 0, f'{name}: луч попал в {hit} | держим {held} | отпустили {rel} | передний край ушёл на {round((y0 - y1) * 1000, 2)} мм')
    x, y = pg.evaluate(PT, ['btn_power', [0, 0.0005, 0]]); q0 = pg.evaluate('window.__q()'); pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 60, y + 10, steps=6); pg.mouse.up(); pg.wait_for_timeout(500)
    q1 = pg.evaluate('window.__q()'); print('ведение с кнопки: поворот изменился', any(abs(a - c) > 1e-3 for a, c in zip(q0, q1)), '| кнопка в конце', depth('btn_power'))
    f0 = pg.evaluate('window.__frames()'); pg.wait_for_timeout(1500); print('кадров в покое', pg.evaluate('window.__frames()') - f0, '| консоль', msgs[:3], '| ошибок', bad)
    b.close()
