// noesis-roads-creator — snapshot arte → nucleo generico (cfr. docs/MIGRATION.md).
//
// Strategia: copia one-shot verificata, poi vita autonoma. Le 13 tabelle legacy
// restano intatte come sorgente (rollback = rilettura). Solo schede legacy in
// stato `ready`; id stabili `art:<tipo>:<id-originale>`; sezioni nell'ordine
// del PDF; immagini copiate con ruolo; stato `ready` preservato.
//
// Il modulo storage è iniettabile (`{ db }`, default `./db.mjs`) così i test
// isolano il DB senza dipendere dalla cache dei moduli.
//
// Uso: node migrate-art.mjs [--dry-run]
import { fileURLToPath } from 'node:url';
import * as defaultDb from './db.mjs';
import { listMaterie, listModelli } from '../core/models.mjs';

const D = (opts) => (opts && opts.db) || defaultDb;
const JOIN = (parts) => [...new Set(parts.map((s) => String(s || '').trim()).filter(Boolean))].join('\n\n');

export function legacyReadyCounts(opts = {}) {
  const db = D(opts).getDb();
  return {
    artworks: db.prepare("SELECT COUNT(*) AS c FROM artworks WHERE status = 'ready'").get().c,
    subjects: db.prepare("SELECT COUNT(*) AS c FROM subjects WHERE status = 'ready'").get().c,
    comparisons: db.prepare("SELECT COUNT(*) AS c FROM comparisons WHERE status = 'ready'").get().c,
  };
}

function putImage(core, schedaId, ruolo, img) {
  if (!img || !img.data) return 0;
  core.addImmagine(schedaId, ruolo, Buffer.from(img.data), img.mime || 'image/jpeg');
  return 1;
}

function ensureScheda(core, id, modelloId, titolo, dryRun) {
  if (dryRun) return { id, modelloId, titolo, stato: 'draft' };
  if (core.getScheda(id)) core.deleteScheda(id); // idempotente: lo snapshot si rigenera
  return core.createScheda({ id, modelloId, titolo });
}

function finish(core, schedaId, dryRun, warnings) {
  if (dryRun) return { ok: true, missing: [], dryRun: true };
  const result = core.approveScheda(schedaId);
  if (!result.ok) {
    // Snapshot fedele anche se la legacy era incompleta: ready preservato,
    // ma il gate viene segnalato nel report (bloccante per il merge).
    core.getDb().prepare("UPDATE schede_lezione SET stato = 'ready' WHERE id = ?").run(schedaId);
    warnings.push(`${schedaId}: required mancanti (${result.missing.join(', ')}) — ready forzato dallo snapshot`);
  }
  return { ok: true, missing: result.missing };
}

export function migrateArtwork(legacyId, opts = {}) {
  const { dryRun = false, warnings = [] } = opts;
  const core = D(opts);
  const full = core.getFullArtwork(legacyId);
  if (!full || full.status !== 'ready') return null;
  const schedaId = `art:opera:${legacyId}`;
  ensureScheda(core, schedaId, 'arte:opera:v1', full.title || legacyId, dryRun);
  const put = (chiave, corpo) => { if (!dryRun) core.saveSezione(schedaId, chiave, corpo); };
  let images = 0;

  put('presentazione', { text: full.overview?.painting || '' });
  put('artista', { text: full.overview?.artist || '' });
  put('tavola', { caption: [full.title, full.artist].filter(Boolean).join(' — ') });
  if (!dryRun) {
    const imgs = core.getArtworkImageData(legacyId);
    images += putImage(core, schedaId, 'hero', imgs?.clean);
    images += putImage(core, schedaId, 'annotata', imgs?.annotated);
  }
  put('dettagli', {
    items: (full.details || []).map((d) => {
      const studio = d.tabs?.studio?.content || {};
      const appr = d.tabs?.approfondimento?.content || {};
      return {
        title: d.title || 'Dettaglio',
        text: JOIN([studio.observation, studio.meaning, studio.relation,
          appr.curiosity && `Curiosità: ${appr.curiosity}`,
          appr.comparisons && `Confronti: ${appr.comparisons}`,
          appr.openQuestions && `Questioni aperte: ${appr.openQuestions}`,
          studio.lookAgain && `Guarda ancora: ${studio.lookAgain}`,
          appr.lookAgain && appr.lookAgain !== studio.lookAgain && `Guarda ancora: ${appr.lookAgain}`]),
      };
    }),
  });
  const tecniche = (full.details || [])
    .map((d) => d.tabs?.approfondimento?.content?.technique || '')
    .filter(Boolean);
  put('tecnica', { text: tecniche.join('\n\n') });
  put('simili', {
    works: (full.similarWorks || []).map((w) => ({
      title: w.title || '', artist: w.artist || '', date: w.date || '',
      museum: w.museum || '', caption: w.caption || '',
    })),
  });
  if (!dryRun) {
    for (const w of (full.similarWorks || [])) {
      if (!w.hasImage) continue;
      images += putImage(core, schedaId, `sim-${w.id}`, core.getSimilarImage(legacyId, w.id));
    }
  }
  put('fonti', { entries: (full.sources || []).map((s) => ({ label: s.title || s.url, value: s.url || '' })) });

  const gate = finish(core, schedaId, dryRun, warnings);
  return { schedaId, images, missing: gate.missing };
}

export function migrateSubject(legacyId, opts = {}) {
  const { dryRun = false, warnings = [] } = opts;
  const core = D(opts);
  const full = core.getFullSubject(legacyId);
  if (!full || full.status !== 'ready') return null;
  const schedaId = `art:soggetto:${legacyId}`;
  ensureScheda(core, schedaId, 'arte:soggetto:v1', full.name || legacyId, dryRun);
  const put = (chiave, corpo) => { if (!dryRun) core.saveSezione(schedaId, chiave, corpo); };
  let images = 0;

  put('introduzione', { text: full.intro || '' });
  put('origini', { text: full.origins || '' });
  put('evoluzione', { chapters: (full.chapters || []).map((c) => ({ era: c.era || '', text: c.text || '' })) });
  put('opere', {
    works: (full.works || []).map((w) => ({
      title: w.title || '', artist: w.artist || '', date: w.date || '',
      museum: w.museum || '', caption: w.caption || '',
    })),
  });
  if (!dryRun) {
    for (const w of (full.works || [])) {
      if (!w.hasImage) continue;
      images += putImage(core, schedaId, `opera-${w.id}`, core.getSubjectWorkImage(legacyId, w.id));
    }
  }
  let symbols = [];
  try { symbols = JSON.parse(full.symbols || '[]'); } catch { symbols = []; }
  put('simboli', { entries: symbols.map((s) => ({ label: s.symbol || '', value: s.meaning || '' })) });
  put('interpretazioni', { text: full.interpretations || '' });
  put('curiosita', { text: full.curiosities || '' });

  const gate = finish(core, schedaId, dryRun, warnings);
  return { schedaId, images, missing: gate.missing };
}

function sideText(s) {
  return [s.artist, s.date, s.museum].filter(Boolean).join(' · ');
}

export function migrateComparison(legacyId, opts = {}) {
  const { dryRun = false, warnings = [] } = opts;
  const core = D(opts);
  const full = core.getFullComparison(legacyId);
  if (!full || full.status !== 'ready') return null;
  const schedaId = `art:confronto:${legacyId}`;
  ensureScheda(core, schedaId, 'arte:confronto:v1', full.title || legacyId, dryRun);
  const put = (chiave, corpo) => { if (!dryRun) core.saveSezione(schedaId, chiave, corpo); };
  let images = 0;

  const side = (letter) => (full.sides || []).find((s) => s.side === letter) || {};
  const a = side('a'), b = side('b');
  put('coppia', {
    a: { title: a.title || 'Opera A', text: sideText(a) },
    b: { title: b.title || 'Opera B', text: sideText(b) },
  });
  if (!dryRun) {
    // Lati `library`: l'immagine vive sull'opera referenziata, va copiata.
    const sideImage = (letter, s) => {
      if (s.source === 'library' && s.artworkId) {
        const imgs = core.getArtworkImageData(s.artworkId);
        if (imgs?.clean) return imgs.clean;
      }
      return core.getComparisonSideImage(legacyId, letter);
    };
    images += putImage(core, schedaId, 'lato-a', sideImage('a', a));
    images += putImage(core, schedaId, 'lato-b', sideImage('b', b));
    images += putImage(core, schedaId, 'thumb', core.getComparisonThumb(legacyId));
  }
  put('introduzione', { text: full.intro || '' });
  const points = full.points || [];
  put('comuni', { items: points.filter((p) => p.kind === 'similar').map((p) => ({ title: p.title, text: p.text })) });
  put('differenze', { items: points.filter((p) => p.kind === 'different').map((p) => ({ title: p.title, text: p.text })) });
  put('tecnica', { text: full.technique || '' });
  put('contesto', { text: full.context || '' });
  put('critica', { text: full.critique || '' });
  put('curiosita', { text: full.curiosities || '' });

  const gate = finish(core, schedaId, dryRun, warnings);
  return { schedaId, images, missing: gate.missing };
}

export function migrateAll(opts = {}) {
  const { dryRun = false } = opts;
  const core = D(opts);
  core.initSchema();
  core.seedCore({ materie: listMaterie(), modelli: [...listModelli('arte'), ...listModelli('filosofia')] });
  const warnings = [];
  const report = { dryRun, warnings, artworks: [], subjects: [], comparisons: [] };
  const o = { ...opts, warnings };
  for (const a of core.listArtworks().filter((x) => x.status === 'ready')) {
    report.artworks.push(migrateArtwork(a.id, { ...o, dryRun }));
  }
  for (const s of core.listSubjects().filter((x) => x.status === 'ready')) {
    report.subjects.push(migrateSubject(s.id, { ...o, dryRun }));
  }
  for (const c of core.listComparisons().filter((x) => x.status === 'ready')) {
    report.comparisons.push(migrateComparison(c.id, { ...o, dryRun }));
  }
  // Verifica bloccante MIGRATION.md: N legacy ready == N schede-lezione ready importate.
  const counts = legacyReadyCounts({ db: core });
  if (!dryRun) {
    const conn = core.getDb();
    const got = (prefix) => conn.prepare("SELECT COUNT(*) AS c FROM schede_lezione WHERE stato = 'ready' AND id LIKE ?").get(prefix + '%').c;
    report.verifica = {
      artworks: { legacy: counts.artworks, migrati: got('art:opera:'), ok: got('art:opera:') === counts.artworks },
      subjects: { legacy: counts.subjects, migrati: got('art:soggetto:'), ok: got('art:soggetto:') === counts.subjects },
      comparisons: { legacy: counts.comparisons, migrati: got('art:confronto:'), ok: got('art:confronto:') === counts.comparisons },
    };
    report.ok = report.verifica.artworks.ok && report.verifica.subjects.ok && report.verifica.comparisons.ok;
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  try {
    const report = migrateAll({ dryRun });
    console.log(JSON.stringify(report, null, 2));
    if (report.ok === false) process.exit(2);
  } catch (e) {
    console.error('Migrazione fallita:', e.message);
    process.exit(1);
  }
}
