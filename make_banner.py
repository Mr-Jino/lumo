# -*- coding: utf-8 -*-
"""1280x640 横版头图：左边标题，右边笔记本墨线图"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
import os

W, H = 1280, 640
OUT = "docs/banner.png"
SRC = "C:/Users/17704/Desktop/新建文件夹/光球动画特效介绍.png"

F_SERIF = "C:/Windows/Fonts/NotoSerifSC-VF.ttf"
F_SANS = "C:/Windows/Fonts/NotoSansSC-VF.ttf"
PAPER = (251, 250, 247)
INK = (23, 25, 29)
GRAY = (104, 108, 114)
LIGHT = (152, 156, 162)
RULE = (216, 216, 210)

def font(p, s):
    return ImageFont.truetype(p, s)

im = Image.new("RGB", (W, H), PAPER)
g = Image.new("L", (W // 4, H // 4), 0)
ImageDraw.Draw(g).ellipse((-40, -60, W // 4 + 40, H // 4 + 60), fill=22)
g = g.filter(ImageFilter.GaussianBlur(50)).resize((W, H), Image.BILINEAR)
im = Image.composite(Image.new("RGB", (W, H), (253, 252, 249)), im, g.point(lambda v: v))
d = ImageDraw.Draw(im)

# 右侧笔记本图：白底乘上去
src = Image.open(SRC).convert("RGB")
mask = src.convert("L").point(lambda v: 255 if v < 246 else 0)
bb = mask.getbbox()
src = src.crop(bb)
tw = 760
th = int(src.size[1] * tw / src.size[0])
img = src.resize((tw, th), Image.LANCZOS)
ix, iy = W - tw - 26, (H - th) // 2 + 6
box = (ix, iy, ix + tw, iy + th)
im.paste(ImageChops.multiply(im.crop(box), img), (ix, iy))

# 左栏
M = 72
d.text((M, 96), "LUMO　·　跑光", font=font(F_SANS, 19), fill=LIGHT)
y = 146
for line in ["你敲的每一下，", "都有人在跑。"]:
    d.text((M, y), line, font=font(F_SERIF, 52), fill=INK)
    y += 74

y += 18
for line in ["任务栏上的两只打工光点。", "键盘青，鼠标粉，跑满了长翅膀飞走。"]:
    d.text((M, y), line, font=font(F_SANS, 21), fill=GRAY)
    y += 36

d.line([(M, 452), (M + 300, 452)], fill=RULE)
d.text((M, 474), "Windows 10 / 11　·　Electron　·　MIT", font=font(F_SANS, 18), fill=LIGHT)

im.save(OUT, quality=96)
print("saved", OUT, im.size)
