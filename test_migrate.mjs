import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildArtworkPdfPayload, buildSubjectPdfPayload, buildComparisonPdfPayload, buildGenericPdfPayload } from './noesis-roads-creator/server.mjs';

const execFileAsync = promisify(execFile);
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function runMakePdf(payload) {
  return mkdtemp(join(tmpdir(), 'noesis-pdf-')).then(async (dir) => {
    const inPath = join(dir, 'in.json');
    const outPath = join(dir, 'out.pdf');
    await writeFile(inPath, JSON.stringify(payload));
    try {
      await execFileAsync('python3', ['make_pdf.py', inPath, outPath], { cwd: 'noesis-roads-creator', timeout: 120000 });
      return await readFile(outPath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
function countPdfPages(buf) {
  return (String(buf).match(/\/Type\s*\/Page[^s]/g) || []).length;
}
// Contenuti di un payload legacy: paragrafi, didascalie, voci (non le intestazioni
// strutturali chapter/h2, che il modello generico rinomina legittimamente).
function legacyContents(sections, out = []) {
  for (const b of sections || []) {
    if (!b || typeof b !== 'object') continue;
    if (b.t === 'chapter') continue; // titolo capitolo: struttura, non contenuto
    if (b.t === 'h2') continue; // sotto-intestazione: struttura, non contenuto
    stringsOf(b, out);
  }
  return out;
}
const SKIP_KEYS = new Set(['ref', 'mime', 'data', 't', 'caption']);
function stringsOf(node, out = []) {
  if (typeof node === 'string') { if (node.trim()) out.push(node); }
  else if (Array.isArray(node)) node.forEach((v) => stringsOf(v, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (SKIP_KEYS.has(k)) continue;
      stringsOf(v, out);
    }
  }
  return out;
}

async function seedLegacyFixtures(db) {
  const png = Buffer.from(PIXEL, 'base64');
  db.createArtwork({ id: 'w1', title: 'Annunciazione', artist: 'Beato Angelico', date: 'c. 1440',
    imagePath: 'uploads/x.jpg', imageData: png, imageMime: 'image/png', imageWidth: 1, imageHeight: 1 });
  db.saveOverview('w1', { painting: 'Il dipinto luminoso.', artist: 'Il frate pittore.' }, { status: 'approved' });
  const det = db.addDetail('w1', { title: 'L’angelo', category: 'Figura', x: 0.1, y: 0.1, width: 0.3, height: 0.4, sortOrder: 0 });
  db.saveDetailContent(det.id, 'studio',
    { observation: 'Vedo un angelo.', meaning: 'È Gabriele.', relation: 'Annuncia a Maria.', lookAgain: 'Guarda le ali.' },
    { status: 'approved' });
  db.saveDetailContent(det.id, 'approfondimento',
    { curiosity: 'Una curiosità vera.', comparisons: 'Un confronto vero.', openQuestions: 'Una domanda vera.', technique: 'Tempera su muro.', lookAgain: 'Guarda le ali.' },
    { status: 'approved' });
  db.setAnnotatedImage('w1', png, 'image/png');
  db.replaceSimilarWorks('w1', [{ title: 'Annunciazione Martini', artist: 'Simone Martini', date: '1333',
    museum: 'Uffizi', caption: 'Gotico senese.', imageData: png, imageMime: 'image/png', imageStatus: 'ok' }]);
  db.addSource({ artworkId: 'w1', title: 'Museo', url: 'https://example.org', type: 'Museo' });
  db.approveArtwork('w1');

  db.createSubject({ id: 'annunciazione', name: 'Annunciazione' });
  db.updateSubject('annunciazione', { intro: 'Il racconto evangelico.', origins: 'Dal Vangelo di Luca.',
    symbols: JSON.stringify([{ symbol: 'Giglio', meaning: 'Purezza' }]),
    interpretations: 'Da dogma a prospettiva.', curiosities: 'Il dibattito critico.' });
  db.replaceSubjectChapters('annunciazione', [{ era: 'Medioevo', text: 'Fondo oro.' }, { era: 'Rinascimento', text: 'Prospettiva.' }]);
  db.replaceSubjectWorks('annunciazione', [{ title: 'Annunciazione', artist: 'Beato Angelico', date: '1440',
    museum: 'San Marco', caption: 'Capolavoro.', imageData: png, imageMime: 'image/png', imageStatus: 'ok' }]);
  db.approveSubject('annunciazione');

  db.createComparison({ id: 'cmp-1', title: 'Angelico vs Leonardo', comparisonType: 'same-subject' });
  db.setComparisonSide('cmp-1', 'a', { source: 'library', artworkId: 'w1', title: 'Annunciazione Angelico' });
  db.setComparisonSide('cmp-1', 'b', { source: 'external', title: 'Annunciazione Leonardo', artist: 'Leonardo',
    date: '1472', museum: 'Uffizi', imageData: png, imageMime: 'image/png', imageStatus: 'ok' });
  db.replaceComparisonPoints('cmp-1', [
    { kind: 'similar', title: 'Comune', text: 'Stesso soggetto.' },
    { kind: 'different', title: 'Diverso', text: 'Luce diversa.' },
  ]);
  db.updateComparison('cmp-1', { intro: 'Due letture.', technique: 'Affresco vs olio.',
    context: 'Firenze.', critique: 'Dalla catechesi alla psicologia.', curiosities: 'La mano di Maria.' });
  db.setComparisonThumb('cmp-1', png, 'image/png');
  db.approveComparison('cmp-1');

  // Draft: NON deve migrare.
  db.createArtwork({ id: 'bozza', title: 'Bozza', artist: 'Ignoto', imagePath: 'uploads/b.jpg' });
}

test('snapshot arte→nucleo: conteggi, id stabili, idempotenza, legacy intatte', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'noesis-migrate-'));
  const dbPath = join(dir, 'm.db');
  const previous = process.env.NOESIS_CREATOR_DB;
  process.env.NOESIS_CREATOR_DB = dbPath;
  try {
    const suffix = Date.now();
    const db = await import('./noesis-roads-creator/db.mjs?t=m' + suffix);
    db.initSchema();
    await seedLegacyFixtures(db);
    const mig = await import('./noesis-roads-creator/migrate-art.mjs?t=m' + suffix);

    const report = mig.migrateAll({ db });
    assert.equal(report.ok, true);
    assert.deepEqual([report.verifica.artworks.legacy, report.verifica.artworks.migrati], [1, 1]);
    assert.deepEqual([report.verifica.subjects.legacy, report.verifica.subjects.migrati], [1, 1]);
    assert.deepEqual([report.verifica.comparisons.legacy, report.verifica.comparisons.migrati], [1, 1]);

    for (const id of ['art:opera:w1', 'art:soggetto:annunciazione', 'art:confronto:cmp-1']) {
      const full = db.getSchedaFull(id);
      assert.ok(full, id);
      assert.equal(full.stato, 'ready');
      assert.ok(full.sezioni.length > 0, id);
      assert.ok(full.immagini.length > 0, id);
      assert.equal(db.approveScheda(id).ok, true, id); // gate soddisfatto
    }
    // Dettaglio fedeltà: testi e ruoli immagini
    const opera = db.getSchedaFull('art:opera:w1');
    const byKey = new Map(opera.sezioni.map((s) => [s.chiave, s.corpo]));
    assert.ok(byKey.get('argomento').text.includes('luminoso'));
    assert.equal(byKey.get('struttura').items[0].title, 'L’angelo');
    assert.ok(byKey.get('struttura').items[0].text.includes('Gabriele'));
    assert.deepEqual(opera.immagini.map((m) => m.ruolo).sort(), ['annotata', 'hero', 'sim-1']);
    const sogg = db.getSchedaFull('art:soggetto:annunciazione');
    assert.equal(new Map(sogg.sezioni.map((s) => [s.chiave, s.corpo])).get('evoluzione').chapters.length, 2);
    const cmp = db.getSchedaFull('art:confronto:cmp-1');
    assert.equal(new Map(cmp.sezioni.map((s) => [s.chiave, s.corpo])).get('coppia').a.title, 'Annunciazione Angelico');

    // Idempotenza: seconda passata, stessi conteggi, nessuna duplicazione
    const again = mig.migrateAll({ db });
    assert.equal(again.ok, true);
    assert.equal(db.listSchede({ stato: 'ready' }).length, 3);

    // Legacy intatte e draft esclusa
    assert.deepEqual([mig.legacyReadyCounts({ db }).artworks, db.getFullArtwork('w1').status], [1, 'ready']);
    assert.equal(db.getScheda('art:opera:bozza'), null);

    // CLI --dry-run sullo stesso DB: esce 0, non scrive
    const cli = await execFileAsync('node', ['migrate-art.mjs', '--dry-run'],
      { cwd: 'noesis-roads-creator', timeout: 60000, env: { ...process.env, NOESIS_CREATOR_DB: dbPath } });
    const cliReport = JSON.parse(cli.stdout);
    assert.equal(cliReport.dryRun, true);
    assert.equal(db.listSchede({ stato: 'ready' }).length, 3);
  } finally {
    if (previous === undefined) delete process.env.NOESIS_CREATOR_DB; else process.env.NOESIS_CREATOR_DB = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test('snapshot: parità PDF legacy vs generico (stesse immagini, testi coperti, pagine ≥)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'noesis-migpdf-'));
  const dbPath = join(dir, 'm.db');
  const previous = process.env.NOESIS_CREATOR_DB;
  process.env.NOESIS_CREATOR_DB = dbPath;
  try {
    const suffix = Date.now();
    const db = await import('./noesis-roads-creator/db.mjs?t=mp' + suffix);
    db.initSchema();
    await seedLegacyFixtures(db);
    const mig = await import('./noesis-roads-creator/migrate-art.mjs?t=mp' + suffix);
    mig.migrateAll({ db });

    const cases = [
      ['opera', db.getFullArtwork('w1'), buildArtworkPdfPayload,
        db.getSchedaFull('art:opera:w1')],
      ['soggetto', db.getFullSubject('annunciazione'), buildSubjectPdfPayload,
        db.getSchedaFull('art:soggetto:annunciazione')],
      ['confronto', db.getFullComparison('cmp-1'), buildComparisonPdfPayload,
        db.getSchedaFull('art:confronto:cmp-1')],
    ];
    for (const [tipo, legacyFull, legacyBuilder, genericFull] of cases) {
      const ioImg = {
        imageData: (id) => db.getArtworkImageData(id),
        similarImage: (a, s) => db.getSimilarImage(a, s),
        subjectWorkImage: (s, w) => db.getSubjectWorkImage(s, w),
        artworkImageData: (id) => db.getArtworkImageData(id),
        comparisonSideImage: (c, side) => db.getComparisonSideImage(c, side),
        comparisonThumb: (c) => db.getComparisonThumb(c),
        getImmagine: (id) => db.getImmagine(id),
      };
      const legacyPayload = legacyBuilder(legacyFull, ioImg);
      const genericPayload = buildGenericPdfPayload(genericFull, ioImg);
      // Stesse immagini
      assert.equal(Object.keys(genericPayload.images).length, Object.keys(legacyPayload.images).length, tipo + ' immagini');
      assert.ok(genericPayload.coverImage, tipo + ' cover');
      // Tutti i testi delle sezioni legacy sono coperti dallo snapshot
      const norm = (s) => s.replace(/[\u2019\u2018\u02BC\u201B]/g, "'").toLowerCase();
      const hay = norm(JSON.stringify(genericPayload.sections));
      for (const s of legacyContents(legacyPayload.sections)) {
        assert.ok(hay.includes(norm(s)), `${tipo}: testo legacy non coperto: ${s.slice(0, 60)}`);
      }
      // Entrambi PDF validi; il generico ha almeno le pagine del legacy
      const [bufL, bufG] = await Promise.all([runMakePdf(legacyPayload), runMakePdf(genericPayload)]);
      assert.equal(bufL.subarray(0, 5).toString(), '%PDF-', tipo);
      assert.equal(bufG.subarray(0, 5).toString(), '%PDF-', tipo);
      const [pL, pG] = [countPdfPages(bufL), countPdfPages(bufG)];
      assert.ok(pG >= pL, `${tipo}: pagine generico ${pG} < legacy ${pL}`);
    }
  } finally {
    if (previous === undefined) delete process.env.NOESIS_CREATOR_DB; else process.env.NOESIS_CREATOR_DB = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
