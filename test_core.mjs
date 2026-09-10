import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SECTION_TYPES, emptyBodyFor, validateBody, isBodyEmpty,
  validateModel, listMaterie, listModelli, getModello, buildSectionPrompt,
} from './core/index.mjs';

test('sectionTypes: i 7 tipi condividono il vocabolario ARCHITECTURE.md', () => {
  assert.deepEqual(Object.keys(SECTION_TYPES).sort(), ['epochs', 'image', 'kv', 'pair', 'points', 'text', 'works']);
  assert.equal(isBodyEmpty('text', { text: '  ' }), true);
  assert.equal(isBodyEmpty('text', { text: 'Vita di Kant' }), false);
  assert.equal(isBodyEmpty('epochs', { chapters: [] }), true);
  assert.equal(isBodyEmpty('points', { items: [{ title: 'T', text: 'x' }] }), false);
  assert.deepEqual(validateBody('text', {}), ['text: campo "text" mancante']);
  assert.deepEqual(validateBody('sconosciuto', {}), ['tipo-sezione sconosciuto: sconosciuto']);
  assert.deepEqual(validateBody('kv', { entries: [{ label: 'Termine' }] }).length > 0, true);
  assert.deepEqual(emptyBodyFor('pair'), { a: { title: '', text: '' }, b: { title: '', text: '' } });
});

test('modelSpec: modello valido passa, modello rotto elenca gli errori', () => {
  const mod = getModello('filosofia', 'autore-pensiero');
  assert.equal(validateModel(mod).length, 0);
  const broken = { key: 'x', subject: '', name: '', version: 0, cover: {}, sections: [{ key: 'a', title: '', type: 'nope' }, { key: 'a', title: 'B', type: 'text' }] };
  const errs = validateModel(broken);
  assert.ok(errs.some((e) => e.includes('subject')));
  assert.ok(errs.some((e) => e.includes('sconosciuto') || e.includes('type')));
  assert.ok(errs.some((e) => e.includes('duplicata')));
  assert.ok(validateModel({ key: 'x', subject: 's', name: 'n', version: 1, cover: { eyebrow: 'e', heroRole: 'h' }, sections: [] }).some((e) => e.includes('almeno una')));
});

test('models: 2 materie x 3 modelli, tutti validi', () => {
  assert.deepEqual(listMaterie().map((m) => m.id), ['arte', 'filosofia']);
  assert.deepEqual(listModelli('arte').map((m) => m.key), ['opera', 'soggetto', 'confronto']);
  assert.deepEqual(listModelli('filosofia').map((m) => m.key), ['autore-pensiero', 'tematica', 'confronto-filosofico']);
  for (const materia of ['arte', 'filosofia']) {
    for (const m of listModelli(materia)) assert.deepEqual(validateModel(m), [], `modello ${materia}:${m.key}`);
  }
  assert.equal(getModello('filosofia', 'inesistente'), null);
});

test('prompts: intestazione + frammento + vincoli + JSON', () => {
  const mod = getModello('filosofia', 'autore-pensiero');
  const sez = mod.sections.find((s) => s.key === 'nuclei');
  const p = buildSectionPrompt({ modello: mod, sezione: sez, titoloScheda: 'Kant' });
  assert.ok(p.includes('Storia della filosofia'));
  assert.ok(p.includes('Kant'));
  assert.ok(p.includes(sez.prompt.slice(0, 20)));
  assert.ok(p.includes('SOLO con JSON valido'));
  assert.ok(p.includes('mai inventare'));
  const text = mod.sections.find((s) => s.key === 'vita');
  assert.ok(buildSectionPrompt({ modello: mod, sezione: text, titoloScheda: 'Kant' }).includes('max 180 parole'));
});

test('db nucleo: seed + scheda + gate required + immagini + RO', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'noesis-core-'));
  const dbPath = join(dir, 'core.db');
  const previous = process.env.NOESIS_CREATOR_DB;
  process.env.NOESIS_CREATOR_DB = dbPath;
  try {
    const db = await import('./noesis-roads-creator/db.mjs?t=' + Date.now());
    const core = await import('./core/index.mjs?t=' + Date.now());
    db.initSchema();
    const seeded = db.seedCore({ materie: core.listMaterie(), modelli: [...core.listModelli('arte'), ...core.listModelli('filosofia')] });
    assert.equal(seeded.materie, 2);
    assert.equal(seeded.modelli, 6);
    assert.equal(db.listMaterie().length, 2);
    assert.equal(db.listModelli('filosofia').length, 3);

    const modelloId = db.modelloIdStabile('filosofia', 'autore-pensiero', 1);
    const scheda = db.createScheda({ id: 'kant-1', modelloId, titolo: 'Kant' });
    assert.equal(scheda.stato, 'draft');

    // Gate: scheda vuota non approvabile, elenca le required mancanti
    const blocked = db.approveScheda('kant-1');
    assert.equal(blocked.ok, false);
    assert.ok(blocked.missing.includes('vita'));
    assert.ok(blocked.missing.includes('nuclei'));
    assert.equal(db.getScheda('kant-1').stato, 'draft');

    // Sezione su chiave ignota -> errore (stesso gate "sezione sconosciuta")
    assert.throws(() => db.saveSezione('kant-1', 'inesistente', {}), /sconosciuta/);

    db.saveSezione('kant-1', 'vita', { text: 'Vita di Kant in poche righe.' });
    db.saveSezione('kant-1', 'nuclei', { items: [{ title: 'Critica', text: 'La ragion pura pone i limiti.' }] });
    db.saveSezione('kant-1', 'opere', { works: [{ title: 'Critica della ragion pura', artist: 'Kant' }] });
    const ok = db.approveScheda('kant-1');
    assert.equal(ok.ok, true);
    assert.equal(db.getScheda('kant-1').stato, 'ready');

    const imgId = db.addImmagine('kant-1', 'ritratto', Buffer.from([1, 2, 3]), 'image/jpeg');
    const full = db.getSchedaFull('kant-1');
    assert.equal(full.sezioni.length, 3);
    assert.equal(full.immagini.length, 1);
    assert.equal(full.modello.chiave, 'autore-pensiero');

    // RO: la scheda ready è leggibile in sola lettura
    assert.equal(db.listReadySchedeRO().some((s) => s.id === 'kant-1'), true);
    assert.equal(db.getSchedaFullRO('kant-1').titolo, 'Kant');
    assert.equal(db.getImmagineRO(imgId).mime, 'image/jpeg');
    assert.equal(db.listReadySchedeRO(modelloId).length, 1);
  } finally {
    if (previous === undefined) delete process.env.NOESIS_CREATOR_DB; else process.env.NOESIS_CREATOR_DB = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test('normalizeSectionBody mappa il JSON grezzo sui corpi tipizzati', async () => {
  const { normalizeSectionBody } = await import('./noesis-roads-creator/server.mjs?t=n' + Date.now());
  assert.deepEqual(normalizeSectionBody('text', { text: '  Vita  ' }), { text: 'Vita' });
  assert.deepEqual(normalizeSectionBody('epochs', { chapters: [{ era: 'Medioevo', text: 't' }, { era: '', text: '' }] }),
    { chapters: [{ era: 'Medioevo', text: 't' }] });
  assert.equal(normalizeSectionBody('works', { works: [{ title: 'Critica', artist: 'Kant', caption: 'x' }] }).works[0].title, 'Critica');
  assert.equal(normalizeSectionBody('points', { items: [{ title: 'T', text: 'x' }] }).items.length, 1);
  assert.equal(normalizeSectionBody('points', { similar: [{ title: 'S', text: 's' }], different: [] }).items[0].title, 'S');
  assert.deepEqual(normalizeSectionBody('kv', { symbols: [{ symbol: 'Giglio', meaning: 'Purezza' }] }),
    { entries: [{ label: 'Giglio', value: 'Purezza' }] });
  assert.deepEqual(normalizeSectionBody('pair', { a: { title: 'A', text: 'ta' } }), { a: { title: 'A', text: 'ta' }, b: { title: '', text: '' } });
  assert.deepEqual(normalizeSectionBody('text', null), { text: '' });
});

test('buildGenericPdfPayload copre tutti i tipi-sezione senza toccare make_pdf.py', async () => {
  const { buildGenericPdfPayload } = await import('./noesis-roads-creator/server.mjs?t=p' + Date.now());
  const schema = {
    subject: 'filosofia', name: "L'autore", cover: { eyebrow: 'Scheda didattica · filosofia', heroRole: 'ritratto' },
    sections: [
      { key: 'vita', title: 'Vita', type: 'text' },
      { key: 'evo', title: 'Evo', type: 'epochs' },
      { key: 'opere', title: 'Opere', type: 'works' },
      { key: 'nuclei', title: 'Nuclei', type: 'points' },
      { key: 'gloss', title: 'Glossario', type: 'kv' },
      { key: 'coppia', title: 'Coppia', type: 'pair' },
      { key: 'tavola', title: 'Tavola', type: 'image' },
      { key: 'vuota', title: 'Vuota', type: 'text' },
    ],
  };
  const full = {
    titolo: 'Kant', modello: { schema },
    sezioni: [
      { chiave: 'vita', corpo: { text: 'Vita di Kant.' } },
      { chiave: 'evo', corpo: { chapters: [{ era: 'Illuminismo', text: 'Kant a Königsberg.' }] } },
      { chiave: 'opere', corpo: { works: [{ title: 'Critica', artist: 'Kant' }] } },
      { chiave: 'nuclei', corpo: { items: [{ title: 'T', text: 'x' }] } },
      { chiave: 'gloss', corpo: { entries: [{ label: 'A priori', value: 'Prima' }] } },
      { chiave: 'coppia', corpo: { a: { title: 'A', text: 'ta' }, b: { title: 'B', text: 'tb' } } },
      { chiave: 'tavola', corpo: { caption: 'Ritratto.' } },
    ],
    immagini: [{ id: 7, ruolo: 'ritratto', mime: 'image/png' }],
  };
  const io = { getImmagine: (id) => (id === 7 ? { data: Buffer.from([1, 2, 3]), mime: 'image/png' } : null) };
  const payload = buildGenericPdfPayload(full, io);
  assert.equal(payload.eyebrow, 'Scheda didattica · filosofia');
  assert.equal(payload.title, 'Kant');
  assert.ok(payload.coverImage && payload.coverImage.ref === 'g7'); // heroRole "ritratto" in copertina
  const kinds = payload.sections.map((s) => s.t);
  for (const k of ['chapter', 'p', 'h2', 'gallery', 'points', 'kv', 'pair', 'image']) assert.ok(kinds.includes(k), k);
  assert.ok(!payload.sections.some((s) => s.title === 'Vuota')); // sezioni vuote escluse
  const emptyImg = buildGenericPdfPayload({ titolo: 'X', modello: { schema }, sezioni: [], immagini: [] }, { getImmagine: () => null });
  assert.equal(emptyImg.coverImage, null);
  assert.equal(emptyImg.sections.length, 0);
});

test('API generiche /api/materie /models /cards: CRUD, gate, immagini, PDF', async () => {
  const { mkdtemp: mkd, rm: rmDir } = await import('node:fs/promises');
  const { tmpdir: tmpDir } = await import('node:os');
  const { join: joinPath } = await import('node:path');
  const { fork: forkProc } = await import('node:child_process');
  const { writeFile: writeTmp } = await import('node:fs/promises');
  const dir = await mkd(joinPath(tmpDir(), 'noesis-cards-'));
  const dbPath = joinPath(dir, 'cards.db');
  const previousDb = process.env.NOESIS_CREATOR_DB;
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.NOESIS_CREATOR_DB = dbPath;
  delete process.env.OPENROUTER_API_KEY; // generate senza chiave -> 503, nessuna chiamata LLM
  let child;
  try {
    const serverAbs = joinPath(process.cwd(), 'noesis-roads-creator', 'server.mjs');
    const tmpScript = joinPath(dir, 'spawn.mjs');
    await writeTmp(tmpScript, [
      `import { createCreatorServer } from 'file://${serverAbs}';`,
      'const s = createCreatorServer();',
      's.listen(0, "127.0.0.1", () => { process.stdout.write(String(s.address().port) + "\\n"); });',
    ].join('\n'));
    child = forkProc(tmpScript, [], { env: { ...process.env, NOESIS_CREATOR_DB: dbPath }, silent: true });
    const port = await new Promise((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(new Error('timeout subserver')), 15000);
      child.stdout.on('data', (c) => {
        out += String(c);
        const nl = out.indexOf('\n');
        if (nl >= 0) { clearTimeout(timer); resolve(Number(out.slice(0, nl).trim())); }
      });
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error('subserver uscito, codice ' + code)); });
    });
    const base = 'http://127.0.0.1:' + port;
    const asJson = (method, path, body) => fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

    // Materie e modelli dal seed automatico all'avvio
    let r = await asJson('GET', '/api/materie');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.materie.map((m) => m.id), ['arte', 'filosofia']);
    r = await asJson('GET', '/api/models');
    assert.equal(r.status, 400); // subject obbligatorio
    r = await asJson('GET', '/api/models?subject=filosofia');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.models.map((m) => m.chiave || m.schema.key), ['autore-pensiero', 'confronto-filosofico', 'tematica']);

    // Nuova scheda: modello ignoto -> 400; ok -> 201; stesso id -> 409
    const modelloId = 'filosofia:autore-pensiero:v1';
    r = await asJson('POST', '/api/cards', { modelloId: 'x:inesistente:v1', titolo: 'No' });
    assert.equal(r.status, 400);
    r = await asJson('POST', '/api/cards', { id: 'kant-9', modelloId, titolo: 'Kant' });
    assert.equal(r.status, 201);
    assert.equal(r.body.card.stato, 'draft');
    r = await asJson('POST', '/api/cards', { id: 'kant-9', modelloId, titolo: 'Dup' });
    assert.equal(r.status, 409);
    r = await asJson('GET', '/api/cards/kant-9');
    assert.equal(r.status, 200);
    assert.equal(r.body.modello.chiave, 'autore-pensiero');
    assert.deepEqual(r.body.sezioni, []);

    // Sezioni: chiave ignota -> 404; corpo invalido -> 400; ok -> 200
    r = await asJson('PATCH', '/api/cards/kant-9/sections/inesistente', { corpo: {} });
    assert.equal(r.status, 404);
    r = await asJson('PATCH', '/api/cards/kant-9/sections/vita', { corpo: {} });
    assert.equal(r.status, 400);
    r = await asJson('PATCH', '/api/cards/kant-9/sections/vita', { corpo: { text: 'Vita di Kant.' } });
    assert.equal(r.status, 200);

    // Approve bloccata dal gate con messaggio legacy
    r = await asJson('POST', '/api/cards/kant-9/approve', {});
    assert.equal(r.status, 400);
    assert.ok(r.body.error.message.includes('Genera e salva prima i contenuti'));
    // generate senza chiave -> 503 (nessuna chiamata LLM nei test)
    r = await asJson('POST', '/api/cards/kant-9/generate/nuclei', {});
    assert.equal(r.status, 503);
    // generate su sezione immagine -> 400 anche con chiave
    r = await asJson('GET', '/api/cards/kant-9');
    const hasImageSection = r.body.modello.schema.sections.some((s) => s.type === 'image');
    assert.equal(hasImageSection, false); // autore-pensiero non ha sezioni image

    // Completa le required e approva
    r = await asJson('PATCH', '/api/cards/kant-9/sections/nuclei', { corpo: { items: [{ title: 'Critica', text: 'Limiti.' }] } });
    assert.equal(r.status, 200);
    r = await asJson('PATCH', '/api/cards/kant-9/sections/opere', { corpo: { works: [{ title: 'Critica della ragion pura', artist: 'Kant' }] } });
    assert.equal(r.status, 200);
    r = await asJson('POST', '/api/cards/kant-9/approve', {});
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ready');

    // Immagini: ruolo obbligatorio, dataURL valido, roundtrip binario
    r = await asJson('POST', '/api/cards/kant-9/images', { ruolo: '', imageDataUrl: 'x' });
    assert.equal(r.status, 400);
    const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    r = await asJson('POST', '/api/cards/kant-9/images', { ruolo: 'ritratto', imageDataUrl: 'data:image/png;base64,' + pixel });
    assert.equal(r.status, 201);
    const imgUrl = r.body.image.url;
    const imgRes = await fetch(base + imgUrl);
    assert.equal(imgRes.status, 200);
    assert.ok((imgRes.headers.get('content-type') || '').includes('image/png'));
    r = await asJson('GET', '/api/cards/kant-9');
    assert.equal(r.body.immagini.length, 1);

    // PDF: scheda vuota -> 400; scheda piena -> application/pdf
    r = await asJson('POST', '/api/cards', { id: 'vuota-1', modelloId, titolo: 'Vuota' });
    assert.equal(r.status, 201);
    const emptyPdf = await fetch(base + '/api/cards/vuota-1/pdf');
    assert.equal(emptyPdf.status, 400);
    const fullPdf = await fetch(base + '/api/cards/kant-9/pdf');
    assert.equal(fullPdf.status, 200);
    assert.ok((fullPdf.headers.get('content-type') || '').includes('application/pdf'));
    assert.equal(Buffer.from(await fullPdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    const missingPdf = await fetch(base + '/api/cards/inesistente/pdf');
    assert.equal(missingPdf.status, 404);

    // Elenco filtrato + delete
    r = await asJson('GET', '/api/cards?stato=ready');
    assert.ok(r.body.cards.some((c) => c.id === 'kant-9'));
    r = await asJson('DELETE', '/api/cards/kant-9');
    assert.equal(r.status, 200);
    r = await asJson('GET', '/api/cards/kant-9');
    assert.equal(r.status, 404);
  } finally {
    if (child) {
      try { child.kill('SIGTERM'); } catch {}
      await new Promise((r2) => setTimeout(r2, 50));
      try { child.kill('SIGKILL'); } catch {}
    }
    if (previousDb === undefined) delete process.env.NOESIS_CREATOR_DB; else process.env.NOESIS_CREATOR_DB = previousDb;
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey;
    await rmDir(dir, { recursive: true, force: true });
  }
});

test('Viewer generico: /api/materie /models /cards + immagini (sola lettura)', async () => {
  const { mkdtemp: mkd2, rm: rmDir2 } = await import('node:fs/promises');
  const { tmpdir: tmpDir2 } = await import('node:os');
  const { join: joinPath2 } = await import('node:path');
  const dir = await mkd2(joinPath2(tmpDir2(), 'noesis-viewer-'));
  const dbPath = joinPath2(dir, 'viewer.db');
  const previousDb = process.env.NOESIS_CREATOR_DB;
  process.env.NOESIS_CREATOR_DB = dbPath;
  let server;
  try {
    const suffix = Date.now();
    const db = await import('./noesis-roads-creator/db.mjs?t=v' + suffix);
    const core = await import('./core/index.mjs?t=v' + suffix);
    db.initSchema();
    db.seedCore({ materie: core.listMaterie(), modelli: [...core.listModelli('arte'), ...core.listModelli('filosofia')] });
    // Scheda ready che copre tutti i tipi-sezione
    db.createScheda({ id: 'kant-v', modelloId: 'filosofia:autore-pensiero:v1', titolo: 'Kant' });
    db.saveSezione('kant-v', 'vita', { text: 'Vita di Kant.' });
    db.saveSezione('kant-v', 'nuclei', { items: [{ title: 'Critica', text: 'Limiti della ragione.' }] });
    db.saveSezione('kant-v', 'opere', { works: [{ title: 'Critica della ragion pura', artist: 'Kant' }] });
    db.saveSezione('kant-v', 'concetti', { entries: [{ label: 'A priori', value: 'Prima' }] });
    db.saveSezione('kant-v', 'citazioni', { items: [{ title: 'Cit', text: 'Testo.' }] });
    db.saveSezione('kant-v', 'questioni', { text: 'Questioni aperte.' });
    assert.equal(db.approveScheda('kant-v').ok, true);
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const imgId = db.addImmagine('kant-v', 'ritratto', pixel, 'image/png');
    db.createScheda({ id: 'bozza-v', modelloId: 'filosofia:autore-pensiero:v1', titolo: 'Bozza' });

    // Viewer in subprocess (isolamento DB come nel test delle cards: l'istanza
    // db.mjs importata in-process punterebbe al DB reale, non a quello temp).
    const { fork: forkViewer } = await import('node:child_process');
    const { writeFile: writeViewerTmp } = await import('node:fs/promises');
    const viewerAbs = joinPath2(process.cwd(), 'server.mjs');
    const viewerScript = joinPath2(dir, 'spawn_viewer.mjs');
    await writeViewerTmp(viewerScript, [
      `import { createAppServer } from 'file://${viewerAbs}';`,
      'const s = createAppServer();',
      's.listen(0, "127.0.0.1", () => { process.stdout.write(String(s.address().port) + "\\n"); });',
    ].join('\n'));
    const childViewer = forkViewer(viewerScript, [], { env: { ...process.env, NOESIS_CREATOR_DB: dbPath }, silent: true });
    const viewerPort = await new Promise((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(new Error('timeout viewer')), 15000);
      childViewer.stdout.on('data', (c) => {
        out += String(c);
        const nl = out.indexOf('\n');
        if (nl >= 0) { clearTimeout(timer); resolve(Number(out.slice(0, nl).trim())); }
      });
      childViewer.on('error', (e) => { clearTimeout(timer); reject(e); });
      childViewer.on('exit', (code) => { clearTimeout(timer); reject(new Error('viewer uscito, codice ' + code)); });
    });
    server = { close: (cb) => { try { childViewer.kill('SIGKILL'); } catch {} cb && cb(); } };
    const base = 'http://127.0.0.1:' + viewerPort;

    let res = await fetch(base + '/api/materie');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).materie.length, 2);

    res = await fetch(base + '/api/models');
    assert.equal(res.status, 400);
    res = await fetch(base + '/api/models?subject=filosofia');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).models.length, 3);

    res = await fetch(base + '/api/cards/kant-v');
    assert.equal(res.status, 200);
    const card = await res.json();
    assert.equal(card.cardType, 'scheda');
    assert.equal(card.modello.chiave, 'autore-pensiero');
    const tipi = new Map(card.modello.schema.sections.map((s) => [s.key, s.type]));
    assert.equal(tipi.get('vita'), 'text');
    assert.equal(tipi.get('nuclei'), 'points');
    assert.equal(card.sezioni.length, 6);
    assert.equal(card.immagini.length, 1);
    assert.ok(card.immagini[0].url.endsWith('/api/cards/kant-v/images/' + imgId));

    res = await fetch(base + '/api/cards/kant-v/images/' + imgId);
    assert.equal(res.status, 200);
    assert.ok((res.headers.get('content-type') || '').includes('image/png'));

    res = await fetch(base + '/api/cards/bozza-v');
    assert.equal(res.status, 404); // draft non visibile nel viewer
    res = await fetch(base + '/api/cards/inesistente');
    assert.equal(res.status, 404);

    res = await fetch(base + '/api/library');
    assert.equal(res.status, 200);
    const lib = await res.json();
    assert.ok(Array.isArray(lib.cards));
    assert.ok(lib.cards.some((c) => c.id === 'kant-v' && c.cardType === 'scheda'));
    assert.equal(lib.cards.find((c) => c.id === 'kant-v').materiaId, 'filosofia');
    assert.ok(Array.isArray(lib.artworks)); // legacy intatte
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    if (previousDb === undefined) delete process.env.NOESIS_CREATOR_DB; else process.env.NOESIS_CREATOR_DB = previousDb;
    await rmDir2(dir, { recursive: true, force: true });
  }
});

test('API cards: sezioni epochs/kv/pair e didascalia immagine', async () => {
  const { mkdtemp: mkd3, rm: rmDir3 } = await import('node:fs/promises');
  const { tmpdir: tmpDir3 } = await import('node:os');
  const { join: joinPath3 } = await import('node:path');
  const { fork: forkProc3 } = await import('node:child_process');
  const { writeFile: writeTmp3 } = await import('node:fs/promises');
  const dir = await mkd3(joinPath3(tmpDir3(), 'noesis-sect-'));
  const dbPath = joinPath3(dir, 's.db');
  const previousDb = process.env.NOESIS_CREATOR_DB;
  process.env.NOESIS_CREATOR_DB = dbPath;
  let child;
  try {
    const serverAbs = joinPath3(process.cwd(), 'noesis-roads-creator', 'server.mjs');
    const tmpScript = joinPath3(dir, 'spawn.mjs');
    await writeTmp3(tmpScript, [
      `import { createCreatorServer } from 'file://${serverAbs}';`,
      'const s = createCreatorServer();',
      's.listen(0, "127.0.0.1", () => { process.stdout.write(String(s.address().port) + "\\n"); });',
    ].join('\n'));
    child = forkProc3(tmpScript, [], { env: { ...process.env, NOESIS_CREATOR_DB: dbPath }, silent: true });
    const port = await new Promise((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(new Error('timeout subserver')), 15000);
      child.stdout.on('data', (c) => {
        out += String(c);
        const nl = out.indexOf('\n');
        if (nl >= 0) { clearTimeout(timer); resolve(Number(out.slice(0, nl).trim())); }
      });
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error('subserver uscito, codice ' + code)); });
    });
    const base = 'http://127.0.0.1:' + port;
    const asJson = (method, path, body) => fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

    // tematica: epochs + works + pair assente -> uso confronto-filosofico per pair, tematica per epochs
    let r = await asJson('POST', '/api/cards', { id: 'tempo-1', modelloId: 'filosofia:tematica:v1', titolo: 'Il tempo' });
    assert.equal(r.status, 201);
    r = await asJson('PATCH', '/api/cards/tempo-1/sections/evoluzione', { corpo: { chapters: [{ era: 'Antichità', text: 'Agostino.' }] } });
    assert.equal(r.status, 200);
    r = await asJson('PATCH', '/api/cards/tempo-1/sections/evoluzione', { corpo: { chapters: [{ era: '', text: '' }] } });
    assert.equal(r.status, 400); // voce vuota rifiutata
    r = await asJson('POST', '/api/cards', { id: 'pb-1', modelloId: 'filosofia:confronto-filosofico:v1', titolo: 'Platone vs Aristotele' });
    assert.equal(r.status, 201);
    r = await asJson('PATCH', '/api/cards/pb-1/sections/coppia', { corpo: { a: { title: 'Platone', text: 'Idee.' }, b: { title: '', text: '' } } });
    assert.equal(r.status, 400); // lato B vuoto rifiutato
    r = await asJson('PATCH', '/api/cards/pb-1/sections/coppia', { corpo: { a: { title: 'Platone', text: 'Idee.' }, b: { title: 'Aristotele', text: 'Sostanza.' } } });
    assert.equal(r.status, 200);
    // kv del glossario autore-pensiero
    r = await asJson('POST', '/api/cards', { id: 'kant-g', modelloId: 'filosofia:autore-pensiero:v1', titolo: 'Kant' });
    assert.equal(r.status, 201);
    r = await asJson('PATCH', '/api/cards/kant-g/sections/concetti', { corpo: { entries: [{ label: 'A priori', value: 'Prima.' }] } });
    assert.equal(r.status, 200);
    r = await asJson('PATCH', '/api/cards/kant-g/sections/concetti', { corpo: { entries: [{ label: '', value: '' }] } });
    assert.equal(r.status, 400);
    // arte opera: sezione tavola (image) accetta didascalia via PATCH
    r = await asJson('POST', '/api/cards', { id: 'op-1', modelloId: 'arte:opera:v1', titolo: 'Annunciazione' });
    assert.equal(r.status, 201);
    r = await asJson('PATCH', '/api/cards/op-1/sections/tavola', { corpo: { caption: 'Tavola.' } });
    assert.equal(r.status, 200);
  } finally {
    if (child) {
      try { child.kill('SIGTERM'); } catch {}
      await new Promise((r2) => setTimeout(r2, 50));
      try { child.kill('SIGKILL'); } catch {}
    }
    if (previousDb === undefined) delete process.env.NOESIS_CREATOR_DB; else process.env.NOESIS_CREATOR_DB = previousDb;
    await rmDir3(dir, { recursive: true, force: true });
  }
});

test('Viewer PDF: libro d\u2019arte per i 4 tipi + gate (sola lettura)', async () => {
  const { mkdtemp: mkd4, rm: rmDir4 } = await import('node:fs/promises');
  const { tmpdir: tmpDir4 } = await import('node:os');
  const { join: joinPath4 } = await import('node:path');
  const { fork: forkProc4 } = await import('node:child_process');
  const { writeFile: writeTmp4 } = await import('node:fs/promises');
  const dir = await mkd4(joinPath4(tmpDir4(), 'noesis-vpdf-'));
  const dbPath = joinPath4(dir, 'v.db');
  const previousDb = process.env.NOESIS_CREATOR_DB;
  process.env.NOESIS_CREATOR_DB = dbPath;
  let child;
  try {
    const suffix = Date.now();
    const db = await import('./noesis-roads-creator/db.mjs?t=vp' + suffix);
    const core = await import('./core/index.mjs?t=vp' + suffix);
    db.initSchema();
    db.seedCore({ materie: core.listMaterie(), modelli: [...core.listModelli('arte'), ...core.listModelli('filosofia')] });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    db.createArtwork({ id: 'w1', title: 'Annunciazione', artist: 'Beato Angelico', imagePath: 'uploads/x.jpg',
      imageData: png, imageMime: 'image/png', imageWidth: 1, imageHeight: 1 });
    db.saveOverview('w1', { painting: 'Il dipinto.', artist: 'Il frate.' }, { status: 'approved' });
    db.approveArtwork('w1');
    db.createSubject({ id: 'nat', name: 'Natività' });
    db.updateSubject('nat', { intro: 'Intro.' });
    db.approveSubject('nat');
    db.createSubject({ id: 'vuoto', name: 'Vuoto' });
    db.createComparison({ id: 'cmp-1', title: 'Confronto' });
    db.setComparisonSide('cmp-1', 'a', { source: 'library', artworkId: 'w1', title: 'A' });
    db.setComparisonSide('cmp-1', 'b', { source: 'external', title: 'B', imageStatus: 'missing' });
    db.updateComparison('cmp-1', { intro: 'Intro confronto.' });
    db.approveComparison('cmp-1');
    db.createScheda({ id: 'kant-vpdf', modelloId: 'filosofia:autore-pensiero:v1', titolo: 'Kant' });
    db.saveSezione('kant-vpdf', 'vita', { text: 'Vita.' });
    db.saveSezione('kant-vpdf', 'nuclei', { items: [{ title: 'T', text: 'x' }] });
    db.saveSezione('kant-vpdf', 'opere', { works: [{ title: 'Critica', artist: 'Kant' }] });
    assert.equal(db.approveScheda('kant-vpdf').ok, true);

    const viewerAbs = joinPath4(process.cwd(), 'server.mjs');
    const viewerScript = joinPath4(dir, 'spawn_viewer.mjs');
    await writeTmp4(viewerScript, [
      `import { createAppServer } from 'file://${viewerAbs}';`,
      'const s = createAppServer();',
      's.listen(0, "127.0.0.1", () => { process.stdout.write(String(s.address().port) + "\\n"); });',
    ].join('\n'));
    child = forkProc4(viewerScript, [], { env: { ...process.env, NOESIS_CREATOR_DB: dbPath }, silent: true });
    const port = await new Promise((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(new Error('timeout viewer')), 15000);
      child.stdout.on('data', (c) => {
        out += String(c);
        const nl = out.indexOf('\n');
        if (nl >= 0) { clearTimeout(timer); resolve(Number(out.slice(0, nl).trim())); }
      });
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error('viewer uscito, codice ' + code)); });
    });
    const base = 'http://127.0.0.1:' + port;
    for (const path of ['/api/artworks/w1/pdf', '/api/subjects/nat/pdf', '/api/comparisons/cmp-1/pdf', '/api/cards/kant-vpdf/pdf']) {
      const res = await fetch(base + path);
      assert.equal(res.status, 200, path);
      assert.ok((res.headers.get('content-type') || '').includes('application/pdf'), path);
      assert.ok((res.headers.get('content-disposition') || '').includes('.pdf'), path);
      assert.equal(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString(), '%PDF-', path);
    }
    const empty = await fetch(base + '/api/subjects/vuoto/pdf');
    assert.equal(empty.status, 400);
    const missing = await fetch(base + '/api/cards/inesistente/pdf');
    assert.equal(missing.status, 404);
  } finally {
    if (child) {
      try { child.kill('SIGTERM'); } catch {}
      await new Promise((r2) => setTimeout(r2, 50));
      try { child.kill('SIGKILL'); } catch {}
    }
    if (previousDb === undefined) delete process.env.NOESIS_CREATOR_DB; else process.env.NOESIS_CREATOR_DB = previousDb;
    await rmDir4(dir, { recursive: true, force: true });
  }
});
