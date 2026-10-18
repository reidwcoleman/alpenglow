# Sizes the textures for the web: the people's colour maps at 2048 (4096 was far more than a
# rider ever covers on screen) and their normals at 1024, plus half-size copies of those and of
# the terrain's scanned textures in lo/ folders for phones (the Fast setting).
#   python3 tools/shrink_assets.py
from PIL import Image
import glob, os

def save(im, path, q):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', quality=q, method=6)

def fit(im, w):
    return im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)

for f in sorted(glob.glob('public/people/*.webp')):
    name = os.path.basename(f)
    im = Image.open(f).convert('RGB')
    cap = 2048 if name.endswith('_c.webp') else 1024
    if im.width > cap:
        save(fit(im, cap), f, 82)
        im = Image.open(f).convert('RGB')
    save(fit(im, cap // 2), f'public/people/lo/{name}', 78)
for f in sorted(glob.glob('public/people/*_m.png')):
    im = Image.open(f)
    os.makedirs('public/people/lo', exist_ok=True)
    fit(im, max(256, im.width // 2)).save(f'public/people/lo/{os.path.basename(f)}', optimize=True)
for f in sorted(glob.glob('public/tex/*.webp')):
    im = Image.open(f).convert('RGB')
    save(fit(im, 1024), f'public/tex/lo/{os.path.basename(f)}', 80)
for d in ['public/people', 'public/people/lo', 'public/tex', 'public/tex/lo']:
    tot = sum(os.path.getsize(p) for p in glob.glob(d + '/*.*'))
    print(f'{d:20s} {tot / 1e6:6.2f} MB')
