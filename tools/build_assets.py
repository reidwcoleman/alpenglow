#!/usr/bin/env python3
"""assets-src/ -> public/ (run after tools/fetch_assets.py).

  sky/<name>_bg.jpg   the HDRI's upper hemisphere (plus a sliver below), linear x scale -> sRGB
  sky/sky.json        per sky: that scale, the sun's direction (brightest texel), the sun's and the
                      sky's irradiance (adapted from CenterCourt's build_sky.py)
  tex/*.webp          PBR textures: albedo (sRGB), normal (GL), arm (ao/rough/metal), height
"""
import json, os, subprocess
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets-src')
PUB = os.path.join(ROOT, 'public')


def read_hdr(path):
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                            '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip().split(',')
    w, h = int(probe[0]), int(probe[1])
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'gbrpf32le', '-'],
                         capture_output=True).stdout
    a = np.frombuffer(raw, dtype=np.float32).reshape(3, h, w)
    return np.stack([a[2], a[0], a[1]], axis=-1)


def box_down(img, f):
    h, w, c = img.shape
    return img[: h - h % f, : w - w % f].reshape(h // f, f, w // f, f, c).mean(axis=(1, 3))


def lin2srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def build_sky():
    out = os.path.join(PUB, 'sky')
    os.makedirs(out, exist_ok=True)
    meta = {}
    for fn in sorted(os.listdir(os.path.join(SRC, 'hdri'))):
        if not fn.endswith('.hdr'):
            continue
        name = fn[:-4]
        img = read_hdr(os.path.join(SRC, 'hdri', fn))
        h, w, _ = img.shape
        lum = img @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        small = box_down(lum[..., None], 8)[..., 0]
        y, x = np.unravel_index(np.argmax(small[: small.shape[0] // 2 + 4]), small[: small.shape[0] // 2 + 4].shape)
        u, v = (x + 0.5) / small.shape[1], (y + 0.5) / small.shape[0]
        phi, theta = (u - 0.5) * 2 * np.pi, (0.5 - v) * np.pi
        yy, xx = np.mgrid[0:h, 0:w]
        el = (0.5 - (yy + 0.5) / h) * np.pi
        az = ((xx + 0.5) / w - 0.5) * 2 * np.pi
        sd = np.array([np.cos(theta) * np.cos(phi), np.sin(theta), np.cos(theta) * np.sin(phi)])
        d = np.stack([np.cos(el) * np.cos(az), np.sin(el), np.cos(el) * np.sin(az)], axis=-1)
        near = (d @ sd) > np.cos(np.radians(6))
        sky_ref = float(np.percentile(lum[: h // 2], 99.0))
        hot = near & (lum > sky_ref * 4)
        domega = (2 * np.pi / w) * (np.pi / h) * np.cos(el)
        sunE = (img * (domega * hot)[..., None]).reshape(-1, 3).sum(axis=0)
        up = np.clip(d[..., 1], 0, None)
        skyE = (img * (domega * up * (~hot))[..., None]).reshape(-1, 3).sum(axis=0)
        top = img[: h // 2 + h // 32]
        p = float(np.percentile(lum[: h // 2], 99.7))
        scale = 0.92 / max(p, 1e-6)
        bg = lin2srgb(top * scale)
        Image.fromarray((bg * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, f'{name}_bg.jpg'), quality=88,
                                                               optimize=True, progressive=True)
        # horizon colour (for fog): mean radiance in the band just above the horizon
        band = img[int(h * 0.44): int(h * 0.495)].reshape(-1, 3).mean(axis=0)
        meta[name] = {'scale': round(scale, 6), 'sunE': [round(float(c), 4) for c in sunE],
                      'skyE': [round(float(c), 4) for c in skyE], 'sunUV': [round(float(u), 5), round(float(v), 5)],
                      'sunElevDeg': round(float(np.degrees(theta)), 2), 'horizon': [round(float(c), 4) for c in band],
                      'rows': h, 'bgRows': int(top.shape[0])}
        print(name, meta[name], flush=True)
    json.dump(meta, open(os.path.join(out, 'sky.json'), 'w'), indent=1)


def build_tex():
    out = os.path.join(PUB, 'tex')
    os.makedirs(out, exist_ok=True)
    src = os.path.join(SRC, 'tex')
    for fn in sorted(os.listdir(src)):
        base, ext = os.path.splitext(fn)
        asset, kind = base.rsplit('_', 1) if not base.endswith('nor_gl') else (base[:-7], 'nor_gl')
        short = {'Diffuse': 'c', 'nor_gl': 'n', 'arm': 'arm', 'Displacement': 'h'}[kind]
        im = Image.open(os.path.join(src, fn))
        im = im.convert('L' if short == 'h' else 'RGB')
        size = 2048 if asset.startswith('snow') or short == 'c' else 1024
        im = im.resize((size, size), Image.LANCZOS)
        dst = os.path.join(out, f'{asset}_{short}.webp')
        im.save(dst, 'WEBP', quality=86 if short in ('c', 'h') else 92, method=6)
        print('tex', os.path.basename(dst), os.path.getsize(dst) // 1024, 'KB', flush=True)


build_sky()
build_tex()
