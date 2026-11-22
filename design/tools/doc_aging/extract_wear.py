"""Вытащить из документа с текстом только слой следов: текст и тонкие линии убираются и
заполняются окружающей бумагой. Крупные залитые области (фото, плотные штампы) — вырезать
вручную. Использование: python extract_wear.py in.png out.png"""
import sys, cv2, numpy as np
img = cv2.imread(sys.argv[1])
g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
bg = cv2.medianBlur(cv2.morphologyEx(g, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)), 5)
mask = ((bg.astype(int) - g.astype(int)) > 25).astype(np.uint8) * 255
mask = cv2.dilate(mask, np.ones((5, 5), np.uint8))
cv2.imwrite(sys.argv[2], cv2.inpaint(img, mask, 5, cv2.INPAINT_TELEA))
