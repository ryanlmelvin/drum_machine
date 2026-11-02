"""Generate DrumCue's original Q/drum-rim icon. Requires Pillow; MIT licensed."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / 'icons'
BACKGROUND = '#101313'
HEAD = '#1c2221'
RIM = '#ffb58d'
STICK = '#f4f1eb'

# A top-view drum rim becomes the Q bowl; a rounded drumstick makes its tail.
# All foreground geometry is inside the PWA maskable icon's 80% safe circle.
SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="110" fill="#101313"/>
  <circle cx="238" cy="238" r="130" fill="#1c2221" stroke="#ffb58d" stroke-width="32"/>
  <path d="m274 274 105 105" fill="none" stroke="#f4f1eb" stroke-width="22" stroke-linecap="round"/>
  <circle cx="268" cy="268" r="17" fill="#f4f1eb"/>
</svg>
'''
(ICONS / 'icon.svg').write_text(SVG)


def render(size, maskable=False):
    scale = 4
    canvas = 512 * scale
    image = Image.new('RGBA', (canvas, canvas), BACKGROUND if maskable else (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    def box(x0, y0, x1, y1):
        return tuple(round(v * scale) for v in (x0, y0, x1, y1))
    if not maskable:
        draw.rounded_rectangle(box(0, 0, 512, 512), radius=110 * scale, fill=BACKGROUND)
    # Filled disks give the exact outer/inner bounds of SVG's centered stroke.
    draw.ellipse(box(92, 92, 384, 384), fill=RIM)
    draw.ellipse(box(124, 124, 352, 352), fill=HEAD)
    draw.line([(274 * scale, 274 * scale), (379 * scale, 379 * scale)], fill=STICK, width=22 * scale)
    for x, y, radius in [(274, 274, 11), (379, 379, 11), (268, 268, 17)]:
        draw.ellipse(box(x-radius, y-radius, x+radius, y+radius), fill=STICK)
    return image.resize((size, size), Image.Resampling.LANCZOS)

for name, size, maskable in [
    ('icon-192.png', 192, False),
    ('icon-512.png', 512, False),
    ('icon-maskable-512.png', 512, True),
    ('apple-touch-icon.png', 180, True),
]:
    render(size, maskable).save(ICONS / name)

if __name__ == '__main__':
    print('Generated DrumCue SVG and four PNG icons.')
