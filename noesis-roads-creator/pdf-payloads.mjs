// noesis-roads-creator — builder dei payload PDF "libro d'arte" (puri, con `io` iniettabile).
// Usati dal creator (scrittura) e dal viewer (sola lettura, con accessor RO):
// `make_pdf.py` resta invariato, guidato dai blocchi tipizzati.
// Questo modulo NON tocca il DB all'import (nessun initSchema/seed): l'IO passa
// dai default qui sotto oppure dagli adapter iniettati dai chiamanti.
import {
  getArtworkImageData, getSimilarImage, getSubjectWorkImage,
  getComparisonSideImage, getComparisonThumb, getImmagine,
} from './db.mjs';
import { isBodyEmpty } from '../core/sectionTypes.mjs';

// ---------- Esportazione PDF "libro d'arte" (payload → make_pdf.py) ----------
export function imageRef(images, key, buf, mime) {
  if (buf == null) return null;
  // Il DB (node:sqlite) restituisce i BLOB come Uint8Array, non Buffer;
  // i test/mock possono passare Buffer oppure una stringa base64 già pronta.
  let data;
  if (Buffer.isBuffer(buf)) data = buf;
  else if (buf instanceof Uint8Array) data = Buffer.from(buf);
  else if (typeof buf === 'string') data = Buffer.from(buf, 'base64');
  else data = Buffer.from(buf);
  if (!data.length) return null;
  images[key] = { data: data.toString('base64'), mime: mime || 'image/jpeg' };
  return { ref: key };
}

export function buildArtworkPdfPayload(full, io = {}) {
  const images = {};
  const ref = (key, data, mime) => imageRef(images, key, data, mime);
  const imgs = io.imageData ? io.imageData(full.id) : getArtworkImageData(full.id);
  const clean = imgs && imgs.clean;
  const annotated = imgs && imgs.annotated;
  const coverImage = clean ? ref('clean', clean.data, clean.mime) : null;
  const annotatedRef = annotated ? ref('annotated', annotated.data, annotated.mime) : null;
  const getSim = io.similarImage || getSimilarImage;
  const sections = [];
  let n = 0;
  const chapter = (title) => { n += 1; sections.push({ t: 'chapter', n, title }); };

  chapter('Presentazione');
  if (full.overview?.painting) sections.push({ t: 'h2', text: 'Il dipinto' }, { t: 'p', text: full.overview.painting });
  if (full.overview?.artist) sections.push({ t: 'h2', text: 'L’artista' }, { t: 'p', text: full.overview.artist });

  if (annotatedRef || coverImage) {
    chapter('L’opera');
    sections.push({ t: 'image', image: annotatedRef || coverImage, caption: full.title + ' — ' + (full.artist || 'artista ignoto'), fullpage: true });
  }

  for (const d of (full.details || [])) {
    chapter(d.title);
    const studio = d.tabs?.studio?.content || {};
    const appr = d.tabs?.approfondimento?.content || {};
    if (coverImage && d.region) {
      sections.push({ t: 'image', image: { ref: 'clean', crop: d.region }, caption: d.title + (d.category ? ' (' + d.category + ')' : '') });
    }
    if (studio.observation) sections.push({ t: 'h2', text: 'Cosa vedi' }, { t: 'p', text: studio.observation });
    if (studio.meaning) sections.push({ t: 'h2', text: 'Cosa significa' }, { t: 'p', text: studio.meaning });
    if (studio.relation) sections.push({ t: 'h2', text: 'In relazione all’opera' }, { t: 'p', text: studio.relation });
    if (studio.lookAgain) sections.push({ t: 'kv', items: [['Guarda ancora', studio.lookAgain]] });
    if (appr.curiosity) sections.push({ t: 'h2', text: 'Una curiosità' }, { t: 'p', text: appr.curiosity });
    if (appr.comparisons) sections.push({ t: 'h2', text: 'Confronti' }, { t: 'p', text: appr.comparisons });
    if (appr.openQuestions) sections.push({ t: 'h2', text: 'Questioni aperte' }, { t: 'p', text: appr.openQuestions });
    if (appr.technique) sections.push({ t: 'h2', text: 'Tecnica e materia' }, { t: 'p', text: appr.technique });
    if (appr.lookAgain) sections.push({ t: 'kv', items: [['Guarda ancora', appr.lookAgain]] });
  }

  const similar = (full.similarWorks || []).filter(w => w.title);
  if (similar.length) {
    chapter('Opere simili');
    sections.push({ t: 'gallery', items: similar.map(w => {
      const img = w.hasImage ? getSim(full.id, w.id) : null;
      return {
        image: img ? ref('sim' + w.id, img.data, img.mime) : null,
        caption: (w.title || '') + (w.artist ? ' — ' + w.artist : '') + (w.date ? ', ' + w.date : ''),
        meta: [w.museum, w.caption].filter(Boolean).join(' · ')
      };
    }) });
  }

  const sources = (full.sources || []).filter(s => s.title || s.url);
  if (sources.length) {
    chapter('Fonti');
    sections.push({ t: 'kv', items: sources.map(s => [s.title || s.url, s.url]) });
  }

  return {
    type: 'opera',
    eyebrow: 'Scheda didattica · opera',
    title: full.title || 'Opera senza titolo',
    subtitle: full.artist || '',
    meta: [full.date, full.period, full.technique, full.institution, full.location].filter(Boolean),
    coverImage,
    images,
    sections
  };
}

export function buildSubjectPdfPayload(full, io = {}) {
  const images = {};
  const sections = [];
  let n = 0;
  const chapter = (title) => { n += 1; sections.push({ t: 'chapter', n, title }); };
  const getWorkImage = io.subjectWorkImage || getSubjectWorkImage;

  if (full.intro) chapter('Introduzione'), sections.push({ t: 'p', text: full.intro });
  if (full.origins) chapter('Origini e fonti iconografiche'), sections.push({ t: 'p', text: full.origins });
  if ((full.chapters || []).length) {
    chapter('L’evoluzione per epoche');
    for (const c of full.chapters) {
      sections.push({ t: 'h2', text: c.era || 'Epoca' }, { t: 'p', text: c.text || '' });
    }
  }
  const works = (full.works || []).filter(w => w.title);
  if (works.length) {
    chapter('Opere rappresentative');
    sections.push({ t: 'gallery', items: works.map(w => {
      const img = w.hasImage ? getWorkImage(full.id, w.id) : null;
      return {
        image: img ? imageRef(images, 'sw' + w.id, img.data, img.mime) : null,
        caption: (w.title || '') + (w.artist ? ' — ' + w.artist : '') + (w.date ? ', ' + w.date : ''),
        meta: [w.museum, w.caption].filter(Boolean).join(' · ')
      };
    }) });
  }
  let symbols = [];
  try { symbols = JSON.parse(full.symbols || '[]'); } catch { symbols = []; }
  if (symbols.length) {
    chapter('Attributi e simboli ricorrenti');
    sections.push({ t: 'kv', items: symbols.map(s => [s.symbol || '', s.meaning || '']) });
  }
  if (full.interpretations) chapter('Interpretazioni e varianti'), sections.push({ t: 'p', text: full.interpretations });
  if (full.curiosities) chapter('Curiosità e questioni aperte'), sections.push({ t: 'p', text: full.curiosities });

  return {
    type: 'soggetto',
    eyebrow: 'Scheda didattica · soggetto nella storia dell’arte',
    title: full.name || 'Soggetto',
    subtitle: '',
    meta: [],
    coverImage: works.length && works[0].hasImage ? { ref: 'sw' + works[0].id } : null,
    images,
    sections
  };
}

export function buildComparisonPdfPayload(full, io = {}) {
  const images = {};
  const sections = [];
  let n = 0;
  const chapter = (title) => { n += 1; sections.push({ t: 'chapter', n, title }); };
  const getArtworkImgs = io.artworkImageData || getArtworkImageData;
  const getSideImage = io.comparisonSideImage || getComparisonSideImage;
  const getThumb = io.comparisonThumb || getComparisonThumb;
  const sideMeta = (s) => [s.artist, s.date, s.museum].filter(Boolean).join(' · ');
  const sideOf = (letter) => (full.sides || []).find(s => s.side === letter) || {};
  const a = sideOf('a'), b = sideOf('b');

  const sideImage = (letter, s) => {
    if (s.source === 'library' && s.artworkId) {
      const imgs = getArtworkImgs(s.artworkId);
      if (imgs && imgs.clean) return imageRef(images, 'side' + letter, imgs.clean.data, imgs.clean.mime);
    }
    const img = getSideImage(full.id, letter);
    if (img) return imageRef(images, 'side' + letter, img.data, img.mime);
    return null;
  };
  const imgA = sideImage('a', a), imgB = sideImage('b', b);

  const thumbRow = getThumb(full.id);
  const coverImage = thumbRow ? imageRef(images, 'thumb', thumbRow.data, thumbRow.mime) : (imgA || imgB);

  chapter('Le due opere');
  sections.push({ t: 'pair',
    a: { image: imgA, caption: a.title || 'Opera A', meta: [sideMeta(a)].filter(Boolean) },
    b: { image: imgB, caption: b.title || 'Opera B', meta: [sideMeta(b)].filter(Boolean) }
  });

  if (full.intro) chapter('Introduzione al confronto'), sections.push({ t: 'p', text: full.intro });
  const points = full.points || [];
  const similar = points.filter(p => p.kind === 'similar');
  const different = points.filter(p => p.kind === 'different');
  if (similar.length) chapter('Punti in comune'), sections.push({ t: 'points', items: similar.map(p => ({ title: p.title, text: p.text })) });
  if (different.length) chapter('Differenze'), sections.push({ t: 'points', items: different.map(p => ({ title: p.title, text: p.text })) });
  if (full.technique) chapter('Tecnica a confronto'), sections.push({ t: 'p', text: full.technique });
  if (full.context) chapter('Contesto storico-artistico'), sections.push({ t: 'p', text: full.context });
  if (full.critique) chapter('Interpretazione critica'), sections.push({ t: 'p', text: full.critique });
  if (full.curiosities) chapter('Curiosità'), sections.push({ t: 'p', text: full.curiosities });

  const typeLabel = full.comparisonType === 'same-artist' ? 'stesso artista, fasi diverse' : 'stesso soggetto, artisti diversi';
  return {
    type: 'confronto',
    eyebrow: 'Scheda didattica · faccia a faccia',
    title: full.title || 'Confronto',
    subtitle: typeLabel,
    meta: [a.title, b.title].filter(Boolean).map((t, i) => (i === 0 ? 'A · ' : 'B · ') + t),
    coverImage,
    images,
    sections
  };
}

// ---------- Nucleo generico: normalizzatore per tipo-sezione ----------
// Mappa il JSON grezzo del modello sul corpo tipizzato della sezione
// (stesse forme di core/sectionTypes.mjs). Puro, senza IO.
export function normalizeSectionBody(type, raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const str = (v) => String(v ?? '').trim();
  const arr = (v) => (Array.isArray(v) ? v : []);
  if (type === 'text') return { text: str(r.text ?? r.content ?? r.body) };
  if (type === 'epochs') {
    return { chapters: arr(r.chapters).map((c) => ({ era: str(c.era).slice(0, 120), text: str(c.text) })).filter((c) => c.era || c.text) };
  }
  if (type === 'works') {
    const list = Array.isArray(raw) ? raw : arr(r.works);
    return { works: list.slice(0, 10).map((w, i) => ({
      title: str(w.title || ('Opera ' + (i + 1))).slice(0, 120),
      artist: str(w.artist).slice(0, 120), date: str(w.date).slice(0, 60),
      museum: str(w.museum).slice(0, 120), caption: str(w.caption).slice(0, 300)
    })) };
  }
  if (type === 'points') {
    const list = arr(r.items).length ? arr(r.items) : [...arr(r.similar), ...arr(r.different)];
    return { items: list.map((p) => ({ title: str(p.title).slice(0, 120), text: str(p.text) })).filter((p) => p.title || p.text) };
  }
  if (type === 'kv') {
    const list = arr(r.entries).length ? arr(r.entries) : arr(r.symbols);
    return { entries: list.map((e) => ({
      label: str(e.label ?? e.term ?? e.symbol ?? e.title).slice(0, 120),
      value: str(e.value ?? e.meaning ?? e.text ?? e.url)
    })).filter((e) => e.label || e.value) };
  }
  if (type === 'pair') {
    const side = (s) => ({ title: str(s?.title).slice(0, 120), text: str(s?.text) });
    return { a: side(r.a), b: side(r.b) };
  }
  return {};
}

// ---------- Nucleo generico: builder PDF (make_pdf.py resta invariato) ----------
// Un solo builder payload→sezioni tipizzate: ogni tipo-sezione diventa blocchi
// già noti a make_pdf.py (chapter/h2/p/image/gallery/points/kv/pair).
export function buildGenericPdfPayload(full, io = {}) {
  const images = {};
  const ref = (key, data, mime) => imageRef(images, key, data, mime);
  const getImg = io.getImmagine || getImmagine;
  const schema = (full.modello && full.modello.schema) || {};
  const sections = (Array.isArray(schema.sections) ? schema.sections : []);
  const corpi = new Map((full.sezioni || []).map((s) => [s.chiave, s.corpo || {}]));
  const metas = (full.immagini || []);
  const byId = new Map();
  for (const m of metas) {
    const row = getImg(m.id);
    if (row && row.data) byId.set(m.id, ref('g' + m.id, row.data, row.mime));
  }
  const unused = new Set(byId.keys());
  const takeImage = (preferRuolo) => {
    const hit = metas.find((m) => byId.has(m.id) && unused.has(m.id) && String(m.ruolo || '') === String(preferRuolo || ''));
    const pick = hit || metas.find((m) => byId.has(m.id) && unused.has(m.id));
    if (!pick) return null;
    unused.delete(pick.id);
    return byId.get(pick.id);
  };

  let coverImage = null;
  const heroRole = schema.cover && schema.cover.heroRole;
  if (heroRole) coverImage = takeImage(heroRole);

  const out = [];
  let n = 0;
  const chapter = (title) => { n += 1; out.push({ t: 'chapter', n, title }); };
  const empty = (type, corpo) => isBodyEmpty(type, corpo);

  for (const def of sections) {
    const corpo = corpi.get(def.key) || {};
    if (def.type !== 'image' && empty(def.type, corpo)) continue;
    if (def.type === 'image') {
      const img = takeImage(def.key) || takeImage('') ;
      if (!img && !String(corpo.caption || '').trim()) continue;
      chapter(def.title);
      out.push({ t: 'image', image: img, caption: String(corpo.caption || full.titolo || ''), fullpage: Boolean(def.fullpage) });
      continue;
    }
    chapter(def.title);
    if (def.type === 'text') {
      out.push({ t: 'p', text: String(corpo.text || '') });
    } else if (def.type === 'epochs') {
      for (const c of (corpo.chapters || [])) {
        out.push({ t: 'h2', text: c.era || 'Epoca' }, { t: 'p', text: c.text || '' });
      }
    } else if (def.type === 'works') {
      out.push({ t: 'gallery', items: (corpo.works || []).map((w) => ({
        image: takeImage(w.title) || null,
        caption: (w.title || '') + (w.artist ? ' — ' + w.artist : '') + (w.date ? ', ' + w.date : ''),
        meta: [w.museum, w.caption].filter(Boolean).join(' · ')
      })) });
    } else if (def.type === 'points') {
      out.push({ t: 'points', items: (corpo.items || []).map((p) => ({ title: p.title, text: p.text })) });
    } else if (def.type === 'kv') {
      out.push({ t: 'kv', items: (corpo.entries || []).map((e) => [e.label || e.term || '', e.value || e.meaning || '']) });
    } else if (def.type === 'pair') {
      const a = corpo.a || {}, b = corpo.b || {};
      out.push({ t: 'pair',
        a: { image: null, caption: a.title || 'A', meta: a.text ? [a.text] : [] },
        b: { image: null, caption: b.title || 'B', meta: b.text ? [b.text] : [] }
      });
    }
  }

  if (!coverImage && byId.size) coverImage = byId.values().next().value;
  return {
    type: 'scheda',
    eyebrow: (schema.cover && schema.cover.eyebrow) || 'Scheda didattica',
    title: full.titolo || 'Scheda senza titolo',
    subtitle: [schema.subject, schema.name].filter(Boolean).join(' · '),
    meta: [],
    coverImage,
    images,
    sections: out
  };
}

