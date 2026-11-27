# sharpness.py — замер резкости: одни и те же кадры с разными наборами карт.
# Мера — средняя энергия градиента (Tenengrad) и энергия Лапласа в окне кадра, занятом вещью; за 100 % принят набор ultra.
# Запуск: python tools/sharpness.py <shots_dir> keys cam   (ищет <имя>_{low,full,ultra}.png)
import sys, cv2, numpy as np
d = sys.argv[1]
for name in sys.argv[2:]:
    res = {}
    for s in ('low', 'full', 'ultra'):
        im = cv2.imread(f'{d}/{name}_{s}.png'); g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
        h, w = g.shape; g = g[int(h * .15):int(h * .85), int(w * .2):int(w * .8)]
        gx, gy = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
        res[s] = (float((gx * gx + gy * gy).mean()), float(cv2.Laplacian(g, cv2.CV_32F).var()))
    u = res['ultra']
    print(name, ' | '.join(f"{s}: градиент {res[s][0] / u[0] * 100:.0f} %, Лаплас {res[s][1] / u[1] * 100:.0f} %" for s in ('low', 'full', 'ultra')))
