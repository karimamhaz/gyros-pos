"""Builds the application icon (icon.png and icon.ico) from the logo.

Run from the project folder:  uv run --no-project --with pillow python desktop/packaging/make-icon.py
With a better original logo:  ... make-icon.py path/to/logo.png "left,top,right,bottom"
The box picks the part of the logo used as the square mark. The default is the skewer in its red
ring, cut clear of the letters and the red swoosh around it (that cut only fits the menu logo).
"""

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

HERE = Path(__file__).resolve().parent
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parents[1] / "docs/design/logo.png"
BOX = tuple(int(v) for v in sys.argv[2].split(",")) if len(sys.argv) > 2 else (270, 0, 434, 166)
SIZE = 512
DARK = (22, 22, 22, 255)

mark = Image.open(SOURCE).convert("RGBA")
if len(sys.argv) == 1:
    # The ring is centred at (352, 83) with a radius of 78; the skewer tip reaches below it.
    keep = Image.new("L", mark.size, 0)
    draw = ImageDraw.Draw(keep)
    draw.ellipse((352 - 76, 83 - 76, 352 + 76, 83 + 76), fill=255)
    draw.rectangle((0, 138, mark.width, mark.height), fill=0)  # no swoosh under the ring
    draw.rectangle((338, 0, 366, 138), fill=255)  # the top of the skewer
    draw.rectangle((343, 138, 358, 166), fill=255)  # and its tip, without the swoosh beside it
    mark.putalpha(ImageChops.multiply(mark.getchannel("A"), keep))
mark = mark.crop(BOX)
side = round(SIZE * 0.74)
mark = mark.resize((side, round(side * mark.height / mark.width)), Image.LANCZOS)

canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
ImageDraw.Draw(canvas).rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=SIZE // 5, fill=DARK)
canvas.alpha_composite(mark, ((SIZE - mark.width) // 2, (SIZE - mark.height) // 2))

canvas.save(HERE / "icon.png")
canvas.save(HERE / "icon.ico", sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
print("wrote", HERE / "icon.png", "and", HERE / "icon.ico")
