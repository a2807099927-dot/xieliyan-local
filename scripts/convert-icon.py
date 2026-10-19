from PIL import Image
import os

src = r'E:\梨眼\图标.png'
out_png = r'E:\梨眼\resources\icon.png'
out_ico = r'E:\梨眼\resources\icon.ico'
out_favicon = r'E:\梨眼\site\favicon.png'

img = Image.open(src).convert('RGBA')

# 自动裁剪透明边框
bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)

print(f'Cropped size: {img.size}')

# 生成 1024x1024 PNG (Mac icon)
icon_1024 = img.resize((1024, 1024), Image.LANCZOS)
icon_1024.save(out_png, 'PNG')
print(f'Saved: {out_png}')

# 生成 256x256 favicon
icon_256 = img.resize((256, 256), Image.LANCZOS)
icon_256.save(out_favicon, 'PNG')
print(f'Saved: {out_favicon}')

# 生成 ICO (多尺寸: 16, 32, 48, 64, 128, 256)
sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
icons = [img.resize(s, Image.LANCZOS) for s in sizes]
icons[0].save(out_ico, format='ICO', sizes=sizes, append_images=icons[1:])
print(f'Saved: {out_ico}')

print('Done!')
