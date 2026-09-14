#!/usr/bin/env python3
# noesis-roads-creator — make_pdf.py
# Genera un PDF "libro d'arte" per un tipo di scheda (opera | soggetto | confronto).
# Uso: python3 make_pdf.py <input.json> <output.pdf>
#   input.json: payload tipografico (vedi build*PdfPayload in server.mjs) con
#               immagini in base64; qui vengono decodificate, (eventualmente)
#               ritagliate e impaginate con reportlab su pagine A4 stile libro.
import base64, io, json, os, sys, tempfile

# --- reportlab: import espliciti con messaggio chiaro se assente ---
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                    Spacer, Image, PageBreak, Table, TableStyle,
                                    KeepTogether, NextPageTemplate, HRFlowable)
    from reportlab.platypus.tableofcontents import TableOfContents
    from reportlab.lib import colors
except ImportError as exc:  # pragma: no cover
    print('ERRORE_PDF: reportlab non installato. Esegui: pip install reportlab', file=sys.stderr)
    sys.exit(3)


# ---------- palette (stile libro d'arte) ----------
PAPER   = colors.HexColor('#FBF7EE')   # avorio caldo
INK     = colors.HexColor('#2B2620')   # quasi nero
MUTED   = colors.HexColor('#6B6355')
GOLD    = colors.HexColor('#B98A2F')
RULE    = colors.HexColor('#C9A227')
LINE    = colors.HexColor('#D8D0C0')
GREY    = colors.HexColor('#8A8274')

FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Georgia.ttf',
    '/System/Library/Fonts/Supplemental/Georgia Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    'C:/Windows/Fonts/georgia.ttf',
    'C:/Windows/Fonts/georgiab.ttf',
    'C:/Windows/Fonts/arial.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
]

# Font family attive (serif corpo / sans occhielli). Fallback su core fonts reportlab.
SERIF, SERIF_B, SANS, SANS_B = 'Times-Roman', 'Times-Bold', 'Helvetica', 'Helvetica-Bold'


def register_fonts():
    """Prova a registrare i TTF DejaVu/Georgia; altrimenti usa i core fonts."""
    global SERIF, SERIF_B, SANS, SANS_B
    def find(needle):
        for p in FONT_CANDIDATES:
            if p.endswith(needle) and os.path.exists(p):
                return p
        return None
    serif_p = find('DejaVuSerif.ttf') or find('Georgia.ttf')
    serifb_p = find('DejaVuSerif-Bold.ttf') or find('Georgia Bold.ttf') or find('georgiab.ttf')
    sans_p = find('DejaVuSans.ttf') or find('arial.ttf')
    sansb_p = find('DejaVuSans-Bold.ttf') or find('arialbd.ttf')
    try:
        if serif_p:
            pdfmetrics.registerFont(TTFont('ArtSerif', serif_p)); SERIF = 'ArtSerif'
        if serifb_p:
            pdfmetrics.registerFont(TTFont('ArtSerifB', serifb_p)); SERIF_B = 'ArtSerifB'
        if sans_p:
            pdfmetrics.registerFont(TTFont('ArtSans', sans_p)); SANS = 'ArtSans'
        if sansb_p:
            pdfmetrics.registerFont(TTFont('ArtSansB', sansb_p)); SANS_B = 'ArtSansB'
    except Exception:
        pass


# ---------- stili ----------
def styles():
    return {
        'eyebrow': ParagraphStyle('eyebrow', fontName=SANS_B, fontSize=9, leading=12,
                                  textColor=GOLD, alignment=TA_CENTER, spaceAfter=6),
        'coverTitle': ParagraphStyle('coverTitle', fontName=SERIF_B, fontSize=30, leading=37,
                                     textColor=INK, alignment=TA_CENTER, spaceBefore=6, spaceAfter=6),
        'coverSub': ParagraphStyle('coverSub', fontName=SERIF, fontSize=13, leading=18,
                                   textColor=MUTED, alignment=TA_CENTER, spaceAfter=4),
        'coverMeta': ParagraphStyle('coverMeta', fontName=SANS, fontSize=9.5, leading=13,
                                    textColor=MUTED, alignment=TA_CENTER),
        'chapterNum': ParagraphStyle('chapterNum', fontName=SANS_B, fontSize=9, leading=12,
                                     textColor=GOLD, alignment=TA_LEFT),
        'chapter': ParagraphStyle('chapter', fontName=SERIF_B, fontSize=19, leading=24,
                                  textColor=INK, alignment=TA_LEFT, spaceBefore=2, spaceAfter=4),
        'h2': ParagraphStyle('h2', fontName=SANS_B, fontSize=11, leading=15, textColor=INK,
                             alignment=TA_LEFT, spaceBefore=10, spaceAfter=4),
        'body': ParagraphStyle('body', fontName=SERIF, fontSize=10.6, leading=16.5,
                               textColor=INK, alignment=TA_JUSTIFY, spaceAfter=7),
        'lead': ParagraphStyle('lead', fontName=SERIF, fontSize=12, leading=19,
                               textColor=INK, alignment=TA_JUSTIFY, spaceAfter=8),
        'caption': ParagraphStyle('caption', fontName=SANS, fontSize=8.4, leading=11.5,
                                  textColor=MUTED, alignment=TA_CENTER, spaceBefore=4),
        'small': ParagraphStyle('small', fontName=SANS, fontSize=8.5, leading=12,
                                textColor=MUTED, alignment=TA_LEFT),
        'pointTitle': ParagraphStyle('pointTitle', fontName=SANS_B, fontSize=10.6, leading=14,
                                     textColor=INK, alignment=TA_LEFT, spaceBefore=6, spaceAfter=1),
        'kvLabel': ParagraphStyle('kvLabel', fontName=SANS_B, fontSize=9.5, leading=13,
                                  textColor=GOLD, alignment=TA_LEFT),
        'kvValue': ParagraphStyle('kvValue', fontName=SERIF, fontSize=10.2, leading=14.5,
                                  textColor=INK, alignment=TA_LEFT),
        'metaLine': ParagraphStyle('metaLine', fontName=SANS, fontSize=9, leading=13,
                                   textColor=MUTED, alignment=TA_CENTER),
    }


def esc(t):
    from xml.sax.saxutils import escape
    return escape(str(t or ''))


def roman(n):
    vals = [(1000, 'M'), (900, 'CM'), (500, 'D'), (400, 'CD'), (100, 'C'), (90, 'XC'),
            (50, 'L'), (40, 'XL'), (10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I')]
    out = ''
    for v, s in vals:
        while n >= v:
            out += s; n -= v
    return out


# ---------- immagini ----------
class ImgBag:
    """Decodifica + (eventuale) crop delle immagini base64 in file temporanei."""
    def __init__(self, images=None):
        self.images = images or {}
        self._dir = tempfile.mkdtemp(prefix='noesis-pdf-')
        self._n = 0
    def resolve(self, spec):
        if not spec:
            return None
        if 'ref' in spec and spec['ref'] in self.images:
            base = self.images[spec['ref']]
            spec = {**base, **{k: v for k, v in spec.items() if k != 'ref'}}
        return spec
    def path(self, spec, crop=None):
        spec = self.resolve(spec)
        if not spec or not spec.get('data'):
            return None
        if not crop and spec.get('crop'):
            crop = spec['crop']
        from PIL import Image
        try:
            img = Image.open(io.BytesIO(base64.b64decode(spec['data'])))
            if crop:
                W, H = img.size
                # Il crop su immagini minuscole può dare box vuoti (0 px):
                # lo si fissa ad almeno 1 px dentro i bordi.
                x0 = max(0, min(W - 1, int(crop.get('x', 0) * W)))
                y0 = max(0, min(H - 1, int(crop.get('y', 0) * H)))
                x1 = max(x0 + 1, min(W, int((crop.get('x', 0) + crop.get('width', 1)) * W)))
                y1 = max(y0 + 1, min(H, int((crop.get('y', 0) + crop.get('height', 1)) * H)))
                img = img.crop((x0, y0, x1, y1))
            img = img.convert('RGB')
            maxd = 1800
            if max(img.size) > maxd:
                img.thumbnail((maxd, maxd), Image.LANCZOS)
            self._n += 1
            p = os.path.join(self._dir, f'img{self._n}.jpg')
            img.save(p, 'JPEG', quality=88)
            return p
        except Exception as e:
            # BLOB corrotto, crop degenere o formato non riconosciuto: la tavola
            # viene omessa, il PDF resta valido con didascalia e testo.
            print(f'AVVISO_PDF: immagine non utilizzabile, tavola omessa ({e})', file=sys.stderr)
            return None
    def cleanup(self):
        import shutil
        shutil.rmtree(self._dir, ignore_errors=True)


def fit_wh(img_path, max_w, max_h):
    from PIL import Image
    with Image.open(img_path) as im:
        w, h = im.size
    ar = w / h
    width = max_w
    height = width / ar
    if height > max_h:
        height = max_h
        width = height * ar
    return width, height


def img_flow(img_path, max_w, max_h, hAlign='CENTER'):
    if not img_path:
        return None
    w, h = fit_wh(img_path, max_w, max_h)
    return Image(img_path, width=w, height=h, hAlign=hAlign)


# ---------- pagina (cover + corpo) ----------
class ArtDoc(BaseDocTemplate):
    def __init__(self, path, payload, **kw):
        self.payload = payload
        self.imgbag = kw.pop('imgbag', None)
        W, H = A4
        self.frame_w = W - 2 * 2.4 * cm
        self.frame_h = H - 2 * 2.2 * cm
        super().__init__(path, pagesize=A4, leftMargin=2.4*cm, rightMargin=2.4*cm,
                         topMargin=2.2*cm, bottomMargin=2.2*cm, **kw)
        cover = PageTemplate(id='cover', frames=[Frame(0, 0, W, H, id='c')], onPage=self._cover)
        front = PageTemplate(id='front', frames=[Frame(2.4*cm, 2.2*cm, self.frame_w, self.frame_h, id='f')],
                             onPage=self._front)
        body = PageTemplate(id='body', frames=[Frame(2.4*cm, 2.2*cm, self.frame_w, self.frame_h, id='b')],
                            onPage=self._body)
        self.addPageTemplates([cover, front, body])
        self._fig = 0

    def _paper(self, canvas):
        W, H = A4
        canvas.setFillColor(PAPER)
        canvas.rect(0, 0, W, H, fill=1, stroke=0)

    def _cover(self, canvas, doc):
        W, H = A4
        self._paper(canvas)
        inset = 1.4 * cm
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(1.4)
        canvas.rect(inset, inset, W - 2 * inset, H - 2 * inset)
        canvas.setLineWidth(0.5)
        canvas.rect(inset + 0.18 * cm, inset + 0.18 * cm, W - 2 * (inset + 0.18 * cm), H - 2 * (inset + 0.18 * cm))

        p = self.payload
        y = H - inset - 3.2 * cm
        canvas.setFillColor(GOLD)
        canvas.setFont(SANS_B, 10)
        canvas.drawCentredString(W / 2, y, esc(p.get('eyebrow', '')).upper())
        y -= 1.6 * cm

        # titolo (wrappato)
        title = esc(p.get('title', ''))
        canvas.setFillColor(INK)
        canvas.setFont(SERIF_B, 30)
        lines = self._wrap(title, W - 2 * inset - 3 * cm, SERIF_B, 30)
        for ln in lines:
            canvas.drawCentredString(W / 2, y, ln)
            y -= 0.9 * cm
        y -= 0.6 * cm

        if p.get('subtitle'):
            canvas.setFont(SERIF, 13)
            canvas.setFillColor(MUTED)
            for ln in self._wrap(esc(p['subtitle']), W - 2 * inset - 3 * cm, SERIF, 13):
                canvas.drawCentredString(W / 2, y, ln)
                y -= 0.6 * cm
            y -= 0.4 * cm

        meta = p.get('meta') or []
        # Riga livelli + verifica (solo payload lezione da export-model).
        lv = p.get('livelli') or {}
        if lv.get('verbosita') or lv.get('istruzione'):
            meta = list(meta) + [f"Livelli: {lv.get('verbosita', '')} / {lv.get('istruzione', '')}".strip(' /')]
        if p.get('verificate'):
            meta = list(meta) + [f"Verificato sul web ({p.get('dubbi', 0)} punti da ricontrollare)"]
        if meta:
            canvas.setFont(SANS, 9.5)
            canvas.setFillColor(MUTED)
            for m in meta:
                canvas.drawCentredString(W / 2, y, esc(m))
                y -= 0.5 * cm
            y -= 0.6 * cm

        # immagine hero
        hero = self.imgbag.path(p.get('coverImage')) if self.imgbag else None
        if hero:
            avail_w = W - 2 * inset - 2.4 * cm
            avail_h = max(4 * cm, y - (inset + 3.0 * cm))
            w, h = fit_wh(hero, avail_w, avail_h)
            canvas.drawImage(hero, (W - w) / 2, y - h, width=w, height=h, preserveAspectRatio=True, mask='auto')

        canvas.setFillColor(GREY)
        canvas.setFont(SANS, 8)
        canvas.drawCentredString(W / 2, inset + 0.9 * cm,
                                 'Scheda didattica · noesis-roads-creator')

    def _front(self, canvas, doc):
        # Copertina (1) e indice (2): solo carta, niente intestazione/piè.
        self._paper(canvas)

    def _body(self, canvas, doc):
        W, H = A4
        # copertina (1) e indice (2): niente intestazione/piè di pagina
        if canvas.getPageNumber() <= 2:
            return
        self._paper(canvas)
        # intestazione
        canvas.setFillColor(MUTED)
        canvas.setFont(SANS_B, 8.5)
        canvas.drawString(2.4 * cm, H - 1.35 * cm, esc(self.payload.get('title', '')).upper())
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.6)
        canvas.line(2.4 * cm, H - 1.55 * cm, W - 2.4 * cm, H - 1.55 * cm)
        # piè di pagina
        n = canvas.getPageNumber() - 1
        canvas.setFillColor(MUTED)
        canvas.setFont(SANS, 8.5)
        canvas.drawCentredString(W / 2, 1.25 * cm, f'— {n} —')

    def _wrap(self, text, width, font, size):
        from reportlab.lib.utils import simpleSplit
        return simpleSplit(text, font, size, width)

    def afterFlowable(self, flowable):
        # Indice: ogni titolo di capitolo (stile 'chapter') alimenta il TOC.
        if isinstance(flowable, Paragraph) and flowable.style.name == 'chapter':
            self.notify('TOCEntry', (0, flowable.getPlainText(), self.page))


# ---------- costruzione flowables ----------
def build_story(payload, doc):
    s = styles()
    # Pagina 1 = solo copertina (disegnata da onPage): si passa subito al
    # template 'body' e si va a pagina 2. Senza NextPageTemplate TUTTE le
    # pagine userebbero il template 'cover' (cornice + titolo gigante
    # ridisegnati sopra il testo di ogni capitolo).
    st = [NextPageTemplate('body'), PageBreak()]
    bag = doc.imgbag
    fig = {'n': 0}
    first = [True]

    def image_block(spec, caption, fullpage=False):
        fig['n'] += 1
        cap = f"Fig. {fig['n']} — {caption}" if caption else f"Fig. {fig['n']}"
        if fullpage:
            # Tavola quasi a pagina intera: condivide la pagina con il titolo del
            # capitolo appena aperto, poi pagina nuova. Niente PageBreak DENTRO il
            # KeepTogether: ognuno produrrebbe una pagina bianca spuria.
            path = bag.path(spec)
            im = img_flow(path, doc.frame_w, doc.frame_h - 3.5 * cm)
            inner = ([im] if im else []) + [Paragraph(esc(cap), s['caption'])]
            return [KeepTogether(inner), PageBreak()]
        path = bag.path(spec)
        im = img_flow(path, doc.frame_w, 16 * cm)
        inner = ([im] if im else []) + [Paragraph(esc(cap), s['caption'])]
        return [KeepTogether(inner)]

    def start_chapter(num, title):
        flow = []
        if not first[0]:
            flow.append(PageBreak())
        flow.append(Paragraph(f'CAPITOLO {roman(num)}', s['chapterNum']))
        flow.append(Paragraph(esc(title), s['chapter']))
        flow.append(HRFlowable(width='100%', thickness=0.8, color=RULE, spaceBefore=2, spaceAfter=8))
        return flow

    for block in payload.get('sections', []):
        t = block.get('t')
        if t == 'chapter':
            st.extend(start_chapter(block.get('n', 1), block.get('title', '')))
            first[0] = False
        elif t == 'h2':
            st.append(Paragraph(esc(block.get('text', '')).upper(), s['h2']))
        elif t == 'lead':
            st.append(Paragraph(esc(block.get('text', '')), s['lead']))
        elif t == 'p':
            st.append(Paragraph(esc(block.get('text', '')), s['body']))
        elif t == 'image':
            st.extend(image_block(block.get('image'), block.get('caption', ''), block.get('fullpage', False)))
        elif t == 'pair':
            st.append(pair_block(block, doc, bag, s))
        elif t == 'kv':
            st.append(kv_block(block, s))
        elif t == 'points':
            st.extend(points_block(block, s))
        elif t == 'gallery':
            st.append(gallery_block(block, doc, bag, s))
        elif t == 'meta':
            st.append(Paragraph(esc(block.get('text', '')), s['metaLine']))
        elif t == 'pagebreak':
            st.append(PageBreak())
    return st


def build_lezione_story(payload, doc):
    """Story dal modello intermedio di esportazione (type 'lezione').
    Copertina (onPage) -> indice TOC -> capitoli con badge verifica -> fonti."""
    s = styles()
    bag = doc.imgbag
    st = [NextPageTemplate('front')]
    st.append(Paragraph('INDICE', s['chapterNum']))
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle('toc0', fontName=SANS, fontSize=10.5, leading=16, textColor=INK,
                       leftIndent=0, firstLineIndent=0, spaceBefore=3),
    ]
    toc.dotsMinLevel = 0
    st.append(toc)
    st.append(PageBreak())
    st.append(NextPageTemplate('body'))
    n = 0
    for sec in payload.get('sections', []):
        n += 1
        st.append(PageBreak())
        st.append(Paragraph(f'CAPITOLO {roman(n)}', s['chapterNum']))
        st.append(Paragraph(esc(sec.get('title', '')), s['chapter']))
        v = sec.get('verifica') or {}
        if sec.get('verifica') is not None:
            badge = 'Verificato sul web' if not v.get('dubbi') else f"{v['dubbi']} punti da ricontrollare"
            st.append(Paragraph(esc(badge), s['metaLine']))
        st.append(HRFlowable(width='100%', thickness=0.8, color=RULE, spaceBefore=2, spaceAfter=8))
        for b in sec.get('blocks', []):
            t = b.get('t')
            if t == 'p':
                st.append(Paragraph(esc(b.get('text', '')), s['body']))
            elif t == 'h2':
                st.append(Paragraph(esc(b.get('text', '')).upper(), s['h2']))
            elif t == 'image':
                path = bag.path(b.get('image')) if bag else None
                im = img_flow(path, doc.frame_w, 14 * cm) if path else None
                cap = b.get('caption') or ''
                st.append(KeepTogether(([im] if im else []) + [Paragraph(esc(cap), s['caption'])]))
            elif t == 'pair':
                st.append(pair_block(b, doc, bag, s))
            elif t == 'kv':
                st.append(kv_block(b, s))
            elif t == 'points':
                st.extend(points_block(b, s))
            elif t == 'gallery':
                st.append(gallery_block(b, doc, bag, s))
    if payload.get('fonti'):
        st.append(PageBreak())
        st.append(Paragraph('CAPITOLO ' + roman(n + 1), s['chapterNum']))
        st.append(Paragraph('Fonti', s['chapter']))
        st.append(HRFlowable(width='100%', thickness=0.8, color=RULE, spaceBefore=2, spaceAfter=8))
        for f in payload['fonti']:
            url = (f.get('url') or '').replace('&', '&amp;').replace('<', '&lt;')
            title = esc(f.get('title') or f.get('url') or '')
            st.append(Paragraph(f'{title} — <a href="{url}" color="#DC7056">{url}</a>', s['body']))
    disc = payload.get('disclaimer')
    if disc:
        st.append(Spacer(1, 0.6 * cm))
        st.append(Paragraph(esc(disc), s['small']))
    return st


def pair_block(block, doc, bag, s):
    col_w = (doc.frame_w - 0.8 * cm) / 2
    img_w = col_w - 12  # meno il padding orizzontale delle celle (6+6 pt)
    cells = []
    for side in ('a', 'b'):
        d = block.get(side, {})
        inner = []
        path = bag.path(d.get('image')) if d.get('image') else None
        im = img_flow(path, img_w, 13 * cm) if path else None
        if im:
            inner.append(im)
        else:
            inner.append(Spacer(1, 2.2 * cm))
        if d.get('caption'):
            inner.append(Paragraph(esc(d['caption']), s['caption']))
        for m in d.get('meta', []):
            inner.append(Paragraph(esc(m), s['small']))
        cells.append(inner)
    tbl = Table([[cells[0], cells[1]]], colWidths=[col_w, col_w], hAlign='CENTER')
    tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    return tbl


def kv_block(block, s):
    rows = [[Paragraph(esc(k), s['kvLabel']), Paragraph(esc(v), s['kvValue'])]
            for k, v in block.get('items', [])]
    if not rows:
        return Spacer(1, 0.2 * cm)
    tbl = Table(rows, colWidths=[4.6 * cm, 10.6 * cm], hAlign='LEFT')
    tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, -2), 0.4, LINE),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    return tbl


def points_block(block, s):
    out = []
    for i, it in enumerate(block.get('items', []), start=1):
        title = f"{i} · {it.get('title', '')}"
        out.append(Paragraph(esc(title), s['pointTitle']))
        out.append(Paragraph(esc(it.get('text', '')), s['body']))
    return out


def gallery_block(block, doc, bag, s):
    col_w = (doc.frame_w - 0.6 * cm) / 2
    img_w = col_w - 12  # meno il padding orizzontale delle celle (6+6 pt)
    items = block.get('items', [])
    rows = []
    for i in range(0, len(items), 2):
        cells = []
        for j in range(2):
            d = items[i + j] if i + j < len(items) else None
            inner = []
            if d:
                path = bag.path(d.get('image')) if d.get('image') else None
                im = img_flow(path, img_w, 12 * cm) if path else None
                if im:
                    inner.append(im)
                else:
                    inner.append(Spacer(1, 2.4 * cm))
                if d.get('caption'):
                    inner.append(Paragraph(esc(d['caption']), s['caption']))
                if d.get('meta'):
                    inner.append(Paragraph(esc(d['meta']), s['small']))
            cells.append(inner)
        rows.append(cells)
    tbl = Table(rows, colWidths=[col_w, col_w], hAlign='CENTER')
    tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return tbl


def main():
    if len(sys.argv) < 3:
        print('ERRORE_PDF: uso: python3 make_pdf.py <input.json> <output.pdf>', file=sys.stderr)
        sys.exit(2)
    in_path, out_path = sys.argv[1], sys.argv[2]
    with open(in_path, encoding='utf-8') as f:
        payload = json.load(f)
    register_fonts()
    bag = ImgBag(payload.get('images'))
    try:
        doc = ArtDoc(out_path, payload, imgbag=bag)
        doc.title = payload.get('title', payload.get('titolo', 'Scheda didattica'))
        doc.author = 'noesis-roads-creator'
        if payload.get('type') == 'lezione':
            doc.multiBuild(build_lezione_story(payload, doc))
        else:
            doc.build(build_story(payload, doc))
        print('OK_PDF {}'.format(os.path.getsize(out_path)))
    finally:
        bag.cleanup()


if __name__ == '__main__':
    main()
