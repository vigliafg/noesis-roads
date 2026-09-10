#!/usr/bin/env python3
# noesis-roads-creator — compose_thumb.py
# Crea la miniatura composita per la scheda "Faccia a faccia":
# metà sinistra dell'opera A + metà destra dell'opera B, affiancate.
# Uso: python3 compose_thumb.py <immagine_a> <immagine_b> <output.jpg>
import sys


def main():
    image_a, image_b, out_path = sys.argv[1:4]
    from PIL import Image
    a = Image.open(image_a).convert('RGB')
    b = Image.open(image_b).convert('RGB')
    h = min(a.height, b.height, 640)
    a = a.resize((max(2, int(a.width * h / a.height)), h))
    b = b.resize((max(2, int(b.width * h / b.height)), h))
    half_a = a.crop((0, 0, a.width // 2, h))
    half_b = b.crop((b.width - b.width // 2, 0, b.width, h))
    out = Image.new('RGB', (half_a.width + half_b.width, h), (20, 20, 20))
    out.paste(half_a, (0, 0))
    out.paste(half_b, (half_a.width, 0))
    out.save(out_path, 'JPEG', quality=88)
    print('COMPOSTA {}x{}'.format(out.width, out.height))
    print('OK {}'.format(out_path))


if __name__ == '__main__':
    main()