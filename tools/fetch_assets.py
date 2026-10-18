#!/usr/bin/env python3
"""Fetch the CC0 source assets into assets-src/ (git-ignored), then run tools/build_assets.py.

  hdri/      Poly Haven pure-sky HDRIs (4k .hdr) for the four conditions
  tex/       Poly Haven PBR textures (2k): snow, rock
Baked trees (ApexGP's bake of Poly Haven's fir scans) and the Rocketbox avatars (Microsoft, MIT,
converted by CenterCourt's pipeline) are copied from those checkouts when present.
"""
import json, os, shutil, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets-src')
UA = {'User-Agent': 'alpenglow-asset-fetch'}
HDRIS = {
    'bluebird': 'kloofendal_48d_partly_cloudy_puresky',
    'golden': 'kloppenheim_06_puresky',
    'alpenglow': 'qwantani_dusk_2_puresky',
    'storm': 'snow_field_puresky',
    'night': 'qwantani_night_puresky',
}
TEXTURES = ['snow_02', 'rock_face_04']


def get(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r, open(dst + '.part', 'wb') as f:
        shutil.copyfileobj(r, f, 1 << 20)
    os.replace(dst + '.part', dst)
    print('got', os.path.relpath(dst, ROOT), os.path.getsize(dst) // 1024, 'KB', flush=True)


def files(asset):
    return json.load(urllib.request.urlopen(urllib.request.Request(f'https://api.polyhaven.com/files/{asset}', headers=UA)))


for key, asset in HDRIS.items():
    f = files(asset)
    get(f['hdri']['4k']['hdr']['url'], os.path.join(SRC, 'hdri', f'{key}.hdr'))
for asset in TEXTURES:
    f = files(asset)
    for m in ['Diffuse', 'nor_gl', 'arm', 'Displacement']:
        if m in f and '2k' in f[m]:
            fmt = 'jpg' if 'jpg' in f[m]['2k'] else 'png'
            get(f[m]['2k'][fmt]['url'], os.path.join(SRC, 'tex', f'{asset}_{m}.{fmt}'))

# baked fir trees (ApexGP) and Rocketbox avatars (CenterCourt)
def copy_tree(src, dst, pick=None):
    if not os.path.isdir(src):
        print('missing', src)
        return
    os.makedirs(dst, exist_ok=True)
    for fn in os.listdir(src):
        if pick and not pick(fn):
            continue
        if not os.path.exists(os.path.join(dst, fn)):
            shutil.copy2(os.path.join(src, fn), os.path.join(dst, fn))

copy_tree(os.path.expanduser('~/ApexGP/public/trees'), os.path.join(ROOT, 'public', 'trees'))
PEOPLE = ('Sports_Male_02', 'Sports_Male_03', 'Sports_Male_04', 'Sports_Female_02', 'Male_Adult_05', 'Male_Adult_08', 'Female_Adult_01', 'Female_Adult_03')
copy_tree(os.path.expanduser('~/CenterCourt/public/people'), os.path.join(ROOT, 'public', 'people'),
          lambda fn: fn.startswith(PEOPLE) or fn == 'index.json')
print('done')
