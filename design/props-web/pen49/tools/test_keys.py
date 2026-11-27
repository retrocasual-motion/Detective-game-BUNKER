# test_keys.py — проверка кнопок, лампочки и подписи с номером записи ручки-диктофона 49 (headless Chrome, Playwright).
# Запуск: python tools/test_keys.py http://127.0.0.1:8749/ shots
# Заодно снимает кадры движения: нажатие кнопки (каждые ~16 мс) и мигание лампочки — смотреть глазами до сдачи.
import sys, os
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
PT = '''([name, off]) => { const o = window.__phone.getObjectByName(name); o.updateWorldMatrix(true, false);
  const p = o.localToWorld(new o.position.constructor(off[0], off[1], off[2])).project(window.__camera);
  const r = document.getElementById('view').getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; }'''
TOP = [0, 0, 0.0007]   # вершина купола кнопки в координатах её группы
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800}); msgs = []
    pg.on('console', lambda m: msgs.append(m.text) if m.type in ('error', 'warning') else None); pg.on('pageerror', lambda e: msgs.append('ERR ' + str(e)))
    depth = lambda n: round(pg.evaluate('(n)=>window.__phone.userData.keyDepth(n)', n), 2)
    lamp = lambda: pg.evaluate('window.__phone.userData.lampOn()')
    glow = lambda: round(pg.evaluate("window.__phone.getObjectByName('lamp').material.emissiveIntensity"), 2)
    rec = lambda: pg.evaluate('window.__rec()')
    quat = lambda: pg.evaluate('window.__st.q.toArray()')
    turned = lambda a, c: any(abs(x - y) > 1e-3 for x, y in zip(a, c))
    bad = 0
    def say(ok, text):
        global bad
        bad += 0 if ok else 1; print(('ok  ' if ok else 'ПЛОХО ') + text)
    def click(name, hold=300):
        x, y = pg.evaluate(PT, [name, TOP]); hit = pg.evaluate('([x,y])=>window.__keyAt({clientX:x, clientY:y})', [x, y])
        pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(hold); d = depth(name); pg.mouse.up(); pg.wait_for_timeout(350); return hit, d, depth(name)
    pg.goto(base + 'index.html#view=buttons'); pg.reload(); pg.wait_for_function('window.__ready===true'); pg.wait_for_timeout(900)
    r0 = rec(); say(r0['n'] == 1 and not r0['playing'] and not lamp() and glow() == 0, f'в начале: запись {r0["n"]}, стоит, лампочка не горит')
    # пуск: кнопка уходит и возвращается, запись идёт, лампочка горит
    hit, d, rel = click('btn_play'); pg.wait_for_timeout(900); r1 = rec(); pg.screenshot(path=f'{out}/k_play_on.png')
    say(hit == 'btn_play' and d == 1 and rel == 0 and r1['playing'] and r1['t'] > 0.8 and lamp() and glow() > 1, f'пуск: луч попал в {hit} | держим {d} | отпустили {rel} | запись идёт, {round(r1["t"], 1)} с | лампочка горит ({glow()})')
    # вперёд: следующая запись с начала, воспроизведение продолжается
    hit, d, rel = click('btn_next'); r2 = rec()
    say(hit == 'btn_next' and d == 1 and rel == 0 and r2['n'] == 2 and r2['t'] < 1.2 and r2['playing'], f'вперёд: {hit} | держим {d} | отпустили {rel} | запись {r1["n"]} → {r2["n"]}, с начала ({round(r2["t"], 1)} с), идёт: {r2["playing"]}')
    # назад в середине записи — к её началу; назад в начале — к предыдущей
    pg.wait_for_timeout(1900); ta = rec()['t']; hit, d, rel = click('btn_prev', 120); r3 = rec()
    say(hit == 'btn_prev' and d == 1 and rel == 0 and r3['n'] == 2 and ta > 1.5 and r3['t'] < 1.0, f'назад в середине: {hit} | держим {d} | отпустили {rel} | запись {r3["n"]}, {round(ta, 1)} с → {round(r3["t"], 1)} с')
    hit, d, rel = click('btn_prev', 120); r4 = rec(); say(r4['n'] == 1, f'назад в начале записи: запись {r3["n"]} → {r4["n"]}')
    # пауза: лампочка гаснет, время стоит
    hit, d, rel = click('btn_play'); t1 = rec()['t']; pg.wait_for_timeout(500); r5 = rec()
    say(not r5['playing'] and r5['t'] == t1 and not lamp() and glow() == 0, f'пауза: запись стоит ({round(t1, 1)} с), лампочка погасла')
    # края: с седьмой записи «вперёд» никуда не уводит
    for i in range(8): click('btn_next', 100)
    say(rec()['n'] == 7, f'восемь раз «вперёд»: запись {rec()["n"]} из 7')
    for i in range(8): click('btn_prev', 100)
    say(rec()['n'] == 1, f'восемь раз «назад»: запись {rec()["n"]}')
    # ведение с кнопки — поворот вещи, кнопка возвращается
    x, y = pg.evaluate(PT, ['btn_next', TOP]); q0 = quat(); n0 = rec()['n']; pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 70, y + 12, steps=6); pg.mouse.up(); pg.wait_for_timeout(500)
    print('ведение с кнопки «вперёд»: поворот изменился', turned(q0, quat()), '| кнопка в конце', depth('btn_next'), '| запись', n0, '→', rec()['n'])
    # в покое страница не рисует
    pg.goto(base + 'index.html#view=buttons'); pg.reload(); pg.wait_for_function('window.__ready===true'); pg.wait_for_timeout(1500)
    f0 = pg.evaluate('window.__frames()'); pg.wait_for_timeout(1500); f1 = pg.evaluate('window.__frames()'); say(f1 == f0, f'в покое за 1,5 с нарисовано кадров: {f1 - f0}')
    # с обратной стороны кнопки сквозь корпус не нажимаются
    pg.goto(base + 'index.html#view=back'); pg.reload(); pg.wait_for_function('window.__ready===true'); pg.wait_for_timeout(900)
    x, y = pg.evaluate(PT, ['btn_play', TOP]); h = pg.evaluate('([x,y])=>window.__keyAt({clientX:x, clientY:y})', [x, y]); say(h is None, f'с обратной стороны луч попал в {h}')
    # ---- кадры движения: нажатие кнопки крупно ----
    pg.goto(base + 'index.html#view=buttonsclose&clean=1'); pg.reload(); pg.wait_for_function('window.__ready===true'); pg.wait_for_timeout(900)
    x, y = pg.evaluate(PT, ['btn_play', TOP]); pg.mouse.move(x, y); seq = []
    pg.screenshot(path=f'{out}/f_press_00.png'); pg.mouse.down()
    for i in range(1, 6): pg.wait_for_timeout(14); seq.append(depth('btn_play')); pg.screenshot(path=f'{out}/f_press_{i:02d}.png')
    pg.wait_for_timeout(200); pg.screenshot(path=f'{out}/f_press_06.png'); seq.append(depth('btn_play')); pg.mouse.up()
    for i in range(7, 12): pg.wait_for_timeout(14); seq.append(depth('btn_play')); pg.screenshot(path=f'{out}/f_press_{i:02d}.png')
    pg.wait_for_timeout(300); seq.append(depth('btn_play')); pg.screenshot(path=f'{out}/f_press_12.png')
    print('глубина кнопки по кадрам:', seq)
    # ---- кадры движения: мигание лампочки при смене записи (лампочка горит — мигание «провалом») ----
    x, y = pg.evaluate(PT, ['btn_next', TOP]); pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.up(); g = []
    for i in range(10): pg.wait_for_timeout(30); g.append(glow()); pg.screenshot(path=f'{out}/f_blink_{i:02d}.png')
    pg.wait_for_timeout(400); g.append(glow()); print('свечение лампочки по кадрам (идёт запись, смена записи):', g)
    print('замечаний:', bad, '| сообщения страницы:', [m for m in msgs if 'favicon' not in m][:5])
    b.close()
