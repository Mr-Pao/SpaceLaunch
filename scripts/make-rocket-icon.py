# 生成项目火箭图标 static/rocket.png（透明背景，4 倍超采样抗锯齿）
# 用法: python scripts/make-rocket-icon.py
from PIL import Image, ImageDraw

S = 4  # 超采样倍率
W, H = 240, 480

def s(v):
    return int(round(v * S))

img = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

WHITE = (248, 250, 252, 255)
EDGE = (203, 216, 227, 255)
FIN = (148, 163, 184, 255)
NOZZLE = (100, 116, 139, 255)
RING = (203, 213, 225, 255)
GLASS = (56, 189, 248, 255)
SHINE = (255, 255, 255, 255)

# 尾翼（先画，让箭体压在上面）
d.polygon([(s(60), s(300)), (s(18), s(412)), (s(60), s(412))], fill=FIN)
d.polygon([(s(180), s(300)), (s(222), s(412)), (s(180), s(412))], fill=FIN)

# 圆顶（竖椭圆，上半即为整流罩尖头）
d.ellipse([s(60), s(0), s(180), s(150)], fill=WHITE)

# 箭体
d.rectangle([s(60), s(75), s(180), s(380)], fill=WHITE)

# 喷口
d.rectangle([s(88), s(380), s(152), s(412)], fill=NOZZLE)

# 舷窗
d.ellipse([s(94), s(140), s(146), s(192)], fill=RING)
d.ellipse([s(102), s(148), s(138), s(184)], fill=GLASS)
d.ellipse([s(108), s(154), s(122), s(168)], fill=SHINE)

img = img.resize((W, H), Image.LANCZOS)
img.save("static/rocket.png", optimize=True)
print("saved static/rocket.png")
