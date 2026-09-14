#!/usr/bin/env python3
# noesis-roads-creator — esportazione DOCX nativa da modello intermedio (export-model.mjs).
# Uso: python3 make_docx.py in.json out.docx
# Layout: copertina, indice TOC (campo Word, aggiornato all'apertura),
# sezioni tipizzate, badge verifica, fonti con link, header/footer + numeri pagina.
import base64
import io
import json
import sys

try:
    import docx
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.enum.section import WD_SECTION
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    from docx.shared import Pt, Cm, RGBColor
except ImportError:
    print('ERRORE_DOCX: python-docx non installato. Esegui: pip install python-docx', file=sys.stderr)
    sys.exit(3)

INK = RGBColor(0x17, 0x34, 0x4A)
CORAL = RGBColor(0xDC, 0x70, 0x56)
MUTED = RGBColor(0x6B, 0x7A, 0x83)
GREEN = RGBColor(0x47, 0x71, 0x5F)

LVL_LABEL = {'essenziale': 'Essenziale', 'standard': 'Standard', 'approfondita': 'Approfondita',
             'primaria': 'Primaria', 'secondaria': 'Secondaria', 'universita': 'Università'}


def style_doc(doc):
    st = doc.styles['Normal']
    st.font.name = 'Georgia'
    st.font.size = Pt(11)
    st.font.color.rgb = INK
    st.paragraph_format.space_after = Pt(6)
    st.paragraph_format.line_spacing = 1.4
    for i, (sz, before) in enumerate([(22, 12), (16, 12), (13, 10)], start=1):
        h = doc.styles[f'Heading {i}']
        h.font.name = 'Georgia'
        h.font.size = Pt(sz)
        h.font.color.rgb = INK
        h.paragraph_format.space_before = Pt(before)
        h.paragraph_format.space_after = Pt(4)
    cap = doc.styles.add_style('Caption2', 1)
    cap.base_style = doc.styles['Normal']
    cap.font.size = Pt(9)
    cap.font.color.rgb = MUTED
    cap.font.italic = True


def add_page_number(run):
    fld1 = OxmlElement('w:fldChar')
    fld1.set(qn('w:fldCharType'), 'begin')
    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = 'PAGE'
    fld2 = OxmlElement('w:fldChar')
    fld2.set(qn('w:fldCharType'), 'end')
    run._r.append(fld1)
    run._r.append(instr)
    run._r.append(fld2)


def add_hyperlink(par, url, text):
    part = par.part
    r_id = part.relate_to(url, docx.opc.constants.RELATIONSHIP_TYPE.HYPERLINK, is_external=True)
    hl = OxmlElement('w:hyperlink')
    hl.set(qn('r:id'), r_id)
    run = OxmlElement('w:r')
    rpr = OxmlElement('w:rPr')
    color = OxmlElement('w:color')
    color.set(qn('w:val'), 'DC7056')
    rpr.append(color)
    run.append(rpr)
    t = OxmlElement('w:t')
    t.text = text
    run.append(t)
    hl.append(run)
    par._p.append(hl)


def add_toc(par):
    run = par.add_run()
    fld1 = OxmlElement('w:fldChar')
    fld1.set(qn('w:fldCharType'), 'begin')
    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = 'TOC \\o "1-2" \\h \\z \\u'
    fld2 = OxmlElement('w:fldChar')
    fld2.set(qn('w:fldCharType'), 'separate')
    t = OxmlElement('w:t')
    t.text = 'Aggiorna l\u2019indice all\u2019apertura (tasto destro → Aggiorna campo).'
    fld3 = OxmlElement('w:fldChar')
    fld3.set(qn('w:fldCharType'), 'end')
    for el in (fld1, instr, fld2):
        run._r.append(el)
    run2 = par.add_run()
    run2._r.append(t)
    run2 = par.add_run()
    run2._r.append(fld3)


def add_image(doc, par, images, ref, width_cm=13):
    if not ref or not ref.get('ref') or ref['ref'] not in (images or {}):
        return
    im = images[ref['ref']]
    try:
        data = base64.b64decode(im['data'])
    except Exception:
        return
    par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    par.add_run().add_picture(io.BytesIO(data), width=Cm(width_cm))


def add_caption(doc, text):
    p = doc.add_paragraph(style='Caption2')
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run(text or '')


def add_badge(doc, sec):
    v = sec.get('verifica')
    if not v:
        return
    p = doc.add_paragraph()
    run = p.add_run('✓ Verificato sul web' if not v.get('dubbi') else f"⚠ {v['dubbi']} punti da ricontrollare")
    run.font.size = Pt(9)
    run.font.bold = True
    run.font.color.rgb = GREEN if not v.get('dubbi') else CORAL


def add_blocks(doc, sec, images):
    for b in sec.get('blocks', []):
        t = b.get('t')
        if t == 'p':
            doc.add_paragraph(b.get('text') or '')
        elif t == 'h2':
            doc.add_paragraph(b.get('text') or '', style='Heading 3')
        elif t == 'image':
            p = doc.add_paragraph()
            add_image(doc, p, images, b.get('image'))
            if b.get('caption'):
                add_caption(doc, b['caption'])
        elif t == 'points':
            for it in b.get('items', []) or []:
                p = doc.add_paragraph(style='List Bullet')
                run = p.add_run((it.get('title') or '') + ' ')
                run.bold = True
                p.add_run(it.get('text') or '')
        elif t == 'gallery':
            for w in b.get('items', []) or []:
                p = doc.add_paragraph()
                add_image(doc, p, images, w.get('image'), width_cm=11)
                add_caption(doc, (w.get('caption') or '') + ((' · ' + w['meta']) if w.get('meta') else ''))
        elif t == 'kv':
            rows = b.get('items', []) or []
            if not rows:
                continue
            table = doc.add_table(rows=len(rows), cols=2)
            table.style = 'Light Grid Accent 1'
            table.alignment = WD_TABLE_ALIGNMENT.CENTER
            for i, (k, v) in enumerate(rows):
                table.cell(i, 0).text = k or ''
                table.cell(i, 1).text = v or ''
        elif t == 'pair':
            table = doc.add_table(rows=1, cols=2)
            table.style = 'Light Grid Accent 1'
            for j, side in enumerate([b.get('a'), b.get('b')]):
                cell = table.cell(0, j)
                cell.text = ''
                if not side:
                    continue
                p = cell.paragraphs[0]
                run = p.add_run(side.get('caption') or '')
                run.bold = True
                if side.get('image'):
                    pp = cell.add_paragraph()
                    # immagine nella cella
                    ref = side['image']
                    if ref.get('ref') in (images or {}):
                        try:
                            pp.alignment = WD_ALIGN_PARAGRAPH.CENTER
                            pp.add_run().add_picture(io.BytesIO(base64.b64decode(images[ref['ref']]['data'])), width=Cm(7))
                        except Exception:
                            pass
                for mm in side.get('meta', []) or []:
                    cell.add_paragraph(mm or '')


def main():
    if len(sys.argv) != 3:
        print('Uso: make_docx.py in.json out.docx', file=sys.stderr)
        sys.exit(2)
    with open(sys.argv[1], encoding='utf-8') as f:
        m = json.load(f)
    doc = Document()
    style_doc(doc)
    sec = doc.sections[0]
    sec.different_first_page_header_footer = True

    # header/footer (non in prima pagina)
    hp = sec.header.paragraphs[0]
    hp.text = ''
    run = hp.add_run(m.get('titolo', '').upper()[:80])
    run.font.size = Pt(8)
    run.font.color.rgb = MUTED
    fp = sec.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = fp.add_run('— ')
    run.font.size = Pt(8)
    run.font.color.rgb = MUTED
    add_page_number(fp.add_run())
    run = fp.add_run(' —')
    run.font.size = Pt(8)
    run.font.color.rgb = MUTED

    # copertina
    for _ in range(4):
        doc.add_paragraph('')
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(m.get('eyebrow', ''))
    run.font.size = Pt(10)
    run.font.color.rgb = CORAL
    run.bold = True
    t = doc.add_paragraph()
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = t.add_run(m.get('titolo', ''))
    run.font.size = Pt(30)
    run.bold = True
    run.font.color.rgb = INK
    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub.add_run(m.get('subtitle', '')).font.size = Pt(13)
    lv = m.get('livelli', {}) or {}
    lp = doc.add_paragraph()
    lp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    lp.add_run(f"Livelli: {LVL_LABEL.get(lv.get('verbosita'), lv.get('verbosita', ''))} / {LVL_LABEL.get(lv.get('istruzione'), lv.get('istruzione', ''))}").font.size = Pt(10)
    if m.get('coverImage'):
        p = doc.add_paragraph()
        add_image(doc, p, m.get('images'), m['coverImage'], width_cm=13)
    doc.add_page_break()

    # indice
    doc.add_paragraph('Indice', style='Heading 1')
    add_toc(doc.add_paragraph())
    doc.add_page_break()

    # sezioni
    for s in m.get('sections', []):
        doc.add_paragraph(s.get('title', ''), style='Heading 1')
        add_badge(doc, s)
        add_blocks(doc, s, m.get('images'))

    # fonti
    if m.get('fonti'):
        doc.add_paragraph('Fonti', style='Heading 1')
        for f in m['fonti']:
            p = doc.add_paragraph(style='List Bullet')
            if f.get('url'):
                add_hyperlink(p, f['url'], f.get('title') or f['url'])
            else:
                p.add_run(f.get('title') or '')

    # disclaimer
    p = doc.add_paragraph()
    run = p.add_run(m.get('disclaimer', ''))
    run.font.size = Pt(8)
    run.font.color.rgb = MUTED
    run.italic = True

    doc.save(sys.argv[2])
    print(f'DOCX ok: {sys.argv[2]}')


if __name__ == '__main__':
    main()
