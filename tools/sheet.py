# contact sheet of a frame folder: python3 tools/sheet.py <dir> <out.jpg> [cols] [every]
import sys, glob
from PIL import Image
d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
every = int(sys.argv[4]) if len(sys.argv) > 4 else 1
fs = sorted(glob.glob(d + '/f*.jpg'))[::every][:cols * 4]
w, h = 480, 270
rows = (len(fs) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * h))
for i, f in enumerate(fs): S.paste(Image.open(f).resize((w, h)), ((i % cols) * w, (i // cols) * h))
S.save(out, quality=82)
