#!/usr/bin/env python3
# noesis-roads-creator — annotate.py
# Disegna sopra l'immagine pulita i riquadri e le didascalie dei dettagli notevoli.
# Uso: python3 annotate.py <immagine> <dettagli.json> <output.jpg>
#   dettagli.json: [{ "title": "...", "category": "...", "region": {"x","y","width","height"} }]  (coordinate 0..1)
# Stampa sempre RIQUADRI_DISEGNATI n / DIDASCALIE_DISEGNATE n (deve essere n == numero dettagli).
import json, os, sys

GOLD = (222, 166, 60)          # riquadro (stile viewer)
DARK = (22, 26, 33)            # sfondo chip didascalia
FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    'C:/Windows/Fonts/arialbd.ttf',
]

def load_font(size):
    from PIL import ImageFont
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    try:
        return ImageFont.load_default(size)
    except TypeError:
        return ImageFont.load_default()

def intersects(a, b):
    # a, b = (x0, y0, x1, y1)
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])

def main():
    image_path, details_path, out_path = sys.argv[1:4]
    with open(details_path, encoding='utf-8') as f:
        items = json.load(f)
    if not items:
        print('ERRORE: nessun dettaglio da annotare', file=sys.stderr)
        sys.exit(2)

    from PIL import Image, ImageDraw
    img = Image.open(image_path).convert('RGB')
    W, H = img.size
    draw = ImageDraw.Draw(img)

    boxes_drawn = 0
    captions_drawn = 0
    line_w = max(2, round(W / 700))
    font_size = max(13, round(W * 0.016))
    font = load_font(font_size)
    pad = 5

    def px(v, limit):
        return int(round(max(0.0, min(1.0, v)) * limit))

    placed_chips = []

    for i, it in enumerate(items, start=1):
        r = it.get('region', {})
        x0 = px(r.get('x', 0), W)
        y0 = px(r.get('y', 0), H)
        x1 = px(r.get('x', 0) + r.get('width', 0), W)
        y1 = px(r.get('y', 0) + r.get('height', 0), H)
        if x1 - x0 < 4 or y1 - y0 < 4:
            continue

        # riquadro: alone bianco + linea oro, ben visibile su ogni dipinto
        draw.rectangle([x0 - 2, y0 - 2, x1 + 2, y1 + 2], outline=(255, 255, 255), width=line_w + 1)
        draw.rectangle([x0, y0, x1, y1], outline=GOLD, width=line_w)
        boxes_drawn += 1
        print('BOX{} {} {} {} {}'.format(i, x0, y0, x1, y1))

        # didascalia "N · Titolo": chip scuro con testo bianco, MAI sovrapposto ad altri chip
        title = '{} · {}'.format(i, it.get('title', '')).strip()
        if len(title) > 60:
            title = title[:57] + '…'
        bboxf = font.getbbox(title)
        tw = bboxf[2] - bboxf[0]
        th = bboxf[3] - bboxf[1]
        cw = tw + pad * 2
        chh = th + pad * 2

        def make_rect(cy):
            cx = max(2, min(x0, W - cw - 2))
            return (int(cx), int(max(2, min(cy, H - chh - 2))), int(min(cx + cw, W - 2)), int(max(2, min(cy + chh, H - 2))))

        cand = None
        # 1) sopra il riquadro, salendo finché trova uno spazio libero
        if y0 - chh - 4 >= 2:
            for k in range(100):
                cy = y0 - chh - 4 - k * (chh + 2)
                if cy < 2:
                    break
                rect = make_rect(cy)
                if rect[2] - rect[0] >= 20 and not any(intersects(rect, p) for p in placed_chips):
                    cand = rect
                    break
        # 2) dentro il riquadro (in alto), scendendo finché trova spazio
        if cand is None:
            for k in range(150):
                cy = y0 + 6 + k * (chh + 2)
                if cy + chh > H - 2:
                    break
                rect = make_rect(cy)
                if not any(intersects(rect, p) for p in placed_chips):
                    cand = rect
                    break
        # 3) ultima risorsa: primo spazio libero scorrendo l'immagine
        if cand is None:
            for ky in range(2, max(3, H - chh - 2), 6):
                rect = make_rect(ky)
                if not any(intersects(rect, p) for p in placed_chips):
                    cand = rect
                    break
        if cand is None:
            cand = make_rect(max(2, min(y0, H - chh - 2)))

        chip = Image.new('RGBA', (cand[2] - cand[0], cand[3] - cand[1]), (0, 0, 0, 0))
        cd = ImageDraw.Draw(chip)
        cd.rounded_rectangle([0, 0, chip.width - 1, chip.height - 1], radius=6,
                             fill=(DARK[0], DARK[1], DARK[2], 215))
        cd.text((pad, pad - bboxf[1]), title, font=font, fill=(255, 255, 255))
        img.paste(chip, (cand[0], cand[1]), chip)
        placed_chips.append(cand)
        captions_drawn += 1
        print('CHIP{} {} {} {} {}'.format(i, cand[0], cand[1], cand[2], cand[3]))

    img.save(out_path, 'JPEG', quality=92)
    print('OK {}x{} -> {}'.format(W, H, out_path))
    print('RIQUADRI_DISEGNATI {}'.format(boxes_drawn))
    print('DIDASCALIE_DISEGNATE {}'.format(captions_drawn))
    if boxes_drawn != captions_drawn:
        print('AVVISO: riquadri e didascalie non coincidono', file=sys.stderr)

if __name__ == '__main__':
    main()
