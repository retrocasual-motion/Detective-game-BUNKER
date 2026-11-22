"""Прототип 22.11: следы формулой (бумага, сгибы втрое, углы, кольцо, скоба, зерно скана).
Текст не меняется: слои только умножаются на документ. Будет заменён слоями из библиотеки."""
import numpy as np, sys
from PIL import Image, ImageFilter, ImageDraw
rng=np.random.default_rng(7)
doc=np.asarray(Image.open('act_clean.png').convert('L')).astype(np.float32)/255.
H,W=doc.shape
# 1. бумага: тёплый тон + волокно
def noise(scale,amp):
    n=rng.normal(0,1,(H//scale+2,W//scale+2)).astype(np.float32)
    n=np.asarray(Image.fromarray(n).resize((W,H),Image.BICUBIC))
    return n*amp
paper=0.955+noise(3,0.012)+noise(40,0.018)
# 2. сгибы письма втрое: тень + блик + потемнение вдоль линии
fold=np.ones((H,W),np.float32)
for y0 in (int(H/3),int(2*H/3)):
    yy=np.arange(H)[:,None]-y0
    fold-= 0.10*np.exp(-(yy/3.0)**2)          # линия заломa
    fold-= 0.035*np.exp(-(yy/28.0)**2)*(yy>0) # тень за сгибом
    fold+= 0.03*np.exp(-((yy+6)/5.0)**2)      # блик перед сгибом
    fold-= 0.05*np.exp(-(yy/4.0)**2)*(rng.random((1,W))>0.6)  # прерывистая грязь в заломе
# 3. потёртые углы
yy,xx=np.mgrid[0:H,0:W]
for cy,cx in ((0,0),(0,W),(H,0),(H,W)):
    d=np.hypot(yy-cy,xx-cx); fold-=0.10*np.exp(-(d/90)**2)
# 4. кольцо от кружки — в поле справа внизу, слабое
cy,cx,r=int(H*0.86),int(W*0.80),150
d=np.hypot(yy-cy,xx-cx)
ring=0.10*np.exp(-((d-r)/7)**2)+0.03*(d<r)
ring*= (0.6+0.4*np.asarray(Image.fromarray(rng.random((20,20)).astype(np.float32)).resize((W,H),Image.BICUBIC)))
stain_col=np.array([0.80,0.66,0.47],np.float32)
# сборка в цвете: бумага * документ (текст не трогаем — только умножение)
base=np.stack([paper*0.99,paper*0.97,paper*0.92],-1)
img=base*doc[...,None]*fold[...,None]
img=img*(1-ring[...,None]*(1-stain_col))
# 5. проколы скобы
im=Image.fromarray((np.clip(img,0,1)*255).astype(np.uint8))
dr=ImageDraw.Draw(im)
for x in (110,150): dr.ellipse((x-4,58-4,x+4,58+4),fill=(70,62,52)); dr.line((x+4,58,x+9,58),fill=(150,140,125),width=2)
# 6. скан: лёгкое зерно и небольшой наклон
a=np.asarray(im).astype(np.float32)/255.; a+=rng.normal(0,0.012,a.shape).astype(np.float32)
im=Image.fromarray((np.clip(a,0,1)*255).astype(np.uint8)).rotate(0.35,resample=Image.BICUBIC,expand=False,fillcolor=(235,232,225))
im.save('act_aged_script.png')
print('ok')
