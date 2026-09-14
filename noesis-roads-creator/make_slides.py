#!/usr/bin/env python3
# noesis-roads-creator — slide PPTX native da modello intermedio (export-model.mjs).
# Uso: python3 make_slides.py in.json out.pptx
# Struttura: copertina, slide per sezione (titolo + max 2 bullets + immagine), slide fonti.
import base64
import io
import json
import sys

try:
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN
except ImportError:
    print('ERRORE_PPTX: python-pptx non installato. Esegui: pip install python-pptx', file=sys.stderr)
    sys.exit(3)

INK = RGBColor(0x17, 0x34, 0x4A)
CORAL = RGBColor(0xDC, 0x70, 0x56)
MUSTARD = RGBColor(0xE2, 0xAC, 0x44)
WHITE = RGBColor(0xFF, 0xFD, 0xF9)
MUTED = RGBColor(0x6B, 0x7A, 0x83)

LVL_LABEL = {'essenziale': 'Essenziale', 'standard': 'Standard', 'approfondita': 'Approfondita',
             'primaria': 'Primaria', 'secondaria': 'Secondaria', 'universita': 'Università'}


def bg(slide, color):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def textbox(slide, left, top, width, height):
    return slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height)).text_frame


def capoversi(text, per=2):
    # Spezza un paragrafo lungo in capoversi da `per` frasi: respiro di lettura.
    import re as _re
    frasi = [f.strip() for f in _re.split(r'(?<=[.!?])\s+(?=[A-ZÀ-Þ\u201c\u201c"\(])', (text or '').strip()) if f.strip()]
    if not frasi:
        return [text] if (text or '').strip() else []
    return [' '.join(frasi[i:i + per]) for i in range(0, len(frasi), per)]


def bullets_of(sec):
    # Testi INTEGRALI, mai troncati: le slide riportano tutto il contenuto.
    out = []
    for b in sec.get('blocks', []):
        t = b.get('t')
        if t == 'p' and b.get('text'):
            out.extend(capoversi(b['text']))
        elif t == 'h2':
            out.append(b.get('text') or '')
        elif t == 'points':
            for p in b.get('items', []) or []:
                out.append(((p.get('title') or '') + ' ' + (p.get('text') or '')).strip())
        elif t == 'gallery':
            for w in b.get('items', []) or []:
                out.append((w.get('caption') or '') + ((' — ' + w['meta']) if w.get('meta') else ''))
        elif t == 'kv':
            for k, v in b.get('items', []) or []:
                out.append(f'{k}: {v}')
        elif t == 'pair':
            for side in (b.get('a'), b.get('b')):
                if side:
                    out.append(((side.get('caption') or '') + ' ' + ' '.join(side.get('meta', []) or [])).strip())
    return [x for x in out if x]


def first_image(sec, images):
    for b in sec.get('blocks', []):
        cand = None
        if b.get('t') == 'image':
            cand = b.get('image')
        elif b.get('t') == 'gallery' and b.get('items'):
            cand = (b['items'][0] or {}).get('image')
        if cand and cand.get('ref') in (images or {}):
            try:
                return io.BytesIO(base64.b64decode(images[cand['ref']]['data']))
            except Exception:
                return None
    return None


def main():
    if len(sys.argv) != 3:
        print('Uso: make_slides.py in.json out.pptx', file=sys.stderr)
        sys.exit(2)
    with open(sys.argv[1], encoding='utf-8') as f:
        m = json.load(f)
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]

    # copertina
    s = prs.slides.add_slide(blank)
    bg(s, INK)
    lv = m.get('livelli', {}) or {}
    tb = textbox(s, 1, 1, 11.3, 5.5)
    tb.word_wrap = True
    p = tb.paragraphs[0]
    run = p.add_run()
    run.text = m.get('eyebrow', '')
    run.font.size = Pt(18)
    run.font.color.rgb = MUSTARD
    p = tb.add_paragraph()
    run = p.add_run()
    run.text = m.get('titolo', '')
    run.font.size = Pt(44)
    run.font.bold = True
    run.font.color.rgb = WHITE
    p = tb.add_paragraph()
    run = p.add_run()
    run.text = f"{m.get('subtitle', '')} · {LVL_LABEL.get(lv.get('verbosita'), '')} / {LVL_LABEL.get(lv.get('istruzione'), '')}"
    run.font.size = Pt(20)
    run.font.color.rgb = WHITE
    if m.get('coverImage'):
        try:
            im = m['images'][m['coverImage']['ref']]
            s.shapes.add_picture(io.BytesIO(base64.b64decode(im['data'])), Inches(8.5), Inches(1), height=Inches(5.5))
        except Exception:
            pass

    # REGOLA: mai più di 2 punti per slide. Testo integrale, si continua su "(segue)".
    for sec in m.get('sections', []):
        bls = bullets_of(sec)
        chunks = [bls[i:i + 2] for i in range(0, len(bls), 2)] or [[]]
        for ci, chunk in enumerate(chunks):
            s = prs.slides.add_slide(blank)
            bg(s, WHITE)
            tb = textbox(s, 0.7, 0.3, 11.9, 6.9)
            tb.word_wrap = True
            p = tb.paragraphs[0]
            run = p.add_run()
            run.text = sec.get('title', '') + (f' ({ci + 1}/{len(chunks)})' if len(chunks) > 1 else '')
            run.font.size = Pt(32)
            run.font.bold = True
            run.font.color.rgb = INK
            if ci == 0:
                v = sec.get('verifica')
                if v is not None:
                    p = tb.add_paragraph()
                    run = p.add_run()
                    run.text = '✓ Verificato sul web' if not v.get('dubbi') else f"⚠ {v['dubbi']} punti da ricontrollare"
                    run.font.size = Pt(14)
                    run.font.color.rgb = RGBColor(0x47, 0x71, 0x5F) if not v.get('dubbi') else CORAL
            for bl in chunk:
                p = tb.add_paragraph()
                p.text = bl
                p.level = 0
                for run in p.runs:
                    run.font.size = Pt(16)
                    run.font.color.rgb = INK
            if ci == 0:
                img = first_image(sec, m.get('images'))
                if img:
                    try:
                        s.shapes.add_picture(img, Inches(9.3), Inches(5.0), height=Inches(2.0))
                    except Exception:
                        pass

    # fonti, max 2 per slide come ogni altro elenco
    fall = m.get('fonti') or []
    fchunks = [fall[i:i + 2] for i in range(0, len(fall), 2)] or [[]]
    for ci, ch in enumerate(fchunks):
        s = prs.slides.add_slide(blank)
        bg(s, INK)
        tb = textbox(s, 1, 1, 11.3, 5.5)
        tb.word_wrap = True
        p = tb.paragraphs[0]
        run = p.add_run()
        run.text = 'Fonti' + (f' ({ci + 1}/{len(fchunks)})' if len(fchunks) > 1 else '')
        run.font.size = Pt(32)
        run.font.bold = True
        run.font.color.rgb = WHITE
        for f in ch:
            p = tb.add_paragraph()
            run = p.add_run()
            run.text = f.get('title') or f.get('url', '')
            run.font.size = Pt(16)
            run.font.color.rgb = MUSTARD

    prs.save(sys.argv[2])
    print(f"PPTX ok: {sys.argv[2]} ({len(prs.slides)} slide)")


if __name__ == '__main__':
    main()
