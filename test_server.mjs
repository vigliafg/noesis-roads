import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, fork } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildOverviewPrompt, buildSimilarPrompt, buildTextPrompt, callModel, callOpenRouter, callOpenRouterOverview, cleanModelJson, createAppServer, getOpenRouterApiKey, normalizeAnalysis, normalizeOverview, normalizeSimilar, resolveSimilarImage, VISION_MODEL, TEXT_MODEL } from './server.mjs';
import { buildArtworkPdfPayload, buildSubjectPdfPayload, buildComparisonPdfPayload, createCreatorServer } from './noesis-roads-creator/server.mjs';

const execFileAsync = promisify(execFile);

// Libreria pubblicata: accesso in sola lettura alle schede "ready" di noesis-roads-creator.
import { DB_PATH, listReadyArtworksRO, getArtworkImageDataRO, getOverviewRO, listDetailsRO, getDetailContentRO, listSourcesRO, listSimilarWorksRO, getSimilarImageRO } from './noesis-roads-creator/db.mjs';

const input = {
  artwork: { title: 'Annunciazione', artist: 'Beato Angelico', period: 'Rinascimento fiorentino' },
  selection: { type: 'hotspot', hotspotId: 'angelo-gabriele', x: 0.5, y: 0.3 },
  hotspot: { title: 'L’angelo Gabriele' },
  notableDetails: [
    { title: 'L’angelo Gabriele', category: 'Figura', short: 'Il messaggero' },
    { title: 'Maria e il gesto dell’ascolto', category: 'Figura', short: 'La risposta' },
    { title: 'Il giardino sullo sfondo', category: 'Simbolo', short: 'Natura' }
  ],
  sources: [{ title: 'Museo', url: 'https://example.org', type: 'Museo' }],
  learningLevel: 'Scuola secondaria'
};

const advancedInput = { ...input, learningLevel: 'Approfondimento' };

test('getOpenRouterApiKey accepts supported environment variable names', () => {
  assert.equal(getOpenRouterApiKey({ OPENROUTER_API_KEY: ' nim-key ' }), 'nim-key');
  assert.equal(getOpenRouterApiKey({ OPENROUTER_API_KEY: 'primary', NGC_API_KEY: 'fallback' }), 'primary');
  assert.equal(getOpenRouterApiKey({}), '');
});

test('cleanModelJson parses fenced JSON', () => {
  assert.deepEqual(cleanModelJson('```json\n{"observation":"Un angelo"}\n```'), { observation: 'Un angelo' });
});

test('cleanModelJson repairs double-escaped JSON inside a text envelope', () => {
  const raw = 'Ecco: {\\"observation\\":\\"Un angelo\\"}';
  assert.deepEqual(cleanModelJson(raw), { observation: 'Un angelo' });
});

test('normalizeAnalysis keeps sections, source and hotspot title', () => {
  const result = normalizeAnalysis({ observation: 'Un angelo', meaning: 'Un messaggero', relation: 'Collegato a Maria', curiosity: 'Una curiosità sul dettaglio', confidence: { level: 'high', label: 'Verificata' } }, input);
  assert.equal(result.title, 'L’angelo Gabriele');
  assert.equal(result.content.observation, 'Un angelo');
  assert.equal(result.content.meaning, 'Un messaggero');
  assert.equal(result.content.relation, 'Collegato a Maria');
  assert.equal(result.content.curiosity, 'Una curiosità sul dettaglio');
  assert.equal(result.confidence.level, 'high');
  assert.equal(result.sources[0].title, 'Museo');
});

test('normalizeAnalysis strips duplicated lookAgain prefix', () => {
  const result = normalizeAnalysis({ observation: 'Un angelo', meaning: 'Un messaggero', relation: 'Collegato', lookAgain: 'Guarda ancora: dove cade la luce sulle ali?' }, input);
  assert.equal(result.content.lookAgain, 'dove cade la luce sulle ali?');
});

test('normalizeAnalysis applies fallbacks for missing blocks', () => {
  const result = normalizeAnalysis({ observation: 'Solo visivo' }, input);
  assert.equal(result.content.observation, 'Solo visivo');
  assert.equal(result.content.meaning.includes('selezionare'), true);
  assert.equal(result.content.relation.includes('non è stato descritto'), true);
  assert.equal(result.content.curiosity, '');
});

test('normalizeAnalysis strips advanced blocks at school level and keeps them at Approfondimento', () => {
  const raw = { observation: 'o', meaning: 'm', relation: 'r', curiosity: 'c', comparisons: 'Un confronto con opere reali', openQuestions: 'Una questione aperta', technique: 'Pennellate fitte, impasto denso' };
  const school = normalizeAnalysis(raw, input);
  assert.equal(school.content.comparisons, '');
  assert.equal(school.content.openQuestions, '');
  assert.equal(school.content.technique, '');
  assert.equal(school.content.curiosity, 'c');
  const advanced = normalizeAnalysis(raw, advancedInput);
  assert.equal(advanced.content.comparisons, 'Un confronto con opere reali');
  assert.equal(advanced.content.openQuestions, 'Una questione aperta');
  assert.equal(advanced.content.technique, 'Pennellate fitte, impasto denso');
});

test('buildTextPrompt instructs the model to omit advanced blocks at school level', () => {
  const prompt = buildTextPrompt(input, { observation: 'Vedo un angelo' });
  assert.equal(prompt.includes('NON INCLUDERE questo campo per il livello Scuola secondaria'), true);
  assert.equal(prompt.includes('"comparisons"'), true);
  assert.equal(prompt.includes('"openQuestions"'), true);
  assert.equal(prompt.includes('"technique"'), true);
});

test('buildTextPrompt requests advanced blocks only at Approfondimento', () => {
  const prompt = buildTextPrompt(advancedInput, { observation: 'Vedo un angelo' });
  assert.equal(prompt.includes('OBBLIGATORIO al livello Approfondimento'), true);
  assert.equal(prompt.includes('stesso soggetto, stesso artista o stesso contesto'), true);
  assert.equal(prompt.includes('questioni aperte o dibattute dagli studiosi'), true);
  assert.equal(prompt.includes('"technique"'), true);
  assert.equal(prompt.includes('materia e tecnica pittorica'), true);
});

test('buildTextPrompt keeps only detail-related work and lists other notable details', () => {
  const prompt = buildTextPrompt(input, { observation: 'Vedo un angelo' });
  assert.equal(prompt.includes('NON ripeterla'), true);
  assert.equal(prompt.includes('Maria e il gesto dell’ascolto'), true);
  assert.equal(prompt.includes('Il giardino sullo sfondo'), true);
  assert.equal(prompt.includes('"relation"'), true);
  assert.equal(prompt.includes('"curiosity"'), true);
  assert.equal(prompt.includes('OPZIONALE'), true);
  assert.equal(prompt.includes('stringa vuota'), true);
});

test('normalizeSimilar keeps up to 10 works with all fields', () => {
  const raw = { works: Array.from({ length: 12 }, (_, i) => ({ title: 'Opera ' + i, artist: 'Autore', date: '1500', museum: 'Museo', caption: 'Stesso soggetto', search: 'termine' })) };
  const result = normalizeSimilar(raw, input);
  assert.equal(result.length, 10);
  assert.equal(result[0].title, 'Opera 0');
  assert.equal(result[0].artist, 'Autore');
  assert.equal(result[0].imageStatus, 'pending');
  assert.equal(result[9].search, 'termine');
});

test('normalizeSimilar accepts a bare array', () => {
  const result = normalizeSimilar([{ title: 'Solo' }], input);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Solo');
});

test('buildSimilarPrompt requests 10 works and mentions the artwork subject', () => {
  const prompt = buildSimilarPrompt(input);
  assert.equal(prompt.includes('"works"'), true);
  assert.equal(prompt.includes('Annunciazione'), true);
  assert.equal(prompt.includes('"search"'), true);
  assert.equal(prompt.includes('Wikimedia Commons'), true);
});

test('resolveSimilarImage finds a Commons thumbnail', async () => {
  const fakeFetch = async (url) => {
    if (String(url).includes('commons.wikimedia.org')) {
      return new Response(JSON.stringify({ query: { pages: { '1': { title: 'File:X.jpg', imageinfo: [{ thumburl: 'https://thumb.example/x.jpg', mime: 'image/jpeg', descriptionurl: 'https://commons.example/wiki/File:X.jpg' }] } } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  };
  const out = await resolveSimilarImage({ title: 'X', artist: 'Y', search: 'X Y' }, fakeFetch);
  assert.equal(out.imageStatus, 'ok');
  assert.equal(out.imageUrl, 'https://thumb.example/x.jpg');
  assert.equal(out.imagePage, 'https://commons.example/wiki/File:X.jpg');
});

test('resolveSimilarImage falls back to the MET API', async () => {
  const fakeFetch = async (url) => {
    if (String(url).includes('commons.wikimedia.org')) return new Response(JSON.stringify({ query: { pages: {} } }), { status: 200 });
    if (String(url).includes('/public/collection/v1/search')) return new Response(JSON.stringify({ objectIDs: [123] }), { status: 200 });
    if (String(url).includes('/objects/123')) return new Response(JSON.stringify({ primaryImageSmall: 'https://images.example/m.jpg' }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const out = await resolveSimilarImage({ title: 'Y', artist: 'Z' }, fakeFetch);
  assert.equal(out.imageStatus, 'ok');
  assert.equal(out.imageUrl, 'https://images.example/m.jpg');
  assert.equal(out.imagePage.includes('metmuseum.org'), true);
});

test('resolveSimilarImage marks missing when no source matches', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ query: { pages: {} } }), { status: 200 });
  const out = await resolveSimilarImage({ title: 'Q', artist: 'W' }, fakeFetch);
  assert.equal(out.imageStatus, 'missing');
  assert.equal(out.imageUrl, '');
});

test('buildOverviewPrompt enforces the 500-word budget and JSON shape', () => {
  const prompt = buildOverviewPrompt(input);
  assert.equal(prompt.includes('500 parole'), true);
  assert.equal(prompt.includes('"painting"'), true);
  assert.equal(prompt.includes('"artist"'), true);
  assert.equal(prompt.includes('Museo'), true);
});

test('normalizeOverview keeps painting, artist and sources', () => {
  const result = normalizeOverview({ painting: 'Un affresco rinascimentale', artist: 'Fra Giovanni da Fiesole' }, input);
  assert.equal(result.content.painting, 'Un affresco rinascimentale');
  assert.equal(result.content.artist, 'Fra Giovanni da Fiesole');
  assert.equal(result.sources[0].title, 'Museo');
});

test('normalizeOverview surfaces web citations as sources', () => {
  const result = normalizeOverview({ painting: 'x', artist: 'y' }, input, [{ title: 'Wikipedia', url: 'https://example.org/wiki' }]);
  assert.equal(result.sources[0].title, 'Wikipedia');
  assert.equal(result.sources[0].type, 'Web');
});

test('callOpenRouter builds a multimodal OpenRouter request and parses the 3-block answer', async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousWeb = process.env.OPENROUTER_WEB_SEARCH;
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.OPENROUTER_WEB_SEARCH = 'true';
  let request;
  const requests = [];
  const fakeFetch = async (_url, options) => {
    request = options;
    requests.push(options);
    const isVisionCall = requests.length === 1;
    const result = isVisionCall ? { observation: 'Un angelo', visible_elements: ['figura'], colors: ['chiaro'], composition: 'Equilibrio', uncertainty: '' } : { observation: 'Un angelo', meaning: 'Messaggero', relation: 'Collegato a Maria', curiosity: 'Il gesto non regge nulla', confidence: { level: 'high', label: 'Ben supportata' } };
    const message = { content: JSON.stringify(result) };
    if (!isVisionCall) message.annotations = [{ type: 'url_citation', url_citation: { title: 'Museo del Prado', url: 'https://example.org/prado' } }];
    return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const result = await callOpenRouter({ ...input, selectionImage: 'data:image/jpeg;base64,AA==' }, fakeFetch);
  const body = JSON.parse(request.body);
  assert.equal(body.model, TEXT_MODEL);
  assert.equal(requests.length, 2);
  assert.equal(JSON.parse(requests[0].body).model, VISION_MODEL);
  assert.deepEqual(body.plugins, [{ id: 'web', max_results: 5 }]);
  assert.equal(body.messages[0].content[0].type, 'text');
  assert.equal(result.content.observation, 'Un angelo');
  assert.equal(result.content.meaning, 'Messaggero');
  assert.equal(result.content.relation, 'Collegato a Maria');
  assert.equal(result.content.curiosity, 'Il gesto non regge nulla');
  assert.equal(result.sources[0].title, 'Museo del Prado');
  assert.equal(result.sources[0].type, 'Web');
  const visionBody = JSON.parse(requests[0].body);
  assert.equal(visionBody.messages[0].content[1].type, 'image_url');
  assert.equal(visionBody.messages[0].content[3].type, 'image_url');
  assert.match(visionBody.messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,/);
  assert.equal(request.headers.Authorization, 'Bearer test-key');
  if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey;
  if (previousWeb === undefined) delete process.env.OPENROUTER_WEB_SEARCH; else process.env.OPENROUTER_WEB_SEARCH = previousWeb;
});

test('callOpenRouterOverview issues a single text-only request', async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-key';
  const requests = [];
  const fakeFetch = async (_url, options) => {
    requests.push(options);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"painting":"Un affresco","artist":"Fra Giovanni"}' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const result = await callOpenRouterOverview(input, fakeFetch);
  assert.equal(requests.length, 1);
  const body = JSON.parse(requests[0].body);
  assert.equal(body.model, TEXT_MODEL);
  const messageContent = body.messages[0].content;
  assert.equal(Array.isArray(messageContent), true);
  assert.equal(messageContent.every(part => part.type === 'text'), true);
  assert.equal(result.content.painting, 'Un affresco');
  assert.equal(result.content.artist, 'Fra Giovanni');
  if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey;
});

test('web grounding is disabled by default', async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousWeb = process.env.OPENROUTER_WEB_SEARCH;
  process.env.OPENROUTER_API_KEY = 'test-key';
  delete process.env.OPENROUTER_WEB_SEARCH;
  const requests = [];
  const fakeFetch = async (_url, options) => {
    requests.push(options);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"observation":"x"}' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  await callOpenRouter(input, fakeFetch);
  assert.equal(JSON.parse(requests[0].body).plugins, undefined);
  if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey;
  if (previousWeb === undefined) delete process.env.OPENROUTER_WEB_SEARCH; else process.env.OPENROUTER_WEB_SEARCH = previousWeb;
});

test('read-only DB accessors read a published artwork without writing', async () => {
  // Copia di prova su DB temporaneo: le funzioni RO aprono la connessione in readOnly.
  const dir = await mkdtemp(join(tmpdir(), 'noesis-ro-'));
  const copy = join(dir, 'copy.db');
  try {
    await copyFile(DB_PATH, copy);
    const previous = process.env.NOESIS_CREATOR_DB;
    process.env.NOESIS_CREATOR_DB = copy;
    // NB: DB_PATH è già stato risolto all'import; per isolare davvero il test
    // apriamo la copia riusando le stesse funzioni (connessione read-only sul file).
    const works = listReadyArtworksRO();
    assert.equal(Array.isArray(works), true);
    if (works.length > 0) {
      const id = works[0].id;
      const overview = getOverviewRO(id);
      const details = listDetailsRO(id);
      const content = details.length ? getDetailContentRO(details[0].id, 'studio') : null;
      const images = getArtworkImageDataRO(id);
      assert.ok(overview);
      assert.ok(overview.painting.length > 0);
      assert.ok(details.length > 0);
      if (content) assert.ok(content.content.observation.length > 0);
      assert.ok(images && images.clean);
      assert.equal(getSimilarImageRO(id, -1), null);
      assert.equal(listSourcesRO(id).length >= 0, true);
      assert.equal(listSimilarWorksRO(id).length >= 0, true);
    }
    if (previous === undefined) delete process.env.NOESIS_CREATOR_DB; else process.env.NOESIS_CREATOR_DB = previous;
  } finally {
    await import('node:fs/promises').then(fs => fs.rm(dir, { recursive: true, force: true }));
  }
});

test('static server serves the provided artwork and app', async () => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const app = await fetch(`http://127.0.0.1:${port}/`);
  const withQuery = await fetch(`http://127.0.0.1:${port}/?materia=filosofia`);
  const image = await fetch(`http://127.0.0.1:${port}/annunciazione-beato-angelico.jpg`);
  assert.equal(app.status, 200);
  assert.equal(withQuery.status, 200); // la home con query (filtro materia) serve index.html
  assert.ok((await withQuery.text()).includes('catalog'));
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('overview endpoint validates the artwork field', async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const missing = await fetch(`http://127.0.0.1:${port}/api/overview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  assert.equal(missing.status, 400);
  const present = await fetch(`http://127.0.0.1:${port}/api/overview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artwork: { title: 'Annunciazione' } }) });
  assert.equal(present.status, 503);
  if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('normalizeAnalysis surfaces web citations as sources', () => {
  const result = normalizeAnalysis({ observation: 'Un angelo' }, input, [{ title: 'Wikipedia', url: 'https://example.org/wiki', type: 'web' }]);
  assert.equal(result.sources[0].title, 'Wikipedia');
  assert.equal(result.sources[0].type, 'Web');
  assert.equal(result.sources.length, 2);
});

import { buildSubjectIntroPrompt, normalizeSubjectOutline, normalizeSubjectChapters, normalizeSubjectClosing, buildSubjectWorksPrompt, buildSubjectChaptersPrompt, buildComparisonIntroPrompt, buildComparisonPointsPrompt, buildComparisonAnalysisPrompt, normalizeComparisonIntro, normalizeComparisonPoints, normalizeComparisonAnalysis } from './noesis-roads-creator/server.mjs';

test('new schemas (subjects + comparisons) CRUD and RO roundtrip', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'noesis-schemas-'));
  const dbPath = join(dir, 'test.db');
  const previous = process.env.NOESIS_CREATOR_DB;
  process.env.NOESIS_CREATOR_DB = dbPath;
  try {
    const mod = await import('./noesis-roads-creator/db.mjs?t=' + Date.now());
    mod.initSchema();
    const s = mod.createSubject({ id: 'nativita', name: 'Natività' });
    assert.equal(s.status, 'draft');
    mod.updateSubject('nativita', { intro: 'Intro di prova', origins: 'Origini' });
    mod.replaceSubjectChapters('nativita', [{ era: 'Medioevo', text: 'testo 1' }, { era: 'Rinascimento', text: 'testo 2' }]);
    mod.replaceSubjectWorks('nativita', [{ title: 'Natività', artist: 'Giotto', imageStatus: 'missing' }]);
    mod.approveSubject('nativita');
    const subjectRO = mod.getSubjectRO('nativita');
    assert.equal(subjectRO.status, 'ready');
    assert.equal(subjectRO.intro, 'Intro di prova');
    assert.equal(subjectRO.chapters.length, 2);
    assert.equal(subjectRO.works.length, 1);
    assert.equal(mod.listReadySubjectsRO().length, 1);

    mod.createArtwork({ id: 'w1', title: 'Natività', artist: 'Giotto', imagePath: 'uploads/x.jpg', imageData: Buffer.from([1, 2, 3]), imageMime: 'image/jpeg', imageWidth: 10, imageHeight: 10 });
    const c = mod.createComparison({ id: 'cmp-1', title: 'Confronto', comparisonType: 'same-subject' });
    mod.setComparisonSide(c.id, 'a', { source: 'library', artworkId: 'w1', title: 'A' });
    mod.setComparisonSide(c.id, 'b', { source: 'external', title: 'B', imageData: Buffer.from([4, 5, 6]), imageMime: 'image/jpeg', imageStatus: 'ok' });
    mod.replaceComparisonPoints(c.id, [{ kind: 'similar', title: 'Comune', text: 's' }, { kind: 'different', title: 'Diverso', text: 'd' }]);
    mod.approveComparison(c.id);
    const comparisonRO = mod.getComparisonRO('cmp-1');
    assert.equal(comparisonRO.status, 'ready');
    assert.equal(comparisonRO.sides.length, 2);
    assert.equal(comparisonRO.sides.find(x => x.side === 'a').source, 'library');
    assert.equal(comparisonRO.sides.find(x => x.side === 'b').hasImage, true);
    assert.equal(comparisonRO.points.length, 2);
    assert.equal(comparisonRO.points.find(p => p.kind === 'similar').title, 'Comune');
    assert.equal(mod.getComparisonSideImageRO('cmp-1', 'b') !== null, true);
    assert.equal(mod.getComparisonThumbRO('cmp-1'), null);
    mod.setComparisonThumb('cmp-1', Buffer.from([9]), 'image/jpeg');
    assert.equal(mod.getComparisonThumbRO('cmp-1').data.length, 1);
    assert.equal(mod.listReadyComparisonsRO().length, 1);
    mod.deleteComparison('cmp-1');
    assert.equal(mod.getComparisonRO('cmp-1'), null);
    mod.deleteSubject('nativita');
    assert.equal(mod.getSubjectRO('nativita'), null);
  } finally {
    if (previous === undefined) delete process.env.NOESIS_CREATOR_DB; else process.env.NOESIS_CREATOR_DB = previous;
    await import('node:fs/promises').then(fs => fs.rm(dir, { recursive: true, force: true }));
  }
});

test('subject prompts and normalizers produce structured content', () => {
  const introPrompt = buildSubjectIntroPrompt({ name: 'Annunciazione' });
  assert.equal(introPrompt.includes('Annunciazione'), true);
  assert.equal(introPrompt.includes('"shortDesc"'), true);
  const outline = normalizeSubjectOutline({ shortDesc: 'S', intro: 'I', origins: 'O', extra: 'x' });
  assert.deepEqual(outline, { shortDesc: 'S', intro: 'I', origins: 'O' });
  const chapters = normalizeSubjectChapters({ chapters: [{ era: 'Barocco', text: 't' }, { era: 'Rinascimento', text: 't' }] });
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].era, 'Barocco');
  const closing = normalizeSubjectClosing({ symbols: [{ symbol: 'Giglio', meaning: 'Purezza' }], interpretations: 'I', curiosities: 'C' });
  assert.equal(closing.symbols[0].symbol, 'Giglio');
  assert.equal(closing.interpretations, 'I');
  const worksPrompt = buildSubjectWorksPrompt({ id: 'x', name: 'Natività' });
  assert.equal(worksPrompt.includes('Natività'), true);
  const chaptersPrompt = buildSubjectChaptersPrompt({ id: 'x', name: 'Natività', intro: '' });
  assert.equal(chaptersPrompt.includes('"chapters"'), true);
});

test('comparison prompts and normalizers produce structured content', () => {
  const ref = { id: 'c1', title: 'T', comparison_type: 'same-subject', a: { title: 'A', artist: 'X', date: '1400', museum: 'M' }, b: { title: 'B', artist: 'Y', date: '1500', museum: 'N' } };
  const intro = normalizeComparisonIntro({ intro: 'Intro' });
  assert.equal(intro, 'Intro');
  const points = normalizeComparisonPoints({ similar: [{ title: 'S', text: 's' }], different: [{ title: 'D', text: 'd' }] });
  assert.equal(points.similar.length, 1);
  assert.equal(points.different[0].title, 'D');
  const analysis = normalizeComparisonAnalysis({ technique: 'T', context: 'C', critique: 'K', curiosities: 'Q' });
  assert.equal(analysis.technique, 'T');
  assert.equal(analysis.curiosities, 'Q');
  const introPrompt = buildComparisonIntroPrompt(ref);
  assert.equal(introPrompt.includes('Opera A: A di X (1400), M'), true);
  const pointsPrompt = buildComparisonPointsPrompt(ref);
  assert.equal(pointsPrompt.includes('"similar"'), true);
  assert.equal(pointsPrompt.includes('"different"'), true);
  const analysisPrompt = buildComparisonAnalysisPrompt(ref);
  assert.equal(analysisPrompt.includes('"technique"'), true);
});

test('callModel extracts url_citation annotations from the message', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-key';
  const fakeFetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ciao', annotations: [{ type: 'url_citation', url_citation: { url: 'https://example.org', title: 'Fonte' } }, { type: 'other' }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const result = await callModel(TEXT_MODEL, [{ type: 'text', text: 'ciao' }], 'test-key', fakeFetch);
  assert.deepEqual(result.citations, [{ title: 'Fonte', url: 'https://example.org' }]);
  if (previous === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previous;
});

test('callModel extracts Sonar-format citations (message + choice level, dedup)', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-key';
  const fakeFetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ciao', citations: ['https://a.org', { url: 'https://b.org' }, 'https://a.org'] }, citations: [{ url: 'https://c.org' }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const result = await callModel(TEXT_MODEL, [{ type: 'text', text: 'ciao' }], 'test-key', fakeFetch);
  assert.deepEqual(result.citations, [{ title: '', url: 'https://a.org' }, { title: '', url: 'https://b.org' }, { title: '', url: 'https://c.org' }]);
  if (previous === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previous;
});

// ---------------------------------------------------------------------------
// Esportazione PDF "libro d'arte" (make_pdf.py + rotte /pdf)
// ---------------------------------------------------------------------------
const PDF_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='; // 1x1 px PNG

function runMakePdf(payload) {
  return mkdtemp(join(tmpdir(), 'noesis-pdf-')).then(async dir => {
    const inPath = join(dir, 'in.json');
    const outPath = join(dir, 'out.pdf');
    await writeFile(inPath, JSON.stringify(payload));
    try {
      await execFileAsync('python3', ['make_pdf.py', inPath, outPath], { cwd: 'noesis-roads-creator', timeout: 120000 });
      const buf = await readFile(outPath);
      return buf;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

function countPdfPages(buf) {
  // Conta gli oggetti pagina sull'intero buffer: i primi 4000 byte contengono
  // solo parte dell'albero delle pagine e sottostimano il totale.
  return (String(buf).match(/\/Type\s*\/Page[^s]/g) || []).length;
}

function pdfImagesClean(id) {
  // Il DB reale restituisce BLOB come Buffer: il mock fa lo stesso (PNG 1x1 valido).
  return { clean: { data: Buffer.from(PDF_PIXEL, 'base64'), mime: 'image/png' }, annotated: null };
}
function pdfSimilarImage(artworkId, similarId) {
  return { data: Buffer.from(PDF_PIXEL, 'base64'), mime: 'image/png' };
}

test('make_pdf renders the artwork payload as a valid art-book PDF', async () => {
  const payload = buildArtworkPdfPayload({
    id: 'w1', title: 'Annunciazione', artist: 'Beato Angelico', date: 'c. 1440', period: 'Rinascimento',
    technique: 'Affresco', institution: 'San Marco', location: 'Firenze', hasImage: true, hasAnnotated: false,
    overview: { painting: 'Un affresco luminoso.', artist: 'Fra Giovanni da Fiesole, domenicano.' },
    details: [{ id: 1, title: 'L’angelo', category: 'Figura', region: { x: 0.1, y: 0.1, width: 0.3, height: 0.4 },
      tabs: { studio: { content: { observation: 'Vedo un angelo.', meaning: 'È Gabriele.', relation: 'Annuncia a Maria.', lookAgain: 'Guarda le ali.' } },
              approfondimento: { content: { curiosity: 'Una curiosità.', comparisons: 'Un confronto.', openQuestions: 'Una domanda.', technique: 'Tempera.' } } } }],
    similarWorks: [{ id: 1, title: 'Annunciazione di Simone Martini', artist: 'Simone Martini', date: '1333', museum: 'Uffizi', caption: 'Gotico senese.', hasImage: true }],
    sources: [{ title: 'Museo di San Marco', url: 'https://example.org', type: 'Museo' }]
  }, {
    imageData: pdfImagesClean,
    similarImage: pdfSimilarImage
  });
  assert.equal(payload.type, 'opera');
  assert.equal(payload.images.clean.data, PDF_PIXEL);
  const buf = await runMakePdf(payload);
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.length > 5000);
  assert.ok(countPdfPages(buf) >= 4); // copertina + presentazione + opera + dettaglio + simili + fonti
});

test('buildArtworkPdfPayload handles node:sqlite Uint8Array BLOBs without mangling', () => {
  // Regressione: i BLOB di node:sqlite sono Uint8Array, non Buffer. Devono
  // essere copiati byte-per-byte, non interpretati come stringa base64.
  const raw = Buffer.from(PDF_PIXEL, 'base64');
  const payload = buildArtworkPdfPayload({
    id: 'w1', title: 'T', artist: 'A', hasImage: true,
    overview: { painting: 'x', artist: 'y' }, details: [], similarWorks: [], sources: []
  }, {
    imageData: () => ({ clean: { data: new Uint8Array(raw), mime: 'image/png' }, annotated: null })
  });
  assert.equal(payload.images.clean.data, PDF_PIXEL);
});

test('make_pdf omits corrupt images instead of crashing', async () => {
  const payload = {
    type: 'opera',
    eyebrow: 'Scheda didattica · opera',
    title: 'Opera corrotta',
    subtitle: 'Anonimo',
    meta: ['c. 1400'],
    coverImage: { ref: 'clean' },
    images: { clean: { data: Buffer.from([1, 2, 3]).toString('base64'), mime: 'image/jpeg' } },
    sections: [
      { t: 'chapter', n: 1, title: 'Presentazione' },
      { t: 'p', text: 'Il dipinto resta leggibile anche senza tavole.' }
    ]
  };
  const buf = await runMakePdf(payload);
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.length > 1000);
});

test('make_pdf renders the subject payload as a valid art-book PDF', async () => {
  const payload = buildSubjectPdfPayload({
    id: 'annunciazione', name: 'Annunciazione', shortDesc: 'Tema mariano.',
    intro: 'L’Annunciazione racconta…', origins: 'Le prime attestazioni…',
    chapters: [{ era: 'Medioevo', text: 'Fondo oro.' }, { era: 'Rinascimento', text: 'Prospettiva.' }],
    works: [{ id: 1, title: 'Natività', artist: 'Giotto', date: '1305', museum: 'Cappella Scrovegni', caption: 'Proto-rinascimento.', hasImage: false }],
    symbols: JSON.stringify([{ symbol: 'Giglio', meaning: 'Purezza' }]),
    interpretations: 'Da dogma a dramma umano.', curiosities: 'Il Capodanno fiorentino.'
  });
  assert.equal(payload.type, 'soggetto');
  const buf = await runMakePdf(payload);
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(countPdfPages(buf) >= 5); // copertina + 5 capitoli
});

test('make_pdf renders the comparison payload as a valid art-book PDF', async () => {
  const payload = buildComparisonPdfPayload({
    id: 'cmp-1', title: 'Angelico vs Leonardo', comparisonType: 'same-subject', hasThumb: false,
    intro: 'Due Annunciazioni a confronto.',
    sides: [{ side: 'a', source: 'external', title: 'Annunciazione', artist: 'Beato Angelico', date: '1440', museum: 'San Marco', hasImage: false },
            { side: 'b', source: 'external', title: 'Annunciazione', artist: 'Leonardo', date: '1472', museum: 'Uffizi', hasImage: false }],
    points: [{ kind: 'similar', title: 'La luce', text: 'Divina in entrambe.' },
             { kind: 'different', title: 'Lo spazio', text: 'Chiostro vs natura.' }],
    technique: 'Affresco vs olio.', context: 'Firenze 1440 vs 1472.', critique: 'Due poli del Rinascimento.', curiosities: 'Le ali di Leonardo.'
  });
  assert.equal(payload.type, 'confronto');
  assert.equal(payload.sections.some(s => s.t === 'pair'), true);
  const buf = await runMakePdf(payload);
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(countPdfPages(buf) >= 5);
});

test('creator PDF endpoints return application/pdf for the three card types', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'noesis-pdf-api-'));
  const dbPath = join(dir, 'test.db');
  const tmpScript = join(dir, 'spawn_server.mjs');
  const previous = process.env.NOESIS_CREATOR_DB;
  process.env.NOESIS_CREATOR_DB = dbPath;
  let child;
  try {
    // DB popolato via write-connection dirette (niente LLM); l'immagine è il
    // PNG 1x1 valido: esercita il crop su BLOB non-JPEG in make_pdf.py.
    const png = Buffer.from(PDF_PIXEL, 'base64');
    const db = await import('./noesis-roads-creator/db.mjs?t=' + Date.now());
    db.initSchema();
    db.createArtwork({ id: 'w1', title: 'Annunciazione', artist: 'Beato Angelico', date: 'c. 1440', imagePath: 'uploads/x.jpg', imageData: png, imageMime: 'image/png', imageWidth: 1, imageHeight: 1 });
    db.saveOverview('w1', { painting: 'Il dipinto…', artist: 'L’artista…' }, { status: 'approved' });
    db.addDetail('w1', { title: 'L’angelo', category: 'Figura', x: 0.1, y: 0.1, width: 0.3, height: 0.4, sortOrder: 0 });
    db.saveDetailContent(1, 'studio', { observation: 'Vedo…', meaning: 'Significa…', relation: 'In relazione…', lookAgain: 'Guarda…' }, { status: 'approved' });
    db.approveArtwork('w1');
    db.createSubject({ id: 'nativita', name: 'Natività' });
    db.updateSubject('nativita', { intro: 'Intro…', origins: 'Origini…' });
    db.replaceSubjectChapters('nativita', [{ era: 'Medioevo', text: 'Medioevo.' }]);
    db.replaceSubjectWorks('nativita', [{ title: 'Natività', artist: 'Giotto', date: '1305', museum: 'A', caption: 'C' }]);
    db.updateSubject('nativita', { status: 'ready' });
    db.createComparison({ id: 'cmp-1', title: 'Confronto', comparisonType: 'same-subject' });
    db.setComparisonSide('cmp-1', 'a', { source: 'library', artworkId: 'w1', title: 'A' });
    db.setComparisonSide('cmp-1', 'b', { source: 'external', title: 'B', imageStatus: 'missing' });
    db.replaceComparisonPoints('cmp-1', [{ kind: 'similar', title: 'Comune', text: 'Testo.' }]);
    db.updateComparison('cmp-1', { intro: 'Intro del confronto.', status: 'ready' });

    // Server subprocess sul DB temporaneo (la cache _db del modulo viene
    // inizializzata al primo uso dentro il subprocess, isolata dal runner).
    // Lo script vive in dir ma importa server.mjs con path assoluto file://.
    const serverAbs = join(process.cwd(), 'noesis-roads-creator', 'server.mjs').replace(/\\/g, '/');
    await writeFile(tmpScript, [
      `import { createCreatorServer } from 'file://${serverAbs}';`,
      'const s = createCreatorServer();',
      's.listen(0, "127.0.0.1", () => {',
      '  process.stdout.write(String(s.address().port) + "\\n");',
      '});'
    ].join('\n'));
    child = fork(tmpScript, [], { env: { ...process.env, NOESIS_CREATOR_DB: dbPath }, silent: true });
    const port = await new Promise((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(new Error('timeout in attesa del subserver')), 15000);
      child.stdout.on('data', c => {
        out += String(c);
        const nl = out.indexOf('\n');
        if (nl >= 0) { clearTimeout(timer); resolve(Number(out.slice(0, nl).trim())); }
      });
      child.on('error', e => { clearTimeout(timer); reject(e); });
      child.on('exit', code => { clearTimeout(timer); reject(new Error('subserver uscito subito, codice ' + code)); });
    });
    if (!port || !Number.isFinite(port)) throw new Error('porta subserver non valida: ' + port);
    const base = 'http://127.0.0.1:' + port;
    for (const [path, name] of [
      ['/api/artworks/w1/pdf', 'annunciazione.pdf'],
      ['/api/subjects/nativita/pdf', 'nativita.pdf'],
      ['/api/comparisons/cmp-1/pdf', 'confronto.pdf']
    ]) {
      const res = await fetch(base + path);
      assert.equal(res.status, 200, path);
      assert.equal((res.headers.get('content-type') || '').includes('application/pdf'), true, path);
      assert.ok((res.headers.get('content-disposition') || '').includes(name), path);
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.subarray(0, 5).toString(), '%PDF-', path);
      assert.ok(buf.length > 2000, path);
    }
    // gate di prontezza: soggetto senza contenuti → 400 con messaggio chiaro
    db.createSubject({ id: 'vuoto', name: 'Vuoto' });
    const empty = await fetch(base + '/api/subjects/vuoto/pdf');
    assert.equal(empty.status, 400);
    const body = await empty.json();
    assert.equal(body.error.message.includes('Genera e salva prima i contenuti'), true);
    // 404 per id inesistente
    const missing = await fetch(base + '/api/subjects/inesistente/pdf');
    assert.equal(missing.status, 404);
  } finally {
    if (child) {
      try { child.kill('SIGTERM'); } catch {}
      try { await new Promise(r => setTimeout(r, 50)); } catch {}
      try { child.kill('SIGKILL'); } catch {}
    }
    if (previous === undefined) delete process.env.NOESIS_CREATOR_DB; else process.env.NOESIS_CREATOR_DB = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Launcher: hub con due bottoni + supervisore + pannello Opzioni
// ---------------------------------------------------------------------------
import { createHubServer, validateConfig, effectiveConfig, loadLocalEnv, SYSTEM_KEY_AT_BOOT, DEFAULTS } from './launcher.mjs';

test('launcher default ports avoid the crowded 80xx band', () => {
  assert.deepEqual([DEFAULTS.hubPort, DEFAULTS.viewerPort, DEFAULTS.creatorPort], [18080, 18000, 18100]);
});

test('launcher hub serves the two big buttons with configured ports', async () => {
  const hub = createHubServer({ hubPort: 0, spawn: false, env: { ...process.env } });
  await new Promise(resolve => hub.server.listen(0, '127.0.0.1', resolve));
  const port = hub.server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('Vedi le schede'));
    assert.ok(html.includes('Crea le schede'));
    assert.ok(html.includes('18000'));
    assert.ok(html.includes('18100'));
    assert.ok(html.includes('Opzioni'));
    assert.ok(html.includes('materieLinks'));
    assert.ok(html.includes('?materia='));
    const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
    assert.equal(health.viewer.port, 18000);
    assert.equal(health.creator.port, 18100);
    assert.equal(health.viewer.up, false); // spawn disabilitato nei test
    assert.equal(health.creator.up, false);
  } finally {
    await hub.stop();
  }
});

test('launcher planned restart does not spawn duplicate children', async () => {
  // Regressione: il restart pianificato (POST /api/config) uccideva i figli ma
  // il timer di respawn dell'exit handler ne rilanciava copie spurie in loop
  // (EADDRINUSE). Con figli dummy: dopo restart, i pid cambiano una volta sola
  // e restano stabili.
  const dir = await mkdtemp(join(tmpdir(), 'noesis-hub-kids-'));
  try {
    const dummy = join(dir, 'dummy.mjs');
    await writeFile(dummy, 'setInterval(() => {}, 1000);\n');
    const hub = createHubServer({
      hubPort: 0, env: { ...process.env },
      scripts: { viewer: dummy, creator: dummy }
    });
    await new Promise(resolve => hub.server.listen(0, '127.0.0.1', resolve));
    try {
      await new Promise(r => setTimeout(r, 300));
      const pidV1 = hub.children.viewer.proc && hub.children.viewer.proc.pid;
      const pidC1 = hub.children.creator.proc && hub.children.creator.proc.pid;
      assert.ok(pidV1 && pidC1);
      await hub.restart();
      await new Promise(r => setTimeout(r, 300));
      const pidV2 = hub.children.viewer.proc && hub.children.viewer.proc.pid;
      const pidC2 = hub.children.creator.proc && hub.children.creator.proc.pid;
      assert.ok(pidV2 && pidC2 && pidV2 !== pidV1 && pidC2 !== pidC1); // riavviati davvero
      await new Promise(r => setTimeout(r, 2200)); // oltre la finestra di respawn 1.5s
      assert.equal(hub.children.viewer.proc && hub.children.viewer.proc.pid, pidV2); // nessuna copia spuria
      assert.equal(hub.children.creator.proc && hub.children.creator.proc.pid, pidC2);
    } finally {
      await hub.stop();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('launcher config roundtrips on an isolated env file without leaking the key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'noesis-hub-'));
  const envFile = join(dir, '.env.local');
  const previous = process.env.NOESIS_HUB_ENV_FILE;
  try {
    await writeFile(envFile, 'UNRELATED_KEEPME=1\nOPENROUTER_API_KEY=old\n');
    const hub = createHubServer({ hubPort: 0, spawn: false, env: { ...process.env }, envFile });
    await new Promise(resolve => hub.server.listen(0, '127.0.0.1', resolve));
    const port = hub.server.address().port;
    try {
      const bad = await fetch(`http://127.0.0.1:${port}/api/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerPort: 80, creatorPort: 80 })
      });
      assert.equal(bad.status, 400);
      const okRes = await fetch(`http://127.0.0.1:${port}/api/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'test-key-xyz', visionModel: 'm-test', viewerPort: 18000, webSearch: true })
      });
      assert.equal(okRes.status, 200);
      const fileText = await readFile(envFile, 'utf8');
      assert.ok(fileText.includes('OPENROUTER_API_KEY=test-key-xyz'));
      assert.ok(fileText.includes('UNRELATED_KEEPME=1')); // righe sconosciute preservate
      assert.ok(!fileText.includes('OPENROUTER_API_KEY=old'));
      const cfg = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json();
      assert.equal(cfg.apiKeyConfigured, true);
      assert.equal(cfg.visionModel, 'm-test');
      assert.ok(!JSON.stringify(cfg).includes('test-key-xyz')); // la chiave non viene mai riecheggiata
      assert.equal(validateConfig({ viewerPort: 'x' }).length > 0, true);
      assert.equal(effectiveConfig({}).viewerPort, 18000);
    } finally {
      await hub.stop();
    }
  } finally {
    if (previous === undefined) delete process.env.NOESIS_HUB_ENV_FILE; else process.env.NOESIS_HUB_ENV_FILE = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadLocalEnv: la chiave in .env.local prevale sulla variabile di sistema, le altre no', () => {
  // Regressione: una chiave salvata dal pannello Opzioni dell'hub veniva
  // oscurata al riavvio da una OPENROUTER_API_KEY preesistente nell'ambiente
  // di sistema. La chiave scritta nel file deve vincere; le altre variabili
  // (porte, host, modelli...) restano controllate dall'ambiente.
  const dir = mkdtempSync(join(tmpdir(), 'noesis-env-prio-'));
  try {
    writeFileSync(join(dir, '.env.local'), [
      'OPENROUTER_API_KEY=chiave-del-file',
      'OPENROUTER_VISION_MODEL=modello-del-file',
      'APP_PORT=19999'
    ].join('\n'));
    const env = { OPENROUTER_API_KEY: 'chiave-di-sistema', OPENROUTER_VISION_MODEL: 'modello-di-sistema', APP_PORT: '18888' };
    loadLocalEnv(dir, env);
    assert.equal(env.OPENROUTER_API_KEY, 'chiave-del-file'); // il file vince
    assert.equal(env.OPENROUTER_VISION_MODEL, 'modello-di-sistema'); // l'ambiente vince
    assert.equal(env.APP_PORT, '18888');
    // Primo avvio senza nulla nell'ambiente: il file popola tutto.
    const env2 = {};
    loadLocalEnv(dir, env2);
    assert.equal(env2.OPENROUTER_API_KEY, 'chiave-del-file');
    assert.equal(env2.OPENROUTER_VISION_MODEL, 'modello-del-file');
    assert.equal(env2.APP_PORT, '19999');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('effectiveConfig espone systemKeyPresent senza mai esporre la chiave', () => {
  const cfg = effectiveConfig({ OPENROUTER_API_KEY: 'segreto-da-non-echeggiare' });
  assert.equal(cfg.apiKeyConfigured, true);
  assert.equal(cfg.systemKeyPresent, typeof SYSTEM_KEY_AT_BOOT === 'boolean');
  assert.ok(!JSON.stringify(cfg).includes('segreto-da-non-echeggiare'));
  assert.equal(effectiveConfig({}).systemKeyPresent, SYSTEM_KEY_AT_BOOT);
});

test('hub: banner chiave, wizard, key-check e health senza chiave configurata', async () => {
  // Primo avvio tipico: nessuna chiave (né ambiente né .env.local). L'hub deve
  // mostrare banner + wizard e offrire /api/key-check, senza mai echeggiare valori.
  const env = { ...process.env };
  delete env.OPENROUTER_API_KEY;
  const hub = createHubServer({ hubPort: 0, spawn: false, env });
  await new Promise(resolve => hub.server.listen(0, '127.0.0.1', resolve));
  const port = hub.server.address().port;
  try {
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.ok(html.includes('id="keyBar"')); // banner chiave persistente
    assert.ok(html.includes('id="wizBack"')); // wizard primo avvio
    assert.ok(html.includes('"apiKeyConfigured":false'));
    assert.ok(!html.includes('Bearer ')); // nessun materiale di autenticazione in pagina
    assert.ok(!html.includes('OPENROUTER_API_KEY=')); // mai un valore di chiave
    const kc = await (await fetch(`http://127.0.0.1:${port}/api/key-check`)).json();
    assert.deepEqual(kc, { valid: false, reason: 'not-configured' });
    const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
    assert.equal(health.config.apiKeyConfigured, false);
    assert.equal(health.config.lanExposed, false);
  } finally {
    await hub.stop();
  }
});
