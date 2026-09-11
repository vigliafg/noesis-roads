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

test('models: 3 materie (5+6+5 modelli), tutti validi', () => {
  assert.deepEqual(listMaterie().map((m) => m.id), ['arte', 'filosofia', 'letteratura-italiana']);
  assert.deepEqual(listModelli('letteratura-italiana').map((m) => m.key), ['opera-letteraria', 'opera-letteraria', 'confronto-letterario', 'tematica-letteraria', 'autore']);
  assert.deepEqual(listModelli('filosofia').map((m) => m.key), ['autore-pensiero', 'tematica', 'opera-filosofica', 'opera-filosofica', 'confronto-filosofico', 'autore']);
  assert.deepEqual(listModelli('arte').map((m) => m.key), ['opera', 'opera', 'soggetto', 'confronto', 'autore']);
  for (const materia of ['arte', 'filosofia', 'letteratura-italiana']) {
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
    const seeded = db.seedCore({ materie: core.listMaterie(), modelli: [...core.listModelli('arte'), ...core.listModelli('filosofia'), ...core.listModelli('letteratura-italiana')] });
    assert.equal(seeded.materie, 3);
    assert.equal(seeded.modelli, 16);
    assert.equal(db.listMaterie().length, 3);
    assert.equal(db.listModelli('filosofia').length, 6);
    db.updateMateria('filosofia', { systemPrompt: 'Tono custom.' });
    db.seedCore({ materie: core.listMaterie(), modelli: [] });
    assert.equal(db.getMateria('filosofia').systemPrompt, 'Tono custom.'); // il seed non sovrascrive

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
    assert.deepEqual(r.body.materie.map((m) => m.id), ['arte', 'filosofia', 'letteratura-italiana']);
    r = await asJson('GET', '/api/models');
    assert.equal(r.status, 400); // subject obbligatorio
    r = await asJson('GET', '/api/models?subject=filosofia');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.models.map((m) => m.chiave || m.schema.key), ['autore', 'autore-pensiero', 'confronto-filosofico', 'opera-filosofica', 'opera-filosofica', 'tematica']);

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
    db.seedCore({ materie: core.listMaterie(), modelli: [...core.listModelli('arte'), ...core.listModelli('filosofia'), ...core.listModelli('letteratura-italiana')] });
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
    db.createScheda({ id: 'sub-v', modelloId: 'filosofia:autore-pensiero:v1', titolo: 'Sub', sezioniAttive: ['vita', 'nuclei', 'opere'] });
    db.saveSezione('sub-v', 'vita', { text: 'Vita.' });
    db.saveSezione('sub-v', 'nuclei', { items: [{ title: 'T', text: 'x' }] });
    db.saveSezione('sub-v', 'opere', { works: [{ title: 'W', artist: 'A' }] });
    assert.throws(() => db.saveSezione('sub-v', 'concetti', { entries: [] }), /non attiva/); // fuori attive: rifiutata ovunque
    assert.equal(db.approveScheda('sub-v').ok, true);

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
    assert.equal((await res.json()).materie.length, 3);

    res = await fetch(base + '/api/models');
    assert.equal(res.status, 400);
    res = await fetch(base + '/api/models?subject=filosofia');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).models.length, 6);

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

    res = await fetch(base + '/api/cards/sub-v');
    assert.equal(res.status, 200);
    const sub = await res.json();
    assert.deepEqual(sub.sezioni.map((s) => s.chiave).sort(), ['nuclei', 'opere', 'vita']);
    assert.ok(!sub.modello.schema.sections.some((s) => s.key === 'concetti'));
    assert.ok(sub.modello.schema.sections.some((s) => s.key === 'vita'));
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
    db.seedCore({ materie: core.listMaterie(), modelli: [...core.listModelli('arte'), ...core.listModelli('filosofia'), ...core.listModelli('letteratura-italiana')] });
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

test('generate sezione: percorso completo con OpenRouter simulato (regressione normalizeSectionBody)', async () => {
  const { mkdtemp: mkd5, rm: rmDir5 } = await import('node:fs/promises');
  const { tmpdir: tmpDir5 } = await import('node:os');
  const { join: joinPath5 } = await import('node:path');
  const { fork: forkProc5 } = await import('node:child_process');
  const { writeFile: writeTmp5 } = await import('node:fs/promises');
  const { createServer: httpServer } = await import('node:http');
  const dir = await mkd5(joinPath5(tmpDir5(), 'noesis-gen-'));
  const dbPath = joinPath5(dir, 'g.db');
  const previousDb = process.env.NOESIS_CREATOR_DB;
  process.env.NOESIS_CREATOR_DB = dbPath;
  let child, stub;
  try {
    // Stub OpenRouter: risposta JSON valida per la sezione nuclei.
    let calls = 0;
    stub = httpServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        calls += 1;
        const payload = { choices: [{ message: { content: '{"items":[{"title":"Critica","text":"Limiti della ragione."},{"title":"Etica","text":"Agisci per dovere."}]}', annotations: [] } }] };
        const data = Buffer.from(JSON.stringify(payload));
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': data.length });
        res.end(data);
      });
    });
    await new Promise((r) => stub.listen(0, '127.0.0.1', r));
    const stubUrl = 'http://127.0.0.1:' + stub.address().port + '/chat/completions';

    const serverAbs = joinPath5(process.cwd(), 'noesis-roads-creator', 'server.mjs');
    const tmpScript = joinPath5(dir, 'spawn.mjs');
    await writeTmp5(tmpScript, [
      `import { createCreatorServer } from 'file://${serverAbs}';`,
      'const s = createCreatorServer();',
      's.listen(0, "127.0.0.1", () => { process.stdout.write(String(s.address().port) + "\\n"); });',
    ].join('\n'));
    child = forkProc5(tmpScript, [], {
      env: { ...process.env, NOESIS_CREATOR_DB: dbPath, OPENROUTER_API_KEY: 'test-key', OPENROUTER_ENDPOINT: stubUrl, OPENROUTER_RPM: '60' },
      silent: true,
    });
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

    let r = await asJson('POST', '/api/cards', { id: 'gen-1', modelloId: 'filosofia:autore-pensiero:v1', titolo: 'Kant' });
    assert.equal(r.status, 201);
    r = await asJson('POST', '/api/cards/gen-1/generate/nuclei', {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.warnings, []);
    assert.equal(r.body.section.corpo.items.length, 2);
    assert.equal(r.body.section.corpo.items[0].title, 'Critica');
    assert.equal(r.body.section.model, 'filosofia:autore-pensiero:v1');
    assert.ok(/^v1:[0-9a-f]{8}$/.test(r.body.section.promptVersion), 'timbro prompt_version');
    assert.equal(calls, 1);
    // Rilettura: la sezione è persistita
    r = await asJson('GET', '/api/cards/gen-1');
    assert.ok(r.body.sezioni.some((s) => s.chiave === 'nuclei' && s.corpo.items.length === 2));
    // Sezione image: 400 senza toccare l'LLM
    r = await asJson('POST', '/api/cards/gen-1/generate/opere', {});
    assert.equal(r.status, 200); // works: normalizza la stessa risposta stub
    assert.ok(Array.isArray(r.body.section.corpo.works));
  } finally {
    if (child) {
      try { child.kill('SIGTERM'); } catch {}
      await new Promise((r2) => setTimeout(r2, 50));
      try { child.kill('SIGKILL'); } catch {}
    }
    if (stub) await new Promise((r2) => stub.close(r2));
    if (previousDb === undefined) delete process.env.NOESIS_CREATOR_DB; else process.env.NOESIS_CREATOR_DB = previousDb;
    await rmDir5(dir, { recursive: true, force: true });
  }
});

test('API wizard: materie/modelli/sezioni/fork + sezioniAttive + preview', async () => {
  const { mkdtemp: mkd6, rm: rmDir6 } = await import('node:fs/promises');
  const { tmpdir: tmpDir6 } = await import('node:os');
  const { join: joinPath6 } = await import('node:path');
  const { fork: forkProc6 } = await import('node:child_process');
  const { writeFile: writeTmp6 } = await import('node:fs/promises');
  const dir = await mkd6(joinPath6(tmpDir6(), 'noesis-wiz-'));
  const dbPath = joinPath6(dir, 'w.db');
  const previousDb = process.env.NOESIS_CREATOR_DB;
  process.env.NOESIS_CREATOR_DB = dbPath;
  let child;
  try {
    const serverAbs = joinPath6(process.cwd(), 'noesis-roads-creator', 'server.mjs');
    const tmpScript = joinPath6(dir, 'spawn.mjs');
    await writeTmp6(tmpScript, [
      `import { createCreatorServer } from 'file://${serverAbs}';`,
      'const s = createCreatorServer();',
      's.listen(0, "127.0.0.1", () => { process.stdout.write(String(s.address().port) + "\\n"); });',
    ].join('\n'));
    child = forkProc6(tmpScript, [], { env: { ...process.env, NOESIS_CREATOR_DB: dbPath }, silent: true });
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

    // --- materie ---
    let r = await asJson('POST', '/api/materie', { nome: '' });
    assert.equal(r.status, 400);
    r = await asJson('POST', '/api/materie', { id: 'musica', nome: 'Storia della musica', systemPrompt: 'Sei un musicologo.' });
    assert.equal(r.status, 201);
    assert.equal(r.body.materia.systemPrompt, 'Sei un musicologo.');
    r = await asJson('POST', '/api/materie', { id: 'musica', nome: 'Dup' });
    assert.equal(r.status, 409);
    r = await asJson('PATCH', '/api/materie/musica', { descrizione: 'Note e spartiti.' });
    assert.equal(r.status, 200);
    assert.equal(r.body.materia.descrizione, 'Note e spartiti.');
    assert.equal(r.body.materia.systemPrompt, 'Sei un musicologo.'); // preservato
    r = await asJson('DELETE', '/api/materie/musica');
    assert.equal(r.status, 200); // vuota: si elimina

    // --- modelli: draft, validazione, template, fork ---
    r = await asJson('POST', '/api/models', { materiaId: 'filosofia', nome: 'Bozza' });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.model.schema.sections, []);
    const draftId = r.body.model.id;
    r = await asJson('POST', '/api/cards', { modelloId: draftId, titolo: 'X' });
    assert.equal(r.status, 400); // draft senza sezioni: niente schede
    assert.ok(r.body.error.message.includes('non valido'));
    r = await asJson('POST', '/api/models/' + encodeURIComponent(draftId) + '/sections', { key: 'vita', title: '', type: 'text' });
    assert.equal(r.status, 400); // title mancante
    r = await asJson('POST', '/api/models/' + encodeURIComponent(draftId) + '/sections', { key: 'vita', title: 'Vita', type: 'nope' });
    assert.equal(r.status, 400); // tipo sconosciuto
    r = await asJson('POST', '/api/models/' + encodeURIComponent(draftId) + '/sections',
      { key: 'vita', title: 'Vita', type: 'text', required: true, prompt: 'Racconta la vita.', maxWords: 180 });
    assert.equal(r.status, 201);
    r = await asJson('POST', '/api/models/' + encodeURIComponent(draftId) + '/sections', { key: 'vita', title: 'Dup', type: 'text' });
    assert.equal(r.status, 400); // chiave duplicata
    r = await asJson('POST', '/api/cards', { id: 'mw-1', modelloId: draftId, titolo: 'Prova' });
    assert.equal(r.status, 201); // ora valido
    r = await asJson('PATCH', '/api/models/' + encodeURIComponent(draftId) + '/sections/vita', { title: 'Cambio' });
    assert.equal(r.status, 409); // congelato: ha schede
    r = await asJson('DELETE', '/api/models/' + encodeURIComponent(draftId));
    assert.equal(r.status, 409);
    r = await asJson('POST', '/api/models/' + encodeURIComponent(draftId) + '/fork', {});
    assert.equal(r.status, 201);
    assert.ok(r.body.model.id.endsWith(':v2'));
    const v2 = r.body.model.id;
    r = await asJson('PATCH', '/api/models/' + encodeURIComponent(v2) + '/sections/vita', { title: 'Vita e contesto' });
    assert.equal(r.status, 200); // v2 senza schede: libero
    r = await asJson('POST', '/api/models', { materiaId: 'filosofia', chiave: 'autore2', nome: 'Autore 2', fromTemplate: 'filosofia:autore-pensiero:v1' });
    assert.equal(r.status, 201);
    assert.ok(r.body.model.schema.sections.length >= 5); // clone ereditato
    r = await asJson('POST', '/api/materie', { id: 'encoe', nome: 'Enoches' });
    assert.equal(r.status, 201);
    r = await asJson('POST', '/api/models', { materiaId: 'encoe', chiave: 'autore2', nome: 'Autore 2', fromTemplate: 'filosofia:autore-pensiero:v1' });
    assert.equal(r.status, 201);
    assert.equal(r.body.model.schema.cover.eyebrow, 'Scheda didattica · Enoches'); // clone tra materie: eyebrow adattata
    r = await asJson('DELETE', '/api/models/' + encodeURIComponent(r.body.model.id));
    assert.equal(r.status, 200); // senza schede: si elimina

    // --- sezioniAttive sulle cards ---
    r = await asJson('POST', '/api/cards', { id: 'mw-sub', modelloId: 'filosofia:autore-pensiero:v1', titolo: 'Sub', sezioniAttive: ['vita'] });
    assert.equal(r.status, 400); // required escluse
    assert.ok(r.body.error.message.includes('required'));
    r = await asJson('POST', '/api/cards', { id: 'mw-sub', modelloId: 'filosofia:autore-pensiero:v1', titolo: 'Sub', sezioniAttive: ['vita', 'nuclei', 'opere', 'nope'] });
    assert.equal(r.status, 400); // chiave sconosciuta
    r = await asJson('POST', '/api/cards', { id: 'mw-sub', modelloId: 'filosofia:autore-pensiero:v1', titolo: 'Sub', sezioniAttive: ['vita', 'nuclei', 'opere'] });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.card.sezioniAttive, ['vita', 'nuclei', 'opere']);
    r = await asJson('PATCH', '/api/cards/mw-sub/sections/concetti', { corpo: { entries: [] } });
    assert.equal(r.status, 400); // fuori attive
    assert.ok(r.body.error.message.includes('non attiva'));
    r = await asJson('PATCH', '/api/cards/mw-sub/sections/vita', { corpo: { text: 'Vita.' } });
    assert.equal(r.status, 200);
    r = await asJson('PATCH', '/api/cards/mw-sub', { sezioniAttive: ['vita'] });
    assert.equal(r.status, 400); // toglierebbe required
    r = await asJson('POST', '/api/cards/mw-sub/approve', {});
    assert.equal(r.status, 400); // nuclei+opere vuote
    r = await asJson('PATCH', '/api/cards/mw-sub/sections/nuclei', { corpo: { items: [{ title: 'T', text: 'x' }] } });
    assert.equal(r.status, 200);
    r = await asJson('PATCH', '/api/cards/mw-sub/sections/opere', { corpo: { works: [{ title: 'W', artist: 'A' }] } });
    assert.equal(r.status, 200);
    r = await asJson('POST', '/api/cards/mw-sub/approve', {});
    assert.equal(r.status, 200); // gate sulle attive
    r = await asJson('PATCH', '/api/cards/mw-sub', { sezioniAttive: ['vita', 'nuclei', 'opere', 'concetti'] });
    assert.equal(r.status, 400); // ready: attive congelate

    // --- standard=1: solo ultima versione valida (niente bozze, niente vecchie) ---
    r = await asJson('POST', '/api/models', { materiaId: 'filosofia', nome: 'Vuota' });
    assert.equal(r.status, 201); // draft senza sezioni
    r = await asJson('GET', '/api/models?subject=filosofia&standard=1');
    assert.equal(r.status, 200);
    const stdKeys = r.body.models.map((m) => m.chiave + ':v' + m.versione);
    assert.ok(!stdKeys.includes('bozza:v1'), 'bozza vuota esclusa');
    assert.ok(!stdKeys.includes('autore-pensiero:v1'), 'legacy nascosto alla creazione');
    assert.deepEqual(stdKeys.filter((k) => k.startsWith('autore:')), ['autore:v1'], 'solo autore standard');
    assert.ok(stdKeys.filter((k) => k.startsWith('autore-pensiero:')).length <= 1, 'una sola versione per chiave');
    assert.ok(stdKeys.includes('autore:v1') || stdKeys.includes('autore-pensiero:v1'), 'standard presenti: ' + stdKeys.join(','));
    const v1count = r.body.models.filter((m) => m.id === 'filosofia:autore-pensiero:v1').length;
    assert.ok(v1count <= 1, 'nessun duplicato di versione');

    // --- preview prompt ---
    r = await asJson('GET', '/api/prompts/preview?modello=filosofia%3Aautore-pensiero%3Av1&sezione=nuclei');
    assert.equal(r.status, 200);
    assert.ok(r.body.system.includes('SOLO con JSON valido'));
    assert.ok(r.body.user.includes('nuclei'));
    assert.ok(/^v1:[0-9a-f]{8}$/.test(r.body.version));
    r = await asJson('GET', '/api/prompts/preview?modello=nope&sezione=nuclei');
    assert.equal(r.status, 404);
  } finally {
    if (child) {
      try { child.kill('SIGTERM'); } catch {}
      await new Promise((r2) => setTimeout(r2, 50));
      try { child.kill('SIGKILL'); } catch {}
    }
    if (previousDb === undefined) delete process.env.NOESIS_CREATOR_DB; else process.env.NOESIS_CREATOR_DB = previousDb;
    await rmDir6(dir, { recursive: true, force: true });
  }
});

test('pair con immagini: builder PDF usa coppia-a/b (fallback lato-a/b)', async () => {
  const { buildGenericPdfPayload } = await import('./noesis-roads-creator/server.mjs?t=pair' + Date.now());
  const schema = {
    subject: 'filosofia', name: 'Confronto', cover: { eyebrow: 'E', heroRole: 'x' },
    sections: [{ key: 'coppia', title: 'Coppia', type: 'pair' }],
  };
  const mk = (ruoli) => ({
    titolo: 'C', modello: { schema },
    sezioni: [{ chiave: 'coppia', corpo: { a: { title: 'A', text: 'ta' }, b: { title: 'B', text: 'tb' } } }],
    immagini: ruoli.map((r, i) => ({ id: 10 + i, ruolo: r, mime: 'image/png' })),
  });
  const ioOf = (ids) => ({ getImmagine: (id) => (ids.includes(id) ? { data: Buffer.from([1]), mime: 'image/png' } : null) });
  let p = buildGenericPdfPayload(mk(['coppia-a', 'coppia-b']), ioOf([10, 11]));
  let pair = p.sections.find((s) => s.t === 'pair');
  assert.ok(pair.a.image && pair.a.image.ref === 'g10');
  assert.ok(pair.b.image && pair.b.image.ref === 'g11');
  p = buildGenericPdfPayload(mk(['lato-a']), ioOf([10]));
  pair = p.sections.find((s) => s.t === 'pair');
  assert.ok(pair.a.image && pair.b.image === null); // fallback snapshot + assenza
  p = buildGenericPdfPayload(mk([]), ioOf([]));
  pair = p.sections.find((s) => s.t === 'pair');
  assert.equal(pair.a.image, null);
});

test('seed guard: schema congelato con schede, libero senza', async () => {
  const { mkdtemp: mkd7, rm: rmDir7 } = await import('node:fs/promises');
  const { tmpdir: tmpDir7 } = await import('node:os');
  const { join: joinPath7 } = await import('node:path');
  const dir = await mkd7(joinPath7(tmpDir7(), 'noesis-seedguard-'));
  const dbPath = joinPath7(dir, 'g.db');
  const previousDb = process.env.NOESIS_CREATOR_DB;
  process.env.NOESIS_CREATOR_DB = dbPath;
  try {
    const db = await import('./noesis-roads-creator/db.mjs?t=sg' + Date.now());
    db.initSchema();
    db.upsertMateria({ id: 'm', nome: 'M' });
    const schemaA = { key: 'k', subject: 'm', name: 'K', version: 1, cover: { eyebrow: 'E', heroRole: 'hero' }, sections: [{ key: 'a', title: 'A', type: 'text', prompt: 'uno' }] };
    db.upsertModello({ materiaId: 'm', chiave: 'k', nome: 'K', versione: 1, schema: schemaA });
    // senza schede: il seed aggiorna
    const schemaB = { ...schemaA, sections: [{ key: 'a', title: 'A2', type: 'text', prompt: 'due' }] };
    db.upsertModello({ materiaId: 'm', chiave: 'k', nome: 'K2', versione: 1, schema: schemaB });
    assert.equal(db.getModello('m:k:v1').schema.sections[0].title, 'A2');
    // con schede: nome sì, schema no
    db.createScheda({ id: 's1', modelloId: 'm:k:v1', titolo: 'S' });
    const schemaC = { ...schemaB, sections: [{ key: 'a', title: 'A3', type: 'text', prompt: 'tre' }] };
    db.upsertModello({ materiaId: 'm', chiave: 'k', nome: 'K3', versione: 1, schema: schemaC });
    const kept = db.getModello('m:k:v1');
    assert.equal(kept.nome, 'K3');
    assert.equal(kept.schema.sections[0].title, 'A2');
  } finally {
    if (previousDb === undefined) delete process.env.NOESIS_CREATOR_DB; else process.env.NOESIS_CREATOR_DB = previousDb;
    await rmDir7(dir, { recursive: true, force: true });
  }
});

test('audit prompt: vincoli, anti-allucinazione, niente groups', async () => {
  const core = await import('./core/index.mjs?t=pa' + Date.now());
  const all = [];
  for (const mat of core.listMaterie()) for (const mod of core.listModelli(mat.id)) all.push([mat.id, mod]);
  assert.ok(all.length >= 12, 'tutti i modelli del registry');
  for (const [mat, mod] of all) {
    for (const s of mod.sections) {
      assert.ok(s.prompt && s.prompt.trim(), `${mat}:${mod.key}#${s.key} prompt presente`);
      assert.equal(s.groups, undefined, `${mat}:${mod.key}#${s.key} senza groups`);
      if (s.type === 'points') assert.ok(/\d/.test(s.prompt), `${mat}:${mod.key}#${s.key} numerosità`);
      if (s.type === 'kv') assert.ok(/\d/.test(s.prompt), `${mat}:${mod.key}#${s.key} numerosità`);
    }
  }
  const get = (mat, key) => core.getModello(mat, key).sections;
  const byKey = (secs, k) => secs.find((s) => s.key === k);
  assert.ok(byKey(get('arte', 'opera'), 'dettagli').prompt.includes('4-6'));
  assert.ok(byKey(get('arte', 'soggetto'), 'opere').prompt.includes('6-10'));
  assert.ok(byKey(get('arte', 'confronto'), 'coppia').prompt.includes('collocazione'));
  const titoli = [];
  for (const [, mod] of all) for (const s of mod.sections) if (s.key === 'curiosita') titoli.push(s.title);
  assert.ok(titoli.every((t) => t === 'Curiosità' || t === 'Edizioni e curiosità'), 'titoli curiosità uniformi: ' + [...new Set(titoli)].join('|'));
});
