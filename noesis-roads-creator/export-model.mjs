// noesis-roads-creator — modello intermedio di esportazione lezioni.
// Un'unica sorgente da cui derivano TUTTI i formati (md/json/html/slides/epub/docx/pptx/pdf):
// titolo, sezioni tipizzate con chiavi, immagini, livelli, verifiche, fonti aggregate.
import { getImmagine } from './db.mjs';
import { isBodyEmpty } from '../core/sectionTypes.mjs';
import { imageRef } from './pdf-payloads.mjs';

const LVL = {
  essenziale: 'Essenziale', standard: 'Standard', approfondita: 'Approfondita',
  primaria: 'Primaria', secondaria: 'Secondaria', universita: 'Università',
};
const lvl = (v) => LVL[v] || v || '';

export function buildExportModel(full, io = {}) {
  const images = {};
  const ref = (key, data, mime) => imageRef(images, key, data, mime);
  const getImg = io.getImmagine || getImmagine;
  const schema = (full.modello && full.modello.schema) || {};
  const attive = Array.isArray(full.sezioniAttive) ? full.sezioniAttive : null;
  const defs = (Array.isArray(schema.sections) ? schema.sections : []).filter((d) => !attive || attive.includes(d.key));
  const corpi = new Map((full.sezioni || []).map((s) => [s.chiave, s.corpo || {}]));
  const verMap = new Map(((full.verifiche) || []).map((v) => [v.chiave, v]));
  const metas = (full.immagini || []);
  const byId = new Map();
  for (const m of metas) {
    const row = getImg(m.id);
    if (row && row.data) byId.set(m.id, ref('g' + m.id, row.data, row.mime));
  }
  const unused = new Set(byId.keys());
  const isSideRole = (r) => /-(a|b)$/.test(r || '') || /^lato-[ab]$/.test(r || '');
  const takeExact = (ruolo) => {
    const pick = metas.find((m) => byId.has(m.id) && unused.has(m.id) && String(m.ruolo || '') === String(ruolo));
    if (!pick) return null;
    unused.delete(pick.id);
    return byId.get(pick.id);
  };
  const takeImage = (preferRuolo) => {
    const avail = metas.filter((m) => byId.has(m.id) && unused.has(m.id));
    let pick = preferRuolo ? avail.find((m) => String(m.ruolo || '') === String(preferRuolo)) : null;
    if (!pick && preferRuolo) {
      pick = avail.find((m) => /^(hero|copertina|ritratto|thumb|tavola)/.test(m.ruolo || ''))
        || avail.find((m) => !isSideRole(m.ruolo)) || null;
    }
    if (!pick) return null;
    unused.delete(pick.id);
    return byId.get(pick.id);
  };

  let coverImage = null;
  const heroRole = schema.cover && schema.cover.heroRole;
  if (heroRole) coverImage = takeImage(heroRole);

  const sections = [];
  const fontiAll = [];
  const seenFonti = new Set();
  const pushFonti = (list) => {
    for (const f of (list || [])) {
      if (f && f.url && !seenFonti.has(f.url)) { seenFonti.add(f.url); fontiAll.push({ title: f.title || f.url, url: f.url }); }
    }
  };

  for (const def of defs) {
    const corpo = corpi.get(def.key) || {};
    if (def.type !== 'image' && isBodyEmpty(def.type, corpo)) continue;
    const ver = verMap.get(def.key) || null;
    if (ver) pushFonti(ver.fonti);
    const acc = new Set((ver && ver.accettati) || []);
    const dubbiVer = ver ? (ver.esiti || []).filter((e) => e.esito !== 'confermata' && !acc.has(e.affermazione)).length : 0;
    const sec = {
      key: def.key, title: def.title || def.key, type: def.type, required: !!def.required,
      verifica: ver ? { dubbi: dubbiVer, fonti: ver.fonti || [] } : null,
      blocks: [],
    };
    if (def.type === 'image') {
      const img = takeImage(def.key) || takeImage('');
      if (!img && !String(corpo.caption || '').trim()) continue;
      sec.blocks.push({ t: 'image', image: img, caption: String(corpo.caption || full.titolo || '') });
      sections.push(sec);
      continue;
    }
    if (def.type === 'text') {
      sec.blocks.push({ t: 'p', text: String(corpo.text || '') });
    } else if (def.type === 'epochs') {
      for (const c of (corpo.chapters || [])) sec.blocks.push({ t: 'h2', text: c.era || 'Epoca' }, { t: 'p', text: c.text || '' });
    } else if (def.type === 'works') {
      sec.blocks.push({ t: 'gallery', items: (corpo.works || []).map((w) => ({
        image: takeImage(w.title) || null,
        caption: (w.title || '') + (w.artist ? ' — ' + w.artist : '') + (w.date ? ', ' + w.date : ''),
        meta: [w.museum, w.caption].filter(Boolean).join(' · ')
      })) });
    } else if (def.type === 'points') {
      sec.blocks.push({ t: 'points', items: (corpo.items || []).map((p) => ({ title: p.title, text: p.text })) });
    } else if (def.type === 'kv') {
      sec.blocks.push({ t: 'kv', items: (corpo.entries || []).map((e) => [e.label || e.term || '', e.value || e.meaning || '']) });
    } else if (def.type === 'pair') {
      const a = corpo.a || {}, b = corpo.b || {};
      const sideImg = (letter) => takeExact(def.key + '-' + letter) || takeExact('lato-' + letter);
      sec.blocks.push({ t: 'pair',
        a: { image: sideImg('a'), caption: a.title || 'A', meta: a.text ? [a.text] : [] },
        b: { image: sideImg('b'), caption: b.title || 'B', meta: b.text ? [b.text] : [] }
      });
    }
    sections.push(sec);
  }

  if (!coverImage && byId.size) {
    const pool = metas.filter((m) => byId.has(m.id) && unused.has(m.id));
    const pick = pool.find((m) => /^(hero|copertina|ritratto|thumb|tavola)/.test(m.ruolo || ''))
      || pool.find((m) => !isSideRole(m.ruolo));
    if (pick) { unused.delete(pick.id); coverImage = byId.get(pick.id); }
  }

  const dubbi = sections.reduce((n, s) => n + ((s.verifica && s.verifica.dubbi) || 0), 0);
  return {
    type: 'lezione',
    titolo: full.titolo || 'Lezione senza titolo',
    eyebrow: (schema.cover && schema.cover.eyebrow) || 'Lezione',
    // Il subject vive già in eyebrow ("Scheda didattica · filosofia") e in
    // materiaId: il subtitle riporta solo il nome modello, senza duplicarlo.
    subtitle: schema.name || schema.subject || '',
    materiaId: schema.subject || '',
    modello: { id: (full.modello && full.modello.id) || '', chiave: (full.modello && full.modello.chiave) || '', nome: (full.modello && (full.modello.schema.name || full.modello.nome)) || '' },
    livelli: { verbosita: lvl(full.verbosita), istruzione: lvl(full.istruzione) },
    verificate: sections.filter((s) => s.verifica).length,
    dubbi,
    coverImage,
    images,
    sections,
    fonti: fontiAll,
    disclaimer: 'Lezione generata con intelligenza artificiale (può contenere errori): verifica su fonti indipendenti prima dell’uso didattico.',
  };
}
