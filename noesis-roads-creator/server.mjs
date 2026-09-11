// noesis-roads-creator — server HTTP (zero dipendenze) + API CRUD + generazione LLM
import { createServer } from 'node:http';
import { readFile, writeFile, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extname, join, normalize, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSchema, getDb, UPLOAD_DIR, ROOT as APP_ROOT } from './db.mjs';
import {
  createArtwork, getArtwork, listArtworks, updateArtwork, deleteArtwork,
  addDetail, listDetails, getDetail, replaceDetails, updateDetail, deleteDetail, approveDetail,
  saveDetailContent, getDetailContent,
  saveOverview, getOverview,
  addSource, listSources, getFullArtwork, approveArtwork, publishArtwork,
  getArtworkImageData, setAnnotatedImage,
  replaceSimilarWorks, listSimilarWorks, getSimilarImage, updateSimilarWork, clearSimilarImage,
  createSubject, getSubject, listSubjects, updateSubject, deleteSubject, approveSubject,
  replaceSubjectChapters, listSubjectChapters, getFullSubject, replaceSubjectWorks, listSubjectWorks, getSubjectWorkImage,
  createComparison, getComparison, listComparisons, updateComparison, deleteComparison, approveComparison, setComparisonThumb,
  setComparisonSide, listComparisonSides, getComparisonSide, getComparisonSideImage, getComparisonThumb,
  replaceComparisonPoints, listComparisonPoints, getFullComparison,
  // Nucleo generico (Fase 2): materie / modelli / schede-lezione / sezioni / immagini
  listMaterie, getMateria, upsertMateria, updateMateria, deleteMateria, listModelli, getModello,
  upsertModello, updateModello, deleteModello, modelHasCards, seedCore, createScheda, getScheda, getSchedaFull,
  listSchede, updateScheda, deleteScheda, saveSezione, getSezione, approveScheda,
  addImmagine, listImmagini, getImmagine, deleteImmagine
} from './db.mjs';
import { callModel, VISION_MODEL, TEXT_MODEL, getOpenRouterApiKey,
  buildVisionPrompt, buildOverviewPrompt, buildTextPrompt, buildSimilarPrompt,
  normalizeAnalysis, normalizeOverview, normalizeSimilar, resolveSimilarImages } from '../server.mjs';
import { listMaterie as materieRegistry, listModelli as modelliRegistry } from '../core/models.mjs';
import { validateBody, isBodyEmpty, isKnownSectionType } from '../core/sectionTypes.mjs';
import { validateModel } from '../core/modelSpec.mjs';
import { assembleSectionPrompts } from '../core/prompts.mjs';

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.NOESIS_CREATOR_PORT || process.env.ARTEST_CREATOR_PORT || 18100);
const HOST = process.env.APP_HOST || '127.0.0.1';
const PUBLIC_DIR = join(APP_ROOT, 'public');

initSchema();
// Nucleo generico: seed idempotente dal registry dichiarativo (core/models.mjs).
// Le tabelle legacy restano intatte; materie e modelli vengono (ri)allineati a ogni avvio.
seedCore({ materie: materieRegistry(), modelli: materieRegistry().flatMap((m) => modelliRegistry(m.id)) });

// ---------- helpers ----------
function json(res, status, payload) {
  const data = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(data);
}
function err(res, status, message) { json(res, status, { error: { code: 'ERR', message } }); }

function readBody(req, limitMb = 30) {
  return new Promise((resolvePromise, reject) => {
    let body = '';
    let tooLarge = false;
    req.on('data', chunk => { body += chunk; if (Buffer.byteLength(body) > limitMb * 1024 * 1024) tooLarge = true; });
    req.on('end', () => { if (tooLarge) return reject(new Error('Payload troppo grande')); try { resolvePromise(JSON.parse(body)); } catch (e) { reject(new Error('JSON non valido')); } });
    req.on('error', reject);
  });
}

function slugify(text) {
  const base = String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'opera-' + Date.now();
}

async function persistImage(artworkId, imageDataUrl) {
  const match = String(imageDataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('imageDataUrl non valido: atteso data:image/...;base64,...');
  const ext = match[1] === 'image/jpeg' ? '.jpg' : match[1] === 'image/png' ? '.png' : match[1] === 'image/webp' ? '.webp' : '.jpg';
  const filename = artworkId + ext;
  const buf = Buffer.from(match[2], 'base64');
  await writeFile(join(UPLOAD_DIR, filename), buf); // scratch per PIL (crop/annotazione); il DB resta la sorgente
  return { path: 'uploads/' + filename, data: buf, mime: match[1] };
}

function artworkPublic(a) {
  return {
    id: a.id, title: a.title, artist: a.artist, date: a.date, period: a.period,
    technique: a.technique, institution: a.institution, location: a.location,
    imageUrl: '/api/artworks/' + a.id + '/image',
    annotatedImageUrl: a.hasAnnotated ? '/api/artworks/' + a.id + '/image-annotated' : null,
    imageWidth: a.imageWidth, imageHeight: a.imageHeight,
    status: a.status, createdAt: a.createdAt, updatedAt: a.updatedAt
  };
}

async function imageDataUriOf(artwork) {
  const images = getArtworkImageData(artwork.id);
  if (images && images.clean) {
    const buf = Buffer.from(images.clean.data);
    return `data:${images.clean.mime || 'image/jpeg'};base64,` + buf.toString('base64');
  }
  return 'data:image/jpeg;base64,' + (await readFile(join(APP_ROOT, artwork.imagePath))).toString('base64');
}

// ---------- rotte ----------
function handleApi(req, res, urlPath) {
  const method = req.method;
  const parts = urlPath.split('/').filter(Boolean); // es. ['api','artworks',':id','details']

  // GET /api/artworks
  if (method === 'GET' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'artworks') {
    return json(res, 200, { artworks: listArtworks().map(artworkPublic) });
  }

  // GET /api/artworks/:id
  if (method === 'GET' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'artworks') {
    const full = getFullArtwork(parts[2]);
    if (!full) return err(res, 404, 'Opera non trovata');
    full.imageUrl = '/api/artworks/' + full.id + '/image';
    full.annotatedImageUrl = full.hasAnnotated ? '/api/artworks/' + full.id + '/image-annotated' : null;
    return json(res, 200, full);
  }

  // GET /api/artworks/:id/similar — elenco opere simili
  if (method === 'GET' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'artworks' && parts[3] === 'similar') {
    return json(res, 200, { works: listSimilarWorks(parts[2]) });
  }

  // GET /api/artworks/:id/similar/:sid/image — BLOB immagine opera simile
  if (method === 'GET' && parts.length === 6 && parts[0] === 'api' && parts[1] === 'artworks' && parts[3] === 'similar' && parts[5] === 'image') {
    const img = getSimilarImage(parts[2], Number(parts[4]));
    if (!img) return err(res, 404, 'Immagine non disponibile');
    const buf = Buffer.from(img.data);
    res.writeHead(200, { 'Content-Type': img.mime, 'Content-Length': buf.length, 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    return res.end(buf);
  }

  // GET /api/artworks/:id/image | /image-annotated — BLOB dal DB (immagine pulita / annotata)
  if (method === 'GET' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'artworks' &&
      (parts[3] === 'image' || parts[3] === 'image-annotated')) {
    const images = getArtworkImageData(parts[2]);
    const img = parts[3] === 'image' ? (images && images.clean) : (images && images.annotated);
    if (!img) return err(res, 404, 'Immagine non disponibile: ri-carica l’opera o premi “Salva nel database”.');
    const buf = Buffer.from(img.data);
    res.writeHead(200, { 'Content-Type': img.mime, 'Content-Length': buf.length, 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    return res.end(buf);
  }

  // POST /api/artworks  { id?, imageDataUrl, ...metadati }
  if (method === 'POST' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'artworks') {
    return readBody(req).then(async (input) => {
      const artworkId = input.id || slugify(input.title || 'opera');
      if (getArtwork(artworkId)) return err(res, 409, 'Esiste già un’opera con id ' + artworkId);
      if (!input.imageDataUrl) return err(res, 400, 'imageDataUrl obbligatorio');
      const persisted = await persistImage(artworkId, input.imageDataUrl);
      const created = createArtwork({
        id: artworkId,
        title: input.title || '', artist: input.artist || '', date: input.date || '',
        period: input.period || '', technique: input.technique || '',
        institution: input.institution || '', location: input.location || '',
        imagePath: persisted.path, imageData: persisted.data, imageMime: persisted.mime,
        imageWidth: Number(input.imageWidth) || 0, imageHeight: Number(input.imageHeight) || 0
      });
      json(res, 201, { artwork: artworkPublic(created) });
    }).catch(e => err(res, 400, e.message));
  }

  // PATCH /api/artworks/:id  (metadati o status)
  if (method === 'PATCH' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'artworks') {
    return readBody(req).then(async (input) => {
      const updated = updateArtwork(parts[2], input);
      if (!updated) return err(res, 404, 'Opera non trovata');
      json(res, 200, { artwork: artworkPublic(updated) });
    }).catch(e => err(res, 400, e.message));
  }

  // DELETE /api/artworks/:id
  if (method === 'DELETE' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'artworks') {
    const full = getFullArtwork(parts[2]);
    if (!full) return err(res, 404, 'Opera non trovata');
    deleteArtwork(parts[2]);
    const imagePath = full.imagePath;
    return Promise.resolve().then(function () { return unlink(join(APP_ROOT, imagePath)); }).catch(function () {}).then(function () {
      json(res, 200, { ok: true });
    });
  }

  // PUT /api/artworks/:id/details  (sostituisce l'elenco dettagli) — usato dopo la proposta AI
  if (method === 'PUT' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'artworks' && parts[3] === 'details') {
    return readBody(req).then(async (input) => {
      const artwork = getArtwork(parts[2]);
      if (!artwork) return err(res, 404, 'Opera non trovata');
      const items = Array.isArray(input.details) ? input.details : [];
      const saved = replaceDetails(parts[2], items);
      // SUBITO dopo la proposta dei dettagli: rigenera l'immagine annotata
      // (riquadri oro + didascalie numerate) e la salva nel DB come BLOB.
      let annotatedImageUrl = null;
      let annotatedBoxes = 0;
      let annotatedCaptions = 0;
      try {
        const annotated = await renderAnnotated(artwork);
        if (annotated) {
          setAnnotatedImage(parts[2], annotated.data, 'image/jpeg');
          annotatedImageUrl = '/api/artworks/' + parts[2] + '/image-annotated';
          annotatedBoxes = annotated.boxes;
          annotatedCaptions = annotated.captions;
        }
      } catch (e) { console.error('ERR annotate (dopo proposta dettagli):', e); }
      json(res, 200, { details: saved, annotatedImageUrl, annotatedBoxes, annotatedCaptions });
    }).catch(e => err(res, 400, e.message));
  }

  // GET /api/artworks/:id/details
  if (method === 'GET' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'artworks' && parts[3] === 'details') {
    return json(res, 200, { details: listDetails(parts[2]) });
  }

  // PATCH /api/details/:id — aggiorna regione (e titolo/categoria) di un dettaglio;
  // se cambia la regione rigenera subito l'immagine annotata (riquadri + didascalie) nel DB.
  if (method === 'PATCH' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'details') {
    return readBody(req).then(async (input) => {
      const detailId = Number(parts[2]);
      const detail = getDetail(detailId);
      if (!detail) return err(res, 404, 'Dettaglio non trovato');
      const patch = {};
      if (input.title !== undefined) patch.title = String(input.title).slice(0, 120);
      if (input.category !== undefined) patch.category = String(input.category).slice(0, 80);
      const region = (input && typeof input === 'object' && input.region && typeof input.region === 'object') ? input.region : (input || {});
      let regionChanged = false;
      for (const k of ['x', 'y', 'width', 'height']) {
        if (region[k] !== undefined && region[k] !== null && region[k] !== '') {
          const v = Number(region[k]);
          if (!Number.isFinite(v)) throw new Error('Coordinata ' + k + ' non valida');
          patch[k] = v;
          regionChanged = true;
        }
      }
      if (regionChanged) {
        const orig = detail.region;
        let x = patch.x !== undefined ? patch.x : orig.x;
        let y = patch.y !== undefined ? patch.y : orig.y;
        let w = patch.width !== undefined ? patch.width : orig.width;
        let h = patch.height !== undefined ? patch.height : orig.height;
        x = Math.max(0, Math.min(1 - 0.03, x));
        y = Math.max(0, Math.min(1 - 0.03, y));
        w = Math.max(0.03, Math.min(1 - x, w));
        h = Math.max(0.03, Math.min(1 - y, h));
        x = Math.max(0, Math.min(1 - w, x));
        y = Math.max(0, Math.min(1 - h, y));
        Object.assign(patch, { x, y, width: w, height: h });
      }
      const saved = updateDetail(detailId, patch);
      let annotated = null;
      if (regionChanged) {
        try {
          const artwork = getArtwork(detail.artworkId);
          const ann = await renderAnnotated(artwork);
          if (ann) {
            setAnnotatedImage(detail.artworkId, ann.data, 'image/jpeg');
            annotated = { url: '/api/artworks/' + detail.artworkId + '/image-annotated', boxes: ann.boxes, captions: ann.captions };
          }
        } catch (e) { console.error('ERR annotate (PATCH dettaglio):', e); }
      }
      json(res, 200, { detail: saved, annotated });
    }).catch(e => err(res, 400, e.message));
  }

  // POST /api/artworks/:id/generate/overview  — genera testo opera+artista
  if (method === 'POST' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'artworks' && parts[3] === 'generate' && parts[4] === 'overview') {
    return readBody(req).then(async () => {
      const artwork = getArtwork(parts[2]);
      if (!artwork) return err(res, 404, 'Opera non trovata');
      const apiKey = getOpenRouterApiKey();
      if (!apiKey) return err(res, 503, 'OPENROUTER_API_KEY non configurata');
      const input = {
        artwork: artwork,
        learningLevel: 'Approfondimento',
        sources: listSources(artwork.id)
      };
      const raw = await callModel(TEXT_MODEL, [{ type: 'text', text: buildOverviewPrompt(input) }], apiKey);
      const normalized = normalizeOverview(raw.data, input, raw.citations);
      saveOverview(artwork.id, normalized.content, { status: 'generated', model: TEXT_MODEL, promptVersion: 'artest-creator-1' });
      const overview = getOverview(artwork.id);
      json(res, 200, { overview });
    }).catch(e => { console.error('ERR overview:', e); err(res, 500, e.message); });
  }

  // POST /api/artworks/:id/generate/similar — 10 opere con lo stesso soggetto + immagini (Commons/MET, BLOB)
  if (method === 'POST' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'artworks' && parts[3] === 'generate' && parts[4] === 'similar') {
    return readBody(req).then(async () => {
      const artwork = getArtwork(parts[2]);
      if (!artwork) return err(res, 404, 'Opera non trovata');
      const apiKey = getOpenRouterApiKey();
      if (!apiKey) return err(res, 503, 'OPENROUTER_API_KEY non configurata');
      const input = { artwork, learningLevel: 'Approfondimento', sources: listSources(artwork.id) };
      const raw = await callModel(TEXT_MODEL, [{ type: 'text', text: buildSimilarPrompt(input) }], apiKey);
      const works = normalizeSimilar(raw.data, input);
      const resolved = await resolveSimilarImages(works);
      // download di ogni thumbnail -> BLOB nel DB (immagini locali, offline-safe)
      for (const w of resolved) {
        if (w.imageStatus === 'ok' && w.imageUrl) {
          try {
            const resp = await fetch(w.imageUrl, { headers: { 'User-Agent': 'noesis-roads-didattico/1.0 (local)' }, redirect: 'follow' });
            if (resp.ok) {
              const buf = Buffer.from(await resp.arrayBuffer());
              if (buf.length > 0) { w.imageData = buf; w.imageMime = String(resp.headers.get('content-type') || 'image/jpeg').split(';')[0]; }
              else w.imageStatus = 'failed';
            } else w.imageStatus = 'failed';
          } catch { w.imageStatus = 'failed'; }
          await new Promise(r => setTimeout(r, 150));
        }
      }
      const saved = replaceSimilarWorks(artwork.id, resolved);
      json(res, 200, { works: saved });
    }).catch(e => { console.error('ERR genSimilar:', e); err(res, 500, e.message); });
  }

  // PATCH /api/artworks/:id/similar/:sid — revisione utente (campi + URL immagine con re-download)
  if (method === 'PATCH' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'artworks' && parts[3] === 'similar') {
    return readBody(req).then(async (input) => {
      const similarId = Number(parts[4]);
      const patch = {};
      for (const k of ['title', 'artist', 'date', 'museum', 'caption', 'sortOrder']) {
        if (input[k] !== undefined) patch[k] = String(input[k]);
      }
      if (input.sortOrder !== undefined) patch.sortOrder = Number(input.sortOrder);
      let saved = updateSimilarWork(similarId, patch);
      if (input.imageUrl !== undefined) {
        const url = String(input.imageUrl).trim();
        if (url === '') {
          saved = clearSimilarImage(similarId);
        } else {
          saved = updateSimilarWork(similarId, { imageUrl: url, imagePage: input.imagePage !== undefined ? String(input.imagePage) : saved.imagePage });
          try {
            const resp = await fetch(url, { headers: { 'User-Agent': 'noesis-roads-didattico/1.0 (local)' }, redirect: 'follow' });
            if (resp.ok) {
              const buf = Buffer.from(await resp.arrayBuffer());
              if (buf.length > 0) saved = updateSimilarWork(similarId, { imageData: buf, imageMime: String(resp.headers.get('content-type') || 'image/jpeg').split(';')[0], imageStatus: 'ok' });
              else saved = updateSimilarWork(similarId, { imageStatus: 'failed' });
            } else saved = updateSimilarWork(similarId, { imageStatus: 'failed' });
          } catch { saved = updateSimilarWork(similarId, { imageStatus: 'failed' }); }
        }
      }
      json(res, 200, { work: saved });
    }).catch(e => err(res, 400, e.message));
  }

  // POST /api/artworks/:id/generate/meta — riconosce l'opera e propone i metadati
  if (method === 'POST' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'artworks' && parts[3] === 'generate' && parts[4] === 'meta') {
    return readBody(req).then(async () => {
      const artwork = getArtwork(parts[2]);
      if (!artwork) return err(res, 404, 'Opera non trovata');
      const apiKey = getOpenRouterApiKey();
      if (!apiKey) return err(res, 503, 'OPENROUTER_API_KEY non configurata');
      const imageDataUrl = await imageDataUriOf(artwork);
      const meta = await recognizeArtwork(imageDataUrl, apiKey);
      json(res, 200, { meta });
    }).catch(e => { console.error('ERR meta:', e); err(res, 500, e.message); });
  }

  // POST /api/artworks/:id/generate/details — propone i dettagli notevoli dall'immagine intera
  if (method === 'POST' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'artworks' && parts[3] === 'generate' && parts[4] === 'details') {
    return readBody(req).then(async () => {
      const artwork = getArtwork(parts[2]);
      if (!artwork) return err(res, 404, 'Opera non trovata');
      const apiKey = getOpenRouterApiKey();
      if (!apiKey) return err(res, 503, 'OPENROUTER_API_KEY non configurata');
      const imageDataUrl = await imageDataUriOf(artwork);
      const proposal = await proposeDetails(imageDataUrl, artwork, apiKey);
      json(res, 200, { details: proposal });
    }).catch(e => { console.error('ERR details:', e); err(res, 500, e.message); });
  }

  // POST /api/details/:id/generate/:tab|both — una tab singola, oppure ENTRAMBE in parallelo
  // con UNA sola chiamata di visione condivisa (le due tab analizzano lo stesso crop).
  if (method === 'POST' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'details' && parts[3] === 'generate' &&
      (parts[4] === 'studio' || parts[4] === 'approfondimento' || parts[4] === 'both')) {
    const detailId = Number(parts[2]);
    const mode = parts[4];
    return readBody(req).then(async (input) => {
      const detail = getDetail(detailId);
      if (!detail) return err(res, 404, 'Dettaglio non trovato');
      const artwork = getArtwork(detail.artworkId);
      const apiKey = getOpenRouterApiKey();
      if (!apiKey) return err(res, 503, 'OPENROUTER_API_KEY non configurata');
      const fullImage = await imageDataUriOf(artwork);
      const runTab = async (tab, sharedVisionData) => {
        const level = tab === 'approfondimento' ? 'Approfondimento' : 'Scuola secondaria';
        const result = await analyzeDetail({ artwork, detail, selectionImage: input.selectionImage || null, fullImage, level, apiKey, sharedVisionData });
        saveDetailContent(detailId, tab, result.content, { status: 'generated', model: TEXT_MODEL, promptVersion: 'artest-creator-3' });
        return getDetailContent(detailId, tab);
      };
      if (mode === 'both') {
        const vision = await callModel(VISION_MODEL, visionContentParts(artwork, detail, input.selectionImage || null, fullImage), apiKey);
        const [studioRow, approfondimentoRow] = await Promise.all([
          runTab('studio', vision.data),
          runTab('approfondimento', vision.data)
        ]);
        return json(res, 200, { content: { studio: studioRow, approfondimento: approfondimentoRow } });
      }
      const row = await runTab(mode, null);
      return json(res, 200, { content: row });
    }).catch(e => { console.error('ERR genDetail:', e); err(res, 500, e.message); });
  }

  // POST /api/artworks/:id/details/read — lettura di un riquadro disegnato a mano (nessuna scrittura nel DB)
  if (method === 'POST' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'artworks' && parts[3] === 'details' && parts[4] === 'read') {
    return readBody(req).then(async (input) => {
      const artwork = getArtwork(parts[2]);
      if (!artwork) return err(res, 404, 'Opera non trovata');
      const apiKey = getOpenRouterApiKey();
      if (!apiKey) return err(res, 503, 'OPENROUTER_API_KEY non configurata');
      const fullImage = await imageDataUriOf(artwork);
      const reading = await readManualDetail(artwork, input.selectionImage || null, fullImage, apiKey);
      return json(res, 200, { reading });
    }).catch(e => { console.error('ERR manual read:', e); err(res, 500, e.message); });
  }

  // POST /api/artworks/:id/details — aggiunta MANUALE: salva il box disegnato, genera entrambe le tab
  // con la descrizione della lettura condivisa, e aggiorna l'immagine annotata.
  if (method === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'artworks' && parts[3] === 'details') {
    return readBody(req).then(async (input) => {
      const artwork = getArtwork(parts[2]);
      if (!artwork) return err(res, 404, 'Opera non trovata');
      const apiKey = getOpenRouterApiKey();
      if (!apiKey) return err(res, 503, 'OPENROUTER_API_KEY non configurata');
      const region = input.region || {};
      let x = clamp01(region.x), y = clamp01(region.y);
      let width = Math.max(0.03, Math.min(1 - x, Number(region.width) || 0.2));
      let height = Math.max(0.03, Math.min(1 - y, Number(region.height) || 0.2));
      x = Math.max(0, Math.min(1 - width, x));
      y = Math.max(0, Math.min(1 - height, y));
      const detail = addDetail(artwork.id, {
        title: String(input.title || 'Dettaglio manuale').trim().slice(0, 90) || 'Dettaglio manuale',
        category: normalizeCategory(input.category),
        x, y, width, height,
        sortOrder: listDetails(artwork.id).length
      });
      let annotated = null;
      try {
        const ann = await renderAnnotated(artwork);
        if (ann) {
          setAnnotatedImage(artwork.id, ann.data, 'image/jpeg');
          annotated = { url: '/api/artworks/' + artwork.id + '/image-annotated', boxes: ann.boxes, captions: ann.captions };
        }
      } catch (e) { console.error('ERR annotate (nuovo dettaglio):', e); }
      const fullImage = await imageDataUriOf(artwork);
      let vision = null;
      if (input.reading && String(input.reading.description || '').trim()) {
        vision = { description: String(input.reading.description).trim(), category: normalizeCategory(input.reading.category) || detail.category, subjectFound: input.reading.subjectFound === true };
      } else {
        const reading = await readManualDetail(artwork, input.selectionImage || null, fullImage, apiKey);
        vision = { description: reading.description, category: reading.category, subjectFound: reading.subjectFound };
      }
      const runTab = async (tab) => {
        const level = tab === 'approfondimento' ? 'Approfondimento' : 'Scuola secondaria';
        const result = await analyzeDetail({ artwork, detail, selectionImage: input.selectionImage || null, fullImage, level, apiKey, sharedVisionData: vision });
        saveDetailContent(detail.id, tab, result.content, { status: 'generated', model: TEXT_MODEL, promptVersion: 'artest-creator-4-manuale' });
        return getDetailContent(detail.id, tab);
      };
      const [studioRow, approfondimentoRow] = await Promise.all([runTab('studio'), runTab('approfondimento')]);
      return json(res, 200, { detail: getDetail(detail.id), content: { studio: studioRow, approfondimento: approfondimentoRow }, annotated });
    }).catch(e => { console.error('ERR manual add:', e); err(res, 500, e.message); });
  }

  // POST /api/details/:id/approve — "Conserva e memorizza": approva il dettaglio manuale e i suoi contenuti
  if (method === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'details' && parts[3] === 'approve') {
    const detail = getDetail(Number(parts[2]));
    if (!detail) return err(res, 404, 'Dettaglio non trovato');
    return Promise.resolve().then(() => {
      approveDetail(detail.id);
      return json(res, 200, { ok: true, detail: getDetail(detail.id) });
    }).catch(e => err(res, 500, e.message));
  }

  // DELETE /api/details/:id — rimuove un dettaglio manuale (o automatico) e rigenera l'annotata
  if (method === 'DELETE' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'details') {
    const detail = getDetail(Number(parts[2]));
    if (!detail) return err(res, 404, 'Dettaglio non trovato');
    return Promise.resolve().then(async () => {
      const artwork = getArtwork(detail.artworkId);
      deleteDetail(detail.id);
      let annotated = null;
      if (artwork) {
        try {
          const ann = await renderAnnotated(artwork);
          if (ann) {
            setAnnotatedImage(artwork.id, ann.data, 'image/jpeg');
            annotated = { url: '/api/artworks/' + artwork.id + '/image-annotated', boxes: ann.boxes, captions: ann.captions };
          }
        } catch (e) { console.error('ERR annotate (rimozione dettaglio):', e); }
      }
      return json(res, 200, { ok: true, annotated });
    }).catch(e => err(res, 500, e.message));
  }

  // POST /api/artworks/:id/approve — genera l'immagine annotata (riquadri + didascalie) poi approva tutto
  if (method === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'artworks' && parts[3] === 'approve') {
    return Promise.resolve().then(async () => {
      const artwork = getArtwork(parts[2]);
      if (!artwork) return err(res, 404, 'Opera non trovata');
      let warning = null;
      let annotatedBoxes = 0;
      let annotatedCaptions = 0;
      try {
        const annotated = await renderAnnotated(artwork);
        if (annotated) {
          setAnnotatedImage(artwork.id, annotated.data, 'image/jpeg');
          annotatedBoxes = annotated.boxes;
          annotatedCaptions = annotated.captions;
        }
      } catch (e) { warning = 'Immagine annotata non generata: ' + e.message; console.error('ERR annotate:', e); }
      const full = approveArtwork(parts[2]);
      if (!full) return err(res, 404, 'Opera non trovata');
      return json(res, 200, { ok: true, status: full.status, artwork: full, annotatedWarning: warning, annotatedBoxes, annotatedCaptions });
    }).catch(e => err(res, 500, e.message));
  }

  // POST /api/artworks/:id/annotate — (ri)genera da sola l'immagine annotata
  if (method === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'artworks' && parts[3] === 'annotate') {
    return Promise.resolve().then(async () => {
      const artwork = getArtwork(parts[2]);
      if (!artwork) return err(res, 404, 'Opera non trovata');
      const annotated = await renderAnnotated(artwork);
      if (!annotated) return json(res, 200, { ok: false, message: 'Nessun dettaglio: prima proponi i dettagli notevoli' });
      setAnnotatedImage(artwork.id, annotated.data, 'image/jpeg');
      return json(res, 200, { ok: true, annotatedImageUrl: '/api/artworks/' + artwork.id + '/image-annotated', annotatedBoxes: annotated.boxes, annotatedCaptions: annotated.captions });
    }).catch(e => { console.error('ERR annotate:', e); err(res, 500, e.message); });
  }

  // POST /api/artworks/:id/publish — esporta JSON pronto per il viewer
  if (method === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'artworks' && parts[3] === 'publish') {
    const published = publishArtwork(parts[2]);
    if (!published) return err(res, 400, 'Opera non pronta: genera e approva prima i contenuti');
    return json(res, 200, { ok: true, published });
  }

  // GET|HEAD /api/artworks/:id/pdf — PDF "libro d'arte" della scheda opera
  // (HEAD: Node scarta il body ma mantiene le stesse intestazioni del GET,
  //  così Content-Length e Content-Disposition coincidono col download reale)
  if ((method === 'GET' || method === 'HEAD') && parts.length === 4 && parts[0] === 'api' && parts[1] === 'artworks' && parts[3] === 'pdf') {
    const full = getFullArtwork(parts[2]);
    if (!full) return err(res, 404, 'Opera non trovata');
    if (!full.overview && !(full.details || []).length) return err(res, 400, 'Genera e salva prima i contenuti: il PDF esporta la scheda completa.');
    return sendPdf(res, buildArtworkPdfPayload(full), slugify(full.title || 'opera') + '.pdf');
  }

  // PATCH /api/details/:id/content/:tab — salva (approva) il contenuto rivisto dall'utente
  if (method === 'PATCH' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'details' && parts[3] === 'content') {
    const detailId = Number(parts[2]);
    const tab = parts[4];
    if (tab !== 'studio' && tab !== 'approfondimento') return err(res, 404, 'Tab non valida');
    return readBody(req).then(async (input) => {
      const existing = getDetailContent(detailId, tab);
      if (!existing) return err(res, 404, 'Contenuto non trovato');
      const merged = {};
      for (const key of ['observation', 'meaning', 'relation', 'curiosity', 'comparisons', 'openQuestions', 'technique', 'lookAgain']) {
        merged[key] = input[key] !== undefined ? String(input[key]) : existing.content[key];
      }
      saveDetailContent(detailId, tab, merged, { status: input.status || existing.status, model: existing.model, promptVersion: existing.promptVersion });
      json(res, 200, { content: getDetailContent(detailId, tab) });
    }).catch(e => err(res, 400, e.message));
  }

  // ================= Schede SOGGETTO nella storia dell'arte =================
  // GET /api/subjects
  if (method === 'GET' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'subjects') {
    return json(res, 200, { subjects: listSubjects().map(subjectPublic) });
  }
  // POST /api/subjects { name }
  if (method === 'POST' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'subjects') {
    return readBody(req).then((input) => {
      const name = String(input.name || '').trim();
      if (!name) return err(res, 400, 'Il nome del soggetto è obbligatorio');
      const id = input.id || slugify(name);
      if (getSubject(id)) return err(res, 409, 'Esiste già una scheda soggetto con id ' + id);
      return json(res, 201, { subject: subjectPublic(createSubject({ id, name })) });
    }).catch(e => err(res, 400, e.message));
  }
  // GET /api/subjects/:id  (payload completo: sezioni + capitoli + opere)
  if (method === 'GET' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'subjects') {
    const full = getFullSubject(parts[2]);
    if (!full) return err(res, 404, 'Soggetto non trovato');
    full.works = (full.works || []).map(w => ({
      ...w,
      imageUrl: w.hasImage ? '/api/subjects/' + parts[2] + '/works/' + w.id + '/image' : (w.imageUrl || '')
    }));
    return json(res, 200, full);
  }
  // PATCH /api/subjects/:id  (revisione sezioni; capitoli/opere come array)
  if (method === 'PATCH' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'subjects') {
    return readBody(req).then((input) => {
      const patch = {};
      for (const [k, col] of [['name', 'name'], ['shortDesc', 'short_desc'], ['intro', 'intro'], ['origins', 'origins'], ['symbols', 'symbols'], ['interpretations', 'interpretations'], ['curiosities', 'curiosities'], ['status', 'status']]) {
        if (input[k] !== undefined) patch[col] = String(input[k]);
      }
      const saved = updateSubject(parts[2], patch);
      if (!saved) return err(res, 404, 'Soggetto non trovato');
      if (Array.isArray(input.chapters)) replaceSubjectChapters(parts[2], input.chapters.map(c => ({ era: c.era, text: c.text })));
      if (Array.isArray(input.works)) {
        // Preserva i BLOB delle immagini già scaricate: ogni voce viene aggiornata
        // riusando l'immagine esistente (per id) quando il client non ne fornisce una.
        const existing = listSubjectWorks(parts[2]);
        replaceSubjectWorks(parts[2], input.works.map(w => {
          const old = existing.find(x => String(x.id) === String(w.id));
          let imageData = null, imageMime = 'image/jpeg', imageStatus = 'missing', imageUrl = '', imagePage = '';
          if (old && old.hasImage) {
            const img = getSubjectWorkImage(parts[2], old.id);
            if (img) { imageData = img.data; imageMime = img.mime; imageStatus = 'ok'; }
            imageUrl = old.imageUrl || ''; imagePage = old.imagePage || '';
          }
          return { title: w.title, artist: w.artist, date: w.date, museum: w.museum, caption: w.caption, imageData, imageMime, imageStatus, imageUrl, imagePage };
        }));
      }
      return json(res, 200, getFullSubject(parts[2]));
    }).catch(e => err(res, 400, e.message));
  }
  // DELETE /api/subjects/:id
  if (method === 'DELETE' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'subjects') {
    if (!getSubject(parts[2])) return err(res, 404, 'Soggetto non trovato');
    deleteSubject(parts[2]);
    return json(res, 200, { ok: true });
  }
  // POST /api/subjects/:id/generate/:step  (intro | chapters | works | closing)
  if (method === 'POST' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'subjects' && parts[3] === 'generate' &&
      ['intro', 'chapters', 'works', 'closing'].includes(parts[4])) {
    const subject = getSubject(parts[2]);
    if (!subject) return err(res, 404, 'Soggetto non trovato');
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) return err(res, 503, 'OPENROUTER_API_KEY non configurata');
    const step = parts[4];
    return Promise.resolve().then(async () => {
      if (step === 'intro') {
        const raw = await callModel(TEXT_MODEL, [{ type: 'text', text: buildSubjectIntroPrompt(subject) }], apiKey);
        const d = normalizeSubjectOutline(raw.data);
        updateSubject(subject.id, { short_desc: d.shortDesc, intro: d.intro, origins: d.origins });
        return json(res, 200, { subject: getFullSubject(subject.id) });
      }
      if (step === 'chapters') {
        const raw = await callModel(TEXT_MODEL, [{ type: 'text', text: buildSubjectChaptersPrompt(subject) }], apiKey);
        replaceSubjectChapters(subject.id, normalizeSubjectChapters(raw.data));
        return json(res, 200, { chapters: listSubjectChapters(subject.id) });
      }
      if (step === 'closing') {
        const raw = await callModel(TEXT_MODEL, [{ type: 'text', text: buildSubjectClosingPrompt(subject) }], apiKey);
        const d = normalizeSubjectClosing(raw.data);
        updateSubject(subject.id, { symbols: JSON.stringify(d.symbols || []), interpretations: d.interpretations, curiosities: d.curiosities });
        return json(res, 200, { subject: getFullSubject(subject.id) });
      }
      // step === 'works': 6-10 opere reali con lo stesso soggetto + download immagini
      const raw = await callModel(TEXT_MODEL, [{ type: 'text', text: buildSubjectWorksPrompt(subject) }], apiKey);
      const works = normalizeSimilar(raw.data, {});
      const resolved = await resolveSimilarImages(works);
      for (const w of resolved) {
        if (w.imageStatus === 'ok' && w.imageUrl) {
          try {
            const resp = await fetch(w.imageUrl, { headers: { 'User-Agent': 'noesis-roads-didattico/1.0 (local)' }, redirect: 'follow' });
            if (resp.ok) {
              const buf = Buffer.from(await resp.arrayBuffer());
              if (buf.length > 0) { w.imageData = buf; w.imageMime = String(resp.headers.get('content-type') || 'image/jpeg').split(';')[0]; }
              else w.imageStatus = 'failed';
            } else w.imageStatus = 'failed';
          } catch { w.imageStatus = 'failed'; }
          await new Promise(r => setTimeout(r, 150));
        }
      }
      const saved = replaceSubjectWorks(subject.id, resolved);
      return json(res, 200, { works: saved });
    }).catch(e => { console.error('ERR genSubject:', e); err(res, 500, e.message); });
  }
  // POST /api/subjects/:id/approve
  if (method === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'subjects' && parts[3] === 'approve') {
    if (!getSubject(parts[2])) return err(res, 404, 'Soggetto non trovato');
    approveSubject(parts[2]);
    return json(res, 200, { ok: true, status: 'ready', subject: getFullSubject(parts[2]) });
  }
  // GET /api/subjects/:id/works/:wid/image — BLOB opera rappresentativa
  if (method === 'GET' && parts.length === 6 && parts[0] === 'api' && parts[1] === 'subjects' && parts[3] === 'works' && parts[5] === 'image') {
    const img = getSubjectWorkImage(parts[2], Number(parts[4]));
    if (!img) return err(res, 404, 'Immagine non disponibile');
    const buf = Buffer.from(img.data);
    res.writeHead(200, { 'Content-Type': img.mime, 'Content-Length': buf.length, 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    return res.end(buf);
  }
  // GET|HEAD /api/subjects/:id/pdf — PDF "libro d'arte" della scheda soggetto
  if ((method === 'GET' || method === 'HEAD') && parts.length === 4 && parts[0] === 'api' && parts[1] === 'subjects' && parts[3] === 'pdf') {
    const full = getFullSubject(parts[2]);
    if (!full) return err(res, 404, 'Soggetto non trovato');
    if (!full.intro && !full.origins && !(full.chapters || []).length) return err(res, 400, 'Genera e salva prima i contenuti: il PDF esporta la scheda completa.');
    return sendPdf(res, buildSubjectPdfPayload(full), slugify(full.name || 'soggetto') + '.pdf');
  }

  // ================= Schede FACCIA A FACCIA =================
  // GET /api/comparisons
  if (method === 'GET' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'comparisons') {
    return json(res, 200, { comparisons: listComparisons().map(comparisonPublic) });
  }
  // POST /api/comparisons { title?, comparison_type }
  if (method === 'POST' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'comparisons') {
    return readBody(req).then((input) => {
      const id = input.id || ('confronto-' + Date.now().toString(36));
      if (getComparison(id)) return err(res, 409, 'Esiste già un confronto con id ' + id);
      const created = createComparison({ id, title: String(input.title || ''), comparisonType: input.comparison_type === 'same-artist' ? 'same-artist' : 'same-subject' });
      return json(res, 201, { comparison: comparisonPublic(created) });
    }).catch(e => err(res, 400, e.message));
  }
  // GET /api/comparisons/:id  (payload completo, lati arricchiti con metadati/URL immagine)
  if (method === 'GET' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'comparisons') {
    const full = getFullComparison(parts[2]);
    if (!full) return err(res, 404, 'Confronto non trovato');
    full.sides = (full.sides || []).map(s => {
      if (s.source === 'library' && s.artworkId) {
        const a = getArtwork(s.artworkId);
        if (a) {
          s.title = s.title || a.title;
          s.artist = s.artist || a.artist;
          s.date = s.date || a.date;
          s.museum = s.museum || a.institution;
          s.imageUrl = '/api/artworks/' + a.id + '/image';
          s.imageStatus = a.hasImage ? 'ok' : 'missing';
        }
      } else if (s.source === 'external') {
        s.imageUrl = s.hasImage ? '/api/comparisons/' + parts[2] + '/side/' + s.side + '/image' : (s.imageUrl || '');
      }
      return s;
    });
    return json(res, 200, full);
  }
  // PATCH /api/comparisons/:id  (revisione sezioni + punti)
  if (method === 'PATCH' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'comparisons') {
    return readBody(req).then((input) => {
      const patch = {};
      for (const [k, col] of [['title', 'title'], ['comparisonType', 'comparison_type'], ['intro', 'intro'], ['technique', 'technique'], ['context', 'context'], ['critique', 'critique'], ['curiosities', 'curiosities'], ['status', 'status']]) {
        if (input[k] !== undefined) patch[col] = String(input[k]);
      }
      const saved = updateComparison(parts[2], patch);
      if (!saved) return err(res, 404, 'Confronto non trovato');
      if (Array.isArray(input.points)) replaceComparisonPoints(parts[2], input.points.map(p => ({ kind: p.kind, title: p.title, text: p.text })));
      return json(res, 200, getFullComparison(parts[2]));
    }).catch(e => err(res, 400, e.message));
  }
  // DELETE /api/comparisons/:id
  if (method === 'DELETE' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'comparisons') {
    if (!getComparison(parts[2])) return err(res, 404, 'Confronto non trovato');
    deleteComparison(parts[2]);
    return json(res, 200, { ok: true });
  }
  // POST /api/comparisons/:id/sides { a: {...}, b: {...} }
  if (method === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'comparisons' && parts[3] === 'sides') {
    return readBody(req).then(async (input) => {
      const comparison = getComparison(parts[2]);
      if (!comparison) return err(res, 404, 'Confronto non trovato');
      for (const side of ['a', 'b']) {
        const s = input[side];
        if (!s) continue;
        if (s.source === 'library' && s.artworkId) {
          const artwork = getArtwork(s.artworkId);
          if (!artwork) return err(res, 400, 'Opera "' + s.artworkId + '" non trovata nel database');
          setComparisonSide(comparison.id, side, {
            source: 'library', artworkId: artwork.id,
            title: artwork.title, artist: artwork.artist, date: artwork.date, museum: artwork.institution
          });
        } else {
          let imageData = null, imageMime = 'image/jpeg', imageStatus = 'missing', imageUrl = '';
          if (s.imageDataUrl) {
            const match = String(s.imageDataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
            if (!match) return err(res, 400, 'imageDataUrl non valido per il lato ' + side);
            imageData = Buffer.from(match[2], 'base64');
            imageMime = match[1];
            imageStatus = 'ok';
          } else if (s.imageUrl) {
            imageUrl = String(s.imageUrl).trim();
            try {
              const resp = await fetch(imageUrl, { headers: { 'User-Agent': 'noesis-roads-didattico/1.0 (local)' }, redirect: 'follow' });
              if (resp.ok) {
                const buf = Buffer.from(await resp.arrayBuffer());
                if (buf.length > 0) { imageData = buf; imageMime = String(resp.headers.get('content-type') || 'image/jpeg').split(';')[0]; imageStatus = 'ok'; }
                else imageStatus = 'failed';
              } else imageStatus = 'failed';
            } catch { imageStatus = 'failed'; }
          }
          setComparisonSide(comparison.id, side, {
            source: 'external', title: String(s.title || ''), artist: String(s.artist || ''),
            date: String(s.date || ''), museum: String(s.museum || ''),
            imageData, imageMime, imageUrl: imageUrl || '', imageStatus
          });
        }
      }
      return json(res, 200, { comparison: getFullComparison(parts[2]) });
    }).catch(e => err(res, 400, e.message));
  }
  // POST /api/comparisons/:id/generate/:step  (intro | points | analysis)
  if (method === 'POST' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'comparisons' && parts[3] === 'generate' &&
      ['intro', 'points', 'analysis'].includes(parts[4])) {
    const comparison = getComparison(parts[2]);
    if (!comparison) return err(res, 404, 'Confronto non trovato');
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) return err(res, 503, 'OPENROUTER_API_KEY non configurata');
    const step = parts[4];
    return Promise.resolve().then(async () => {
      if (step === 'intro') {
        const raw = await callModel(TEXT_MODEL, [{ type: 'text', text: buildComparisonIntroPrompt(comparisonRef(comparison)) }], apiKey);
        const intro = String(normalizeComparisonIntro(raw.data) || '');
        updateComparison(comparison.id, { intro });
        return json(res, 200, { comparison: getFullComparison(comparison.id) });
      }
      if (step === 'points') {
        const raw = await callModel(TEXT_MODEL, [{ type: 'text', text: buildComparisonPointsPrompt(comparisonRef(comparison)) }], apiKey);
        const d = normalizeComparisonPoints(raw.data);
        replaceComparisonPoints(comparison.id, [...(d.similar || []).map(p => ({ kind: 'similar', title: p.title, text: p.text })), ...(d.different || []).map(p => ({ kind: 'different', title: p.title, text: p.text }))]);
        return json(res, 200, { points: listComparisonPoints(comparison.id) });
      }
      // step === 'analysis'
      const raw = await callModel(TEXT_MODEL, [{ type: 'text', text: buildComparisonAnalysisPrompt(comparisonRef(comparison)) }], apiKey);
      const d = normalizeComparisonAnalysis(raw.data);
      updateComparison(comparison.id, { technique: d.technique, context: d.context, critique: d.critique, curiosities: d.curiosities });
      return json(res, 200, { comparison: getFullComparison(comparison.id) });
    }).catch(e => { console.error('ERR genComparison:', e); err(res, 500, e.message); });
  }
  // POST /api/comparisons/:id/approve — genera la miniatura composita (PIL) e passa a ready
  if (method === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'comparisons' && parts[3] === 'approve') {
    return Promise.resolve().then(async () => {
      const comparison = getComparison(parts[2]);
      if (!comparison) return err(res, 404, 'Confronto non trovato');
      let warning = null;
      try {
        const thumb = await renderComposeThumb(comparison);
        if (thumb) setComparisonThumb(comparison.id, thumb.data, 'image/jpeg');
        else warning = 'Miniatura composita non generata: manca un’immagine per uno dei due lati.';
      } catch (e) { warning = 'Miniatura composita non generata: ' + e.message; console.error('ERR compose:', e); }
      approveComparison(comparison.id);
      return json(res, 200, { ok: true, status: 'ready', comparison: getFullComparison(parts[2]), thumbWarning: warning });
    }).catch(e => err(res, 500, e.message));
  }
  // GET /api/comparisons/:id/side/:side/image — BLOB immagine lato esterno
  if (method === 'GET' && parts.length === 6 && parts[0] === 'api' && parts[1] === 'comparisons' && parts[3] === 'side' && parts[5] === 'image') {
    const img = getComparisonSideImage(parts[2], parts[4]);
    if (!img) return err(res, 404, 'Immagine non disponibile');
    const buf = Buffer.from(img.data);
    res.writeHead(200, { 'Content-Type': img.mime, 'Content-Length': buf.length, 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    return res.end(buf);
  }
  // GET /api/comparisons/:id/thumb — BLOB miniatura composita
  if (method === 'GET' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'comparisons' && parts[3] === 'thumb') {
    const row = getDb().prepare('SELECT thumb_data, thumb_mime FROM comparisons WHERE id = ?').get(parts[2]);
    if (!row || !row.thumb_data) return err(res, 404, 'Miniatura non disponibile');
    const buf = Buffer.from(row.thumb_data);
    res.writeHead(200, { 'Content-Type': row.thumb_mime || 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    return res.end(buf);
  }
  // GET|HEAD /api/comparisons/:id/pdf — PDF "libro d'arte" della scheda confronto
  if ((method === 'GET' || method === 'HEAD') && parts.length === 4 && parts[0] === 'api' && parts[1] === 'comparisons' && parts[3] === 'pdf') {
    const full = getFullComparison(parts[2]);
    if (!full) return err(res, 404, 'Confronto non trovato');
    if (!full.intro && !(full.points || []).length) return err(res, 400, 'Genera e salva prima i contenuti: il PDF esporta la scheda completa.');
    return sendPdf(res, buildComparisonPdfPayload(full), slugify(full.title || 'confronto') + '.pdf');
  }

  // ================= Nucleo generico: schede-lezione (Fase 2, additivo) =================
  // Namespace deciso: /api/cards + /api/materie (le legacy /api/subjects arte restano intatte).
  function cardPublic(c) {
    return { id: c.id, modelloId: c.modelloId, titolo: c.titolo, stato: c.stato, sezioniAttive: c.sezioniAttive, createdAt: c.createdAt, updatedAt: c.updatedAt };
  }
  function cardFullPublic(id) {
    const full = getSchedaFull(id);
    if (!full) return null;
    return {
      ...cardPublic(full),
      modello: full.modello,
      sezioni: full.sezioni,
      immagini: (full.immagini || []).map((m) => ({ ...m, url: '/api/cards/' + id + '/images/' + m.id }))
    };
  }

  // GET /api/materie — materie disponibili
  if (method === 'GET' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'materie') {
    return json(res, 200, { materie: listMaterie() });
  }

  // POST /api/materie { id?, nome, descrizione?, systemPrompt? } — nuova materia (wizard)
  if (method === 'POST' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'materie') {
    return readBody(req).then((input) => {
      const nome = String(input.nome || '').trim();
      if (!nome) return err(res, 400, 'nome obbligatorio');
      const id = input.id ? slugify(input.id) : slugify(nome);
      if (!id) return err(res, 400, 'id non valido');
      if (getMateria(id)) return err(res, 409, 'Esiste già una materia con id ' + id);
      const created = upsertMateria({ id, nome, descrizione: String(input.descrizione || ''), systemPrompt: String(input.systemPrompt || '') });
      return json(res, 201, { materia: created });
    }).catch(e => err(res, 400, e.message));
  }

  // PATCH /api/materie/:id { nome?, descrizione?, systemPrompt?, stato? }
  if (method === 'PATCH' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'materie') {
    return readBody(req).then((input) => {
      try {
        const saved = updateMateria(parts[2], {
          nome: input.nome !== undefined ? String(input.nome) : undefined,
          descrizione: input.descrizione !== undefined ? String(input.descrizione) : undefined,
          systemPrompt: input.systemPrompt !== undefined ? String(input.systemPrompt) : undefined,
          stato: input.stato !== undefined ? String(input.stato) : undefined,
        });
        if (!saved) return err(res, 404, 'Materia non trovata');
        return json(res, 200, { materia: saved });
      } catch (e) { return err(res, 400, e.message); }
    }).catch(e => err(res, 400, e.message));
  }

  // DELETE /api/materie/:id — rifiutata se ha modelli (cascata solo su vuoto)
  if (method === 'DELETE' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'materie') {
    if (!getMateria(parts[2])) return err(res, 404, 'Materia non trovata');
    if (listModelli(parts[2]).length) return err(res, 409, 'La materia ha modelli: eliminali prima');
    deleteMateria(parts[2]);
    return json(res, 200, { ok: true });
  }

  // Valida un sottoinsieme di sezioni attive contro lo schema del modello.
  function checkAttive(modello, attive) {
    const keys = (modello?.schema?.sections || []).map((s) => s.key);
    const errs = [];
    for (const k of (attive || [])) {
      if (!keys.includes(k)) errs.push('sezione attiva sconosciuta: ' + k);
    }
    for (const s of (modello?.schema?.sections || [])) {
      if (s.required && !(attive || []).includes(s.key)) errs.push('sezione required esclusa: ' + s.key);
    }
    return errs;
  }
  // Valida le definizioni di sezione presenti (permette modello draft senza sezioni).
  function checkSectionDefs(sections) {
    const errs = [];
    const seen = new Set();
    (sections || []).forEach((s, i) => {
      const where = `sections[${i}]`;
      if (!s || typeof s !== 'object') { errs.push(`${where}: non è un oggetto`); return; }
      if (!String(s.key || '').trim()) errs.push(`${where}: key mancante`);
      else if (seen.has(s.key)) errs.push(`${where}: key duplicata "${s.key}"`);
      else seen.add(s.key);
      if (!String(s.title || '').trim()) errs.push(`${where}: title mancante`);
      if (!isKnownSectionType(s.type)) errs.push(`${where}: type sconosciuto "${s.type}"`);
      if (s.maxWords !== undefined && s.maxWords !== null && s.maxWords !== '' && (!Number.isInteger(Number(s.maxWords)) || Number(s.maxWords) < 1)) errs.push(`${where}: maxWords non valido`);
    });
    return errs;
  }

  // GET /api/models?subject=filosofia[&standard=1] — modelli di una materia.
  // standard=1: solo l'ultima versione valida per chiave (i 4 modelli standard
  // per la creazione; bozze e vecchie versioni escluse).
  if (method === 'GET' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'models') {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const subject = q.get('subject') || '';
    if (!subject) return err(res, 400, 'Parametro subject obbligatorio (es. ?subject=filosofia)');
    let models = listModelli(subject);
    if (q.get('standard') === '1') {
      const latest = new Map();
      for (const m of models) {
        const cur = latest.get(m.chiave);
        if (!cur || m.versione > cur.versione) latest.set(m.chiave, m);
      }
      models = [...latest.values()].filter((m) => validateModel({
        ...m.schema, key: m.chiave, subject: m.materiaId, name: m.nome, version: m.versione,
      }).length === 0 && m.schema.nascondiCreazione !== true);
    }
    return json(res, 200, { models });
  }

  // POST /api/models { materiaId, chiave?, nome, fromTemplate? } — nuovo modello v1 (wizard).
  // fromTemplate: id modello ("materie:chiave:vN") da clonare. Sezioni: [] (draft) o ereditate.
  if (method === 'POST' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'models') {
    return readBody(req).then((input) => {
      try {
        const materiaId = String(input.materiaId || '').trim();
        if (!getMateria(materiaId)) return err(res, 400, 'Materia sconosciuta: ' + (input.materiaId || ''));
        const nome = String(input.nome || '').trim();
        if (!nome) return err(res, 400, 'nome obbligatorio');
        const chiave = input.chiave ? slugify(input.chiave) : slugify(nome);
        if (!chiave) return err(res, 400, 'chiave non valida');
        let schema;
        if (input.fromTemplate) {
          const tpl = getModello(String(input.fromTemplate));
          if (!tpl) return err(res, 400, 'Template sconosciuto: ' + input.fromTemplate);
          schema = JSON.parse(JSON.stringify(tpl.schema));
          schema.key = chiave; schema.subject = materiaId; schema.name = nome; schema.version = 1;
          schema.cover = tpl.schema.cover || { eyebrow: 'Scheda didattica', heroRole: 'hero' };
          if ((tpl.subject || tpl.materiaId) && (tpl.subject || tpl.materiaId) !== materiaId) {
            // Clone tra materie diverse: l'eyebrow segue la materia di destinazione.
            const mat = getMateria(materiaId);
            schema.cover = { ...schema.cover, eyebrow: 'Scheda didattica · ' + (mat ? mat.nome : materiaId) };
          }
          // Sezioni esplicite: sostituiscono il clone (wizard con modifiche).
          if (Array.isArray(input.sections) && input.sections.length) schema.sections = input.sections;
        } else {
          schema = {
            key: chiave, subject: materiaId, name: nome, version: 1,
            cover: { eyebrow: 'Scheda didattica · ' + materiaId, heroRole: 'hero' },
            sections: Array.isArray(input.sections) ? input.sections : [],
          };
        }
        const defErrs = checkSectionDefs(schema.sections);
        if (defErrs.length) return err(res, 400, 'Sezioni non valide: ' + defErrs.join('; '));
        if (getModello(`${materiaId}:${chiave}:v1`)) return err(res, 409, 'Esiste già il modello ' + materiaId + ':' + chiave + ':v1');
        const created = upsertModello({ materiaId, chiave, nome, versione: 1, schema });
        return json(res, 201, { model: created });
      } catch (e) {
        return err(res, String(e.message || '').includes('UNIQUE') ? 409 : 400, e.message);
      }
    }).catch(e => err(res, 400, e.message));
  }

  // PATCH /api/models/:id { nome?, systemPrompt? } — ridenominazione/voce (lo schema via sections/fork)
  if (method === 'PATCH' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'models') {
    return readBody(req).then((input) => {
      const current = getModello(parts[2]);
      if (!current) return err(res, 404, 'Modello non trovato');
      const nome = input.nome !== undefined ? String(input.nome).trim() : current.nome;
      if (!nome) return err(res, 400, 'nome obbligatorio');
      const schema = JSON.parse(JSON.stringify(current.schema));
      schema.name = nome;
      if (input.systemPrompt !== undefined) {
        if (String(input.systemPrompt).trim()) schema.system_prompt = String(input.systemPrompt);
        else delete schema.system_prompt;
      }
      const saved = updateModello(parts[2], { nome, schema });
      return json(res, 200, { model: saved });
    }).catch(e => err(res, 400, e.message));
  }

  // DELETE /api/models/:id — rifiutato se ha schede
  if (method === 'DELETE' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'models') {
    if (!getModello(parts[2])) return err(res, 404, 'Modello non trovato');
    if (modelHasCards(parts[2])) return err(res, 409, 'Il modello ha schede: crea una nuova versione con fork');
    deleteModello(parts[2]);
    return json(res, 200, { ok: true });
  }

  // POST /api/models/:id/fork — clona in vN+1 (unica strada con schede esistenti)
  if (method === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'models' && parts[3] === 'fork') {
    const current = getModello(parts[2]);
    if (!current) return err(res, 404, 'Modello non trovato');
    const schema = JSON.parse(JSON.stringify(current.schema));
    schema.version = current.versione + 1;
    const created = upsertModello({ materiaId: current.materiaId, chiave: current.chiave, nome: current.nome, versione: schema.version, schema });
    return json(res, 201, { model: created });
  }

  // POST /api/models/:id/sections { key?, title, type, required?, prompt?, system?, maxWords? }
  if (method === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'models' && parts[3] === 'sections') {
    return readBody(req).then((input) => {
      const current = getModello(parts[2]);
      if (!current) return err(res, 404, 'Modello non trovato');
      if (modelHasCards(parts[2])) return err(res, 409, 'Il modello ha schede: crea una nuova versione con fork');
      const schema = JSON.parse(JSON.stringify(current.schema));
      schema.sections = Array.isArray(schema.sections) ? schema.sections : [];
      const def = {
        key: input.key ? slugify(input.key) : slugify(input.title || ''),
        title: String(input.title || '').trim(),
        type: String(input.type || '').trim(),
        required: input.required === true,
      };
      if (input.prompt !== undefined) def.prompt = String(input.prompt);
      if (input.system !== undefined) def.system = String(input.system);
      if (input.maxWords !== undefined && input.maxWords !== null && input.maxWords !== '') def.maxWords = Number(input.maxWords);
      if (input.groups !== undefined) def.groups = input.groups;
      if (input.withImages !== undefined) def.withImages = input.withImages === true;
      if (input.fullpage !== undefined) def.fullpage = input.fullpage === true;
      const errs = checkSectionDefs([...schema.sections, def]);
      if (errs.length) return err(res, 400, 'Sezione non valida: ' + errs.join('; '));
      schema.sections.push(def);
      const saved = updateModello(parts[2], { schema });
      return json(res, 201, { model: saved, section: def });
    }).catch(e => err(res, 400, e.message));
  }

  // PATCH /api/models/:id/sections/:sez — modifica definizione (409 con schede)
  if (method === 'PATCH' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'models' && parts[3] === 'sections') {
    return readBody(req).then((input) => {
      const current = getModello(parts[2]);
      if (!current) return err(res, 404, 'Modello non trovato');
      if (modelHasCards(parts[2])) return err(res, 409, 'Il modello ha schede: crea una nuova versione con fork');
      const schema = JSON.parse(JSON.stringify(current.schema));
      schema.sections = Array.isArray(schema.sections) ? schema.sections : [];
      const idx = schema.sections.findIndex((s) => s.key === parts[4]);
      if (idx < 0) return err(res, 404, 'Sezione sconosciuta: ' + parts[4]);
      const next = { ...schema.sections[idx] };
      for (const k of ['title', 'type', 'prompt', 'system']) {
        if (input[k] !== undefined) next[k] = String(input[k]);
      }
      if (input.required !== undefined) next.required = input.required === true;
      if (input.maxWords !== undefined) {
        if (input.maxWords === null || input.maxWords === '') delete next.maxWords;
        else next.maxWords = Number(input.maxWords);
      }
      if (input.groups !== undefined) next.groups = input.groups;
      const rest = schema.sections.filter((_, i) => i !== idx);
      const errs = checkSectionDefs([...rest.slice(0, idx), next, ...rest.slice(idx)]);
      if (errs.length) return err(res, 400, 'Sezione non valida: ' + errs.join('; '));
      schema.sections[idx] = next;
      const saved = updateModello(parts[2], { schema });
      return json(res, 200, { model: saved, section: next });
    }).catch(e => err(res, 400, e.message));
  }

  // DELETE /api/models/:id/sections/:sez (409 con schede)
  if (method === 'DELETE' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'models' && parts[3] === 'sections') {
    const current = getModello(parts[2]);
    if (!current) return err(res, 404, 'Modello non trovato');
    if (modelHasCards(parts[2])) return err(res, 409, 'Il modello ha schede: crea una nuova versione con fork');
    const schema = JSON.parse(JSON.stringify(current.schema));
    schema.sections = (Array.isArray(schema.sections) ? schema.sections : []).filter((s) => s.key !== parts[4]);
    const saved = updateModello(parts[2], { schema });
    return json(res, 200, { ok: true, model: saved });
  }

  // GET /api/cards?modello=&stato= — elenco schede-lezione
  if (method === 'GET' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'cards') {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const cards = listSchede({ modelloId: q.get('modello') || null, stato: q.get('stato') || null });
    return json(res, 200, { cards: cards.map(cardPublic) });
  }

  // POST /api/cards { modelloId, titolo?, id?, sezioniAttive? } — nuova scheda-lezione
  // sezioniAttive: sottoinsieme di chiavi (le required sempre incluse); null = tutte.
  if (method === 'POST' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'cards') {
    return readBody(req).then((input) => {
      if (!input.modelloId) return err(res, 400, 'modelloId obbligatorio');
      const modello = getModello(input.modelloId);
      if (!modello) return err(res, 400, 'Modello sconosciuto: ' + input.modelloId);
      const modelErrs = validateModel({ ...modello.schema, key: modello.chiave, subject: modello.materiaId, name: modello.nome, version: modello.versione });
      if (modelErrs.length) return err(res, 400, 'Modello non valido (draft incompleto?): ' + modelErrs.join('; '));
      let attive = null;
      if (input.sezioniAttive !== undefined && input.sezioniAttive !== null) {
        if (!Array.isArray(input.sezioniAttive)) return err(res, 400, 'sezioniAttive deve essere un array di chiavi');
        attive = input.sezioniAttive.map(String);
        const attErrs = checkAttive(modello, attive);
        if (attErrs.length) return err(res, 400, attErrs.join('; '));
      }
      try {
        const created = createScheda({ id: input.id || null, modelloId: input.modelloId, titolo: input.titolo || '', sezioniAttive: attive });
        return json(res, 201, { card: cardPublic(created) });
      } catch (e) {
        return err(res, String(e.message || '').includes('già una scheda') ? 409 : 400, e.message);
      }
    }).catch(e => err(res, 400, e.message));
  }

  // GET /api/cards/:id — dettaglio completo (modello + sezioni + immagini)
  if (method === 'GET' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'cards') {
    const full = cardFullPublic(parts[2]);
    if (!full) return err(res, 404, 'Scheda non trovata');
    return json(res, 200, full);
  }

  // PATCH /api/cards/:id { titolo?, sezioniAttive? } — revisione metadati
  // sezioniAttive modificabile solo in draft (mai su ready pubblicata).
  if (method === 'PATCH' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'cards') {
    return readBody(req).then((input) => {
      const current = getScheda(parts[2]);
      if (!current) return err(res, 404, 'Scheda non trovata');
      const patch = {};
      if (input.titolo !== undefined) patch.titolo = String(input.titolo);
      if (input.sezioniAttive !== undefined) {
        if (current.stato === 'ready') return err(res, 400, 'Scheda già pronta: le sezioni attive non si cambiano su ready');
        if (input.sezioniAttive === null) {
          patch.sezioniAttive = null;
        } else if (Array.isArray(input.sezioniAttive)) {
          const modello = getModello(current.modelloId);
          const attErrs = checkAttive(modello, input.sezioniAttive.map(String));
          if (attErrs.length) return err(res, 400, attErrs.join('; '));
          patch.sezioniAttive = input.sezioniAttive.map(String);
        } else {
          return err(res, 400, 'sezioniAttive deve essere un array di chiavi o null');
        }
      }
      const saved = updateScheda(parts[2], patch);
      if (!saved) return err(res, 404, 'Scheda non trovata');
      return json(res, 200, { card: cardPublic(saved) });
    }).catch(e => err(res, 400, e.message));
  }

  // DELETE /api/cards/:id
  if (method === 'DELETE' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'cards') {
    if (!getScheda(parts[2])) return err(res, 404, 'Scheda non trovata');
    deleteScheda(parts[2]);
    return json(res, 200, { ok: true });
  }

  // PATCH /api/cards/:id/sections/:sez { corpo } — revisione di una sezione (validata per tipo)
  if (method === 'PATCH' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'cards' && parts[3] === 'sections') {
    return readBody(req).then((input) => {
      const scheda = getScheda(parts[2]);
      if (!scheda) return err(res, 404, 'Scheda non trovata');
      const modello = getModello(scheda.modelloId);
      const def = modello && modello.schema.sections.find((s) => s.key === parts[4]);
      if (!def) return err(res, 404, 'Sezione sconosciuta per questo modello: ' + parts[4]);
      const corpo = (input && typeof input === 'object' && input.corpo !== undefined) ? input.corpo : input;
      const errors = validateBody(def.type, corpo);
      if (errors.length) return err(res, 400, 'Sezione non valida: ' + errors.join('; '));
      const saved = saveSezione(parts[2], parts[4], corpo);
      return json(res, 200, { section: saved });
    }).catch(e => err(res, 400, e.message));
  }

  // POST /api/cards/:id/generate/:sez — genera una sezione via LLM
  if (method === 'POST' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'cards' && parts[3] === 'generate') {
    const scheda = getScheda(parts[2]);
    if (!scheda) return err(res, 404, 'Scheda non trovata');
    const modello = getModello(scheda.modelloId);
    const def = modello && modello.schema.sections.find((s) => s.key === parts[4]);
    if (!def) return err(res, 404, 'Sezione sconosciuta per questo modello: ' + parts[4]);
    if (def.type === 'image') return err(res, 400, 'La sezione immagine si compila con upload, non con generazione.');
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) return err(res, 503, 'OPENROUTER_API_KEY non configurata');
    return readBody(req).then(async (input) => {
      const materia = getMateria(modello.materiaId);
      const { system, user, version } = assembleSectionPrompts({ materia, modello: modello.schema, sezione: def, titoloScheda: scheda.titolo, livello: String((input && input.livello) || '') });
      try {
        const raw = await callModel(TEXT_MODEL, [{ type: 'text', text: user }], apiKey, undefined, { system });
        const corpo = normalizeSectionBody(def.type, raw.data);
        const warnings = validateBody(def.type, corpo);
        if (isBodyEmpty(def.type, corpo)) warnings.push('sezione vuota: il modello non ha restituito contenuti, riprova la generazione');
        const saved = saveSezione(parts[2], parts[4], corpo, { model: modello.id, promptVersion: version });
        return json(res, 200, { section: saved, warnings });
      } catch (e) { console.error('ERR genSection:', e); return err(res, 500, e.message); }
    }).catch(e => err(res, 400, e.message));
  }

  // GET /api/prompts/preview?modello=<id>&sezione=<key>[&titolo=][&livello=] — system+user assemblati (debug)
  if (method === 'GET' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'prompts' && parts[2] === 'preview') {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const modello = getModello(q.get('modello') || '');
    if (!modello) return err(res, 404, 'Modello sconosciuto: ' + (q.get('modello') || ''));
    const def = (modello.schema.sections || []).find((s) => s.key === (q.get('sezione') || ''));
    if (!def) return err(res, 404, 'Sezione sconosciuta per questo modello: ' + (q.get('sezione') || ''));
    const materia = getMateria(modello.materiaId);
    return json(res, 200, assembleSectionPrompts({ materia, modello: modello.schema, sezione: def, titoloScheda: q.get('titolo') || '', livello: q.get('livello') || '' }));
  }

  // POST /api/cards/:id/approve — ready (+ gate required come il legacy)
  if (method === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'cards' && parts[3] === 'approve') {
    const scheda = getScheda(parts[2]);
    if (!scheda) return err(res, 404, 'Scheda non trovata');
    const result = approveScheda(parts[2]);
    if (!result.ok) return err(res, 400, 'Genera e salva prima i contenuti: sezioni mancanti: ' + result.missing.join(', '));
    return json(res, 200, { ok: true, status: 'ready', card: cardPublic(result.scheda) });
  }

  // POST /api/cards/:id/images { ruolo, imageDataUrl } — upload immagine (BLOB)
  if (method === 'POST' && parts.length === 4 && parts[0] === 'api' && parts[1] === 'cards' && parts[3] === 'images') {
    if (!getScheda(parts[2])) return err(res, 404, 'Scheda non trovata');
    return readBody(req).then((input) => {
      const ruolo = String(input.ruolo || '').trim();
      if (!ruolo) return err(res, 400, 'ruolo obbligatorio');
      const match = String(input.imageDataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) return err(res, 400, 'imageDataUrl non valido: atteso data:image/...;base64,...');
      const buf = Buffer.from(match[2], 'base64');
      if (!buf.length) return err(res, 400, 'Immagine vuota');
      const id = addImmagine(parts[2], ruolo, buf, match[1]);
      const row = getImmagine(id);
      return json(res, 201, { image: { id: row.id, ruolo: row.ruolo, mime: row.mime, bytes: row.data ? row.data.length : 0, url: '/api/cards/' + parts[2] + '/images/' + row.id } });
    }).catch(e => err(res, 400, e.message));
  }

  // GET /api/cards/:id/images/:imgId — BLOB immagine
  if (method === 'GET' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'cards' && parts[3] === 'images') {
    const img = getImmagine(Number(parts[4]));
    if (!img || !img.data || String(img.schedaId) !== String(parts[2])) return err(res, 404, 'Immagine non disponibile');
    const buf = Buffer.from(img.data);
    res.writeHead(200, { 'Content-Type': img.mime, 'Content-Length': buf.length, 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    return res.end(buf);
  }

  // DELETE /api/cards/:id/images/:imgId
  if (method === 'DELETE' && parts.length === 5 && parts[0] === 'api' && parts[1] === 'cards' && parts[3] === 'images') {
    const img = getImmagine(Number(parts[4]));
    if (!img || String(img.schedaId) !== String(parts[2])) return err(res, 404, 'Immagine non disponibile');
    deleteImmagine(Number(parts[4]));
    return json(res, 200, { ok: true });
  }

  // GET|HEAD /api/cards/:id/pdf — PDF "libro d'arte" della scheda generica
  if ((method === 'GET' || method === 'HEAD') && parts.length === 4 && parts[0] === 'api' && parts[1] === 'cards' && parts[3] === 'pdf') {
    const full = getSchedaFull(parts[2]);
    if (!full) return err(res, 404, 'Scheda non trovata');
    if (!(full.sezioni || []).length) return err(res, 400, 'Genera e salva prima i contenuti: il PDF esporta la scheda completa.');
    return sendPdf(res, buildGenericPdfPayload(full), slugify(full.titolo || 'scheda') + '.pdf');
  }

  return err(res, 404, 'Endpoint non trovato: ' + method + ' ' + urlPath);
}

// ---------- generazione AI (dettagli dall'immagine) ----------
async function proposeDetails(imageDataUrl, artwork, apiKey) {
  const prompt = `Sei uno storico dell’arte italiano. Guarda l’immagine dell’opera "${artwork.title}" di ${artwork.artist} (${artwork.date || 'data ignota'}) e proponi i 4-6 dettagli più significativi da esplorare didatticamente: figure, gesti, elementi architettonici, simboli, luce, colori, oggetti.

Per ogni dettaglio restituisci un rettangolo normalizzato (0-1) che lo inquadri nell’immagine intera.

Rispondi SOLO con JSON valido nella forma:
{"details":[{"title":"Titolo breve del dettaglio","category":"Figura|Composizione|Simbolo|Luce|Colore|Oggetto|Architettura","region":{"x":0.33,"y":0.24,"width":0.28,"height":0.58},"short":"perché è interessante (max 10 parole)"}]}

Regole: title in italiano, chiaro e didattico; region interamente dentro [0,1] con width/height >= 0.05; nessun testo fuori dal JSON.`;
  const raw = await callModel(VISION_MODEL, [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: imageDataUrl } }
  ], apiKey);
  const list = Array.isArray(raw.data?.details) ? raw.data.details : [];
  return list.map((item, index) => {
    const r = item.region || {};
    return {
      title: String(item.title || ('Dettaglio ' + (index + 1))).slice(0, 80),
      category: String(item.category || 'Dettaglio').slice(0, 40),
      region: {
        x: clamp01(Number(r.x)), y: clamp01(Number(r.y)),
        width: Math.max(0.04, Math.min(1, Number(r.width) || 0.2)),
        height: Math.max(0.04, Math.min(1, Number(r.height) || 0.2))
      },
      short: String(item.short || '').slice(0, 120)
    };
  });
}
async function recognizeArtwork(imageDataUrl, apiKey) {
  const prompt = `Guarda questa immagine di un’opera d’arte e riconosci l’opera, se è celebre e la conosci. Rispondi SOLO con JSON valido:
{"title":"Titolo dell'opera","artist":"Nome dell'artista","date":"data o periodo (es. c. 1440–1445)","period":"periodo/corrente artistica (es. Rinascimento fiorentino)","technique":"tecnica (es. Affresco)","institution":"istituzione che la conserva (se la conosci)","location":"collocazione specifica (se la conosci)","description":"una frase breve che descrive cosa mostra l'immagine"}

Se non riconosci con certezza l’opera o qualche campo, usa stringhe vuote per i campi incerti e metti in title una descrizione generica. Non inventare. Nessun testo fuori dal JSON.`;
  const raw = await callModel(VISION_MODEL, [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: imageDataUrl } }
  ], apiKey);
  const d = raw.data || {};
  return {
    title: String(d.title || '').slice(0, 120),
    artist: String(d.artist || '').slice(0, 120),
    date: String(d.date || '').slice(0, 80),
    period: String(d.period || '').slice(0, 80),
    technique: String(d.technique || '').slice(0, 80),
    institution: String(d.institution || '').slice(0, 120),
    location: String(d.location || '').slice(0, 120),
    description: String(d.description || '').slice(0, 300)
  };
}
function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
const VALID_CATEGORIES = ['Figura', 'Composizione', 'Simbolo', 'Luce', 'Colore', 'Oggetto', 'Architettura'];
function normalizeCategory(v) {
  const value = String(v || '').trim();
  return VALID_CATEGORIES.includes(value) ? value : '';
}
// Lettura di un riquadro disegnato a mano: verifica che contenga un soggetto,
// propone la categoria e produce la descrizione visiva usata per i testi.
async function readManualDetail(artwork, selectionImage, fullImage, apiKey) {
  const prompt = `Sei uno storico dell’arte italiano. L’utente ha disegnato a mano un riquadro sull’immagine dell’opera "${artwork.title || ''}" di ${artwork.artist || ''} e vuole trasformarlo in un nuovo dettaglio didattico da esplorare. Guarda il RITAGLIO selezionato e usa l’immagine intera solo come contesto per capire dove si trova.

Rispondi SOLO con JSON valido, senza markdown né testo fuori dall’oggetto:
{"subjectFound":true|false,"category":"Figura|Composizione|Simbolo|Luce|Colore|Oggetto|Architettura","description":"descrizione visiva dettagliata in italiano di ciò che si vede nel riquadro (max 180 parole, SOLO elementi osservabili)"}

Regole: subjectFound=false se il riquadro è vuoto, privo di soggetto, sfocato o mostra solo una superficie uniforme senza elementi riconoscibili; in quel caso category deve essere la stringa vuota, ma descrivi comunque ciò che si vede.`;
  const parts = [{ type: 'text', text: prompt }];
  if (selectionImage) parts.push({ type: 'image_url', image_url: { url: selectionImage } });
  if (fullImage) parts.push({ type: 'text', text: 'Contesto: immagine intera dell’opera.' }, { type: 'image_url', image_url: { url: fullImage } });
  const raw = await callModel(VISION_MODEL, parts, apiKey);
  let d = raw && raw.data ? raw.data : {};
  if (typeof d === 'string') d = { description: d };
  const description = String(d.description || '').trim().slice(0, 4000);
  const subjectFound = d.subjectFound === true || d.subjectFound === 'true';
  return { subjectFound, category: subjectFound ? normalizeCategory(d.category) : '', description };
}

// ---------- generazione AI (contenuto per dettaglio) ----------
function detailInput(artwork, detail, level) {
  return {
    artwork,
    selection: { type: 'hotspot', hotspotId: detail.id, ...detail.region },
    hotspot: { id: detail.id, title: detail.title, category: detail.category },
    learningLevel: level,
    notableDetails: listDetails(artwork.id)
      .filter(d => d.id !== detail.id)
      .map(d => ({ title: d.title, category: d.category, short: '' })),
    sources: listSources(artwork.id)
  };
}
function visionContentParts(artwork, detail, selectionImage, fullImage) {
  const input = detailInput(artwork, detail, 'Scuola secondaria'); // la visione NON dipende dal livello
  const parts = [{ type: 'text', text: buildVisionPrompt(input) }, { type: 'image_url', image_url: { url: fullImage } }];
  if (selectionImage) parts.push(
    { type: 'text', text: 'La seconda immagine è il crop esatto della regione selezionata.' },
    { type: 'image_url', image_url: { url: selectionImage } }
  );
  return parts;
}
async function analyzeDetail({ artwork, detail, selectionImage, fullImage, level, apiKey, sharedVisionData = null }) {
  const input = detailInput(artwork, detail, level);
  let visionData = sharedVisionData;
  if (!visionData) {
    const vision = await callModel(VISION_MODEL, visionContentParts(artwork, detail, selectionImage, fullImage), apiKey);
    visionData = vision.data;
  }
  const explanation = await callModel(TEXT_MODEL, [{ type: 'text', text: buildTextPrompt(input, visionData) }], apiKey);
  return normalizeAnalysis(explanation.data, input, explanation.citations);
}

// ---------- immagine annotata (riquadri + didascalie) via PIL ----------
async function renderAnnotated(artwork) {
  const details = listDetails(artwork.id);
  if (!details.length) return null;
  let sourcePath = join(APP_ROOT, artwork.imagePath);
  let tempSource = false;
  if (!existsSync(sourcePath)) {
    const images = getArtworkImageData(artwork.id);
    if (!images || !images.clean) throw new Error('Immagine originale non disponibile');
    sourcePath = join(UPLOAD_DIR, artwork.id + '.src.jpg');
    await writeFile(sourcePath, Buffer.from(images.clean.data));
    tempSource = true;
  }
  const metaPath = join(UPLOAD_DIR, artwork.id + '.details.json');
  const outPath = join(UPLOAD_DIR, artwork.id + '.annotated.jpg');
  try {
    await writeFile(metaPath, JSON.stringify(details.map(d => ({ title: d.title, category: d.category, region: d.region }))));
    const { stdout } = await execFileAsync('python3', ['annotate.py', sourcePath, metaPath, outPath], { cwd: APP_ROOT, timeout: 60000 });
    const boxes = Number((stdout.match(/RIQUADRI_DISEGNATI\s+(\d+)/) || [])[1] || details.length);
    const captions = Number((stdout.match(/DIDASCALIE_DISEGNATE\s+(\d+)/) || [])[1] || details.length);
    return { data: await readFile(outPath), boxes, captions };
  } finally {
    if (tempSource) unlink(sourcePath).catch(() => {});
    unlink(metaPath).catch(() => {});
    unlink(outPath).catch(() => {});
  }
}

// ---------- Esportazione PDF: builder puri in ./pdf-payloads.mjs (condivisi col viewer) ----------
export {
  imageRef,
  normalizeSectionBody,
  buildArtworkPdfPayload, buildSubjectPdfPayload, buildComparisonPdfPayload, buildGenericPdfPayload,
} from './pdf-payloads.mjs';
import {
  buildArtworkPdfPayload, buildSubjectPdfPayload, buildComparisonPdfPayload, buildGenericPdfPayload,
  normalizeSectionBody,
} from './pdf-payloads.mjs';

async function renderPdf(payload) {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const inPath = join(UPLOAD_DIR, `pdf-${stamp}.json`);
  const outPath = join(UPLOAD_DIR, `pdf-${stamp}.pdf`);
  await writeFile(inPath, JSON.stringify(payload));
  try {
    try {
      await execFileAsync('python3', ['make_pdf.py', inPath, outPath], { cwd: APP_ROOT, timeout: 120000 });
    } catch (e) {
      const stderr = String((e && e.stderr) || '');
      if (e.code === 3 || stderr.includes('reportlab non installato')) {
        throw new Error('reportlab non è installato: esegui "pip install reportlab" e riprova.');
      }
      throw new Error('Generazione PDF fallita: ' + (stderr.split('\n').filter(Boolean).pop() || e.message));
    }
    return await readFile(outPath);
  } finally {
    unlink(inPath).catch(() => {});
    unlink(outPath).catch(() => {});
  }
}

function sendPdf(res, payload, filename) {
  return renderPdf(payload).then(buf => {
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': buf.length,
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(buf);
  }).catch(e => {
    // reportlab assente -> 503 con rimedio; altri errori Python -> 500. Senza
    // questo catch la response resterebbe appesa (unhandled rejection).
    const message = String((e && e.message) || e);
    err(res, message.includes('reportlab') ? 503 : 500, message);
  });
}

// ---------- Schede Soggetto e Faccia a faccia: serializzatori, prompt, normalizzatori ----------
function subjectPublic(s) {
  return { id: s.id, name: s.name, shortDesc: s.shortDesc, status: s.status, createdAt: s.createdAt, updatedAt: s.updatedAt };
}
function comparisonPublic(c) {
  return { id: c.id, title: c.title, comparisonType: c.comparisonType, hasThumb: c.hasThumb, status: c.status, createdAt: c.createdAt, updatedAt: c.updatedAt };
}
function subjectRef(s) { return { id: s.id, name: s.name, shortDesc: s.shortDesc, intro: s.intro, origins: s.origins }; }
function comparisonRef(c) {
  const sides = listComparisonSides(c.id);
  const a = sides.find(s => s.side === 'a') || {};
  const b = sides.find(s => s.side === 'b') || {};
  return {
    id: c.id, title: c.title, type: c.comparison_type,
    a: { title: a.title || '', artist: a.artist || '', date: a.date || '', museum: a.museum || '' },
    b: { title: b.title || '', artist: b.artist || '', date: b.date || '', museum: b.museum || '' }
  };
}
export function buildSubjectIntroPrompt(subject) {
  return `Sei uno storico dell’arte e un educatore italiano. Prepara l’apertura della scheda didattica sul SOGGETTO "${subject.name}" nella storia dell’arte: come questo soggetto è stato rappresentato da artisti diversi, di epoche e paesi diversi, fino ai nostri giorni.

Rispondi SOLO con JSON valido, senza markdown, nella forma:
{"shortDesc":"...","intro":"...","origins":"..."}

Regole:
- "shortDesc": una o due frasi (max 40 parole) per la card di libreria.
- "intro" (120-180 parole): che cos’è il soggetto, da quale fonte nasce (Vangelo, mito, letteratura, storia), perché gli artisti lo hanno rappresentato.
- "origins" (120-180 parole): le prime attestazioni nell’arte (paleocristiana, bizantina, medievale…), gli schemi compositivi fondativi e come sono cambiati nel tempo.
- Solo fatti di cui sei ragionevolmente certo; in italiano chiaro.`;
}
export function buildSubjectChaptersPrompt(subject) {
  return `Sei uno storico dell’arte italiano. Racconta l’EVOLUZIONE del soggetto "${subject.name}" nella storia dell’arte attraverso 6 capitoli cronologici, dal Medioevo (o dalle origini) al Novecento/contemporaneo.

Contesto: ${subject.intro ? subject.intro.slice(0, 600) : 'nessuna introduzione ancora generata'}

Rispondi SOLO con JSON valido, senza markdown, nella forma:
{"chapters":[{"era":"Titolo epoca/corrente","text":"..."}, ... 6 voci]}

Regole per ogni capitolo:
- "era": nome di epoca o corrente (es. "Rinascimento fiorentino", "Barocco", "Simbolismo").
- "text" (80-130 parole): come cambia il soggetto in quell’epoca — composizione, stile, luce, colore, significato — citando 1-2 artisti e opere REALI e celebri per ciascun capitolo (titolo, autore, data approssimativa).
- Ordine cronologico stretto; solo fatti ragionevolmente certi; in italiano chiaro.`;
}
export function buildSubjectWorksPrompt(subject) {
  const chapters = listSubjectChapters(subject.id);
  const eraHint = chapters.map(c => c.era).slice(0, 6).join(', ');
  return `Sei uno storico dell’arte italiano. Proponi 8 opere REALI e CELEBRI che rappresentano il soggetto "${subject.name}", scelte per coprire l’evoluzione del soggetto (epoche suggerite: ${eraHint || 'dal Medioevo al Novecento'}).

Regole:
- SOLO opere reali e riconoscibili: più sono celebri, meglio è (devono avere una foto in pubblico dominio su Wikimedia Commons o al MET).
- Varietà di autori, secoli e paesi.
- Per ogni opera: "title" (in italiano se noto), "artist", "date", "museum" (museo/collezione), "caption" (perché è importante per l’evoluzione di QUESTO soggetto, max 25 parole), "search" (parole chiave per trovare l’immagine: titolo originale + autore, in inglese se aiuta; es. "Annunciation Memling").
- Non inventare nulla: se non sei certo che un’opera esista, sostituiscila.

Rispondi SOLO con JSON valido, senza markdown, nella forma:
{"works":[{"title":"...","artist":"...","date":"...","museum":"...","caption":"...","search":"..."}, ... 8 voci]}`;
}
export function buildSubjectClosingPrompt(subject) {
  return `Sei uno storico dell’arte e un educatore italiano. Completa la scheda didattica sul soggetto "${subject.name}" nella storia dell’arte.

Rispondi SOLO con JSON valido, senza markdown, nella forma:
{"symbols":[{"symbol":"...","meaning":"..."}],"interpretations":"...","curiosities":"..."}

Regole:
- "symbols": 5-7 attributi/simboli ricorrenti nelle rappresentazioni di QUESTO soggetto, con il loro significato (es. giglio → purezza).
- "interpretations" (120-180 parole): come il soggetto è stato interpretato diversamente nel tempo — teologico, politico, stilistico, psicologico — con 1-2 esempi reali.
- "curiosities" (80-120 parole): 2-3 curiosità verificate o dibattute dagli studiosi.
- In italiano chiaro; solo fatti ragionevolmente certi.`;
}
export function buildComparisonIntroPrompt(c) {
  return `Sei uno storico dell’arte e un educatore italiano. Scrivi l’introduzione di una scheda di CONFRONTO ("faccia a faccia") tra due opere.

Opera A: ${c.a.title || '?'}${c.a.artist ? ' di ' + c.a.artist : ''}${c.a.date ? ' (' + c.a.date + ')' : ''}${c.a.museum ? ', ' + c.a.museum : ''}
Opera B: ${c.b.title || '?'}${c.b.artist ? ' di ' + c.b.artist : ''}${c.b.date ? ' (' + c.b.date + ')' : ''}${c.b.museum ? ', ' + c.b.museum : ''}
Tipo di confronto: ${c.type === 'same-artist' ? 'stesso artista in due fasi della sua carriera' : 'stesso soggetto tra due artisti'}

Rispondi SOLO con JSON valido: {"intro":"..."}

Regole: "intro" (120-180 parole) — perché questo accostamento è interessante, che cosa hanno in comune le due opere a colpo d’occhio e che cosa le allontana; tono didattico, in italiano chiaro.`;
}
export function buildComparisonPointsPrompt(c) {
  return `Sei uno storico dell’arte italiano. Confronta le due opere seguenti e produci le voci di confronto.

Opera A: ${c.a.title || '?'}${c.a.artist ? ' di ' + c.a.artist : ''}${c.a.date ? ' (' + c.a.date + ')' : ''}
Opera B: ${c.b.title || '?'}${c.b.artist ? ' di ' + c.b.artist : ''}${c.b.date ? ' (' + c.b.date + ')' : ''}
Tipo: ${c.type === 'same-artist' ? 'stesso artista, fasi diverse' : 'stesso soggetto, artisti diversi'}

Rispondi SOLO con JSON valido, senza markdown, nella forma:
{"similar":[{"title":"...","text":"..."}],"different":[{"title":"...","text":"..."}]}

Regole:
- "similar": 3-5 voci di elementi che le due opere condividono (composizione, iconografia, luce, simboli, gesti…). Ogni voce: "title" breve (es. "La luce") e "text" (40-70 parole) che spiega il punto in comune.
- "different": 4-6 voci di elementi che le differenziano (stile, tecnica, colore, atmosfera, significato, contesto…). Ogni voce: "title" breve e "text" (40-70 parole).
- Solo fatti ragionevolmente certi; in italiano chiaro.`;
}
export function buildComparisonAnalysisPrompt(c) {
  return `Sei uno storico dell’arte italiano. Concludi la scheda di confronto tra due opere.

Opera A: ${c.a.title || '?'}${c.a.artist ? ' di ' + c.a.artist : ''}${c.a.date ? ' (' + c.a.date + ')' : ''}${c.a.museum ? ', ' + c.a.museum : ''}
Opera B: ${c.b.title || '?'}${c.b.artist ? ' di ' + c.b.artist : ''}${c.b.date ? ' (' + c.b.date + ')' : ''}${c.b.museum ? ', ' + c.b.museum : ''}

Rispondi SOLO con JSON valido, senza markdown, nella forma:
{"technique":"...","context":"...","critique":"...","curiosities":"..."}

Regole:
- "technique" (90-140 parole): tecnica a confronto — supporto, materia, pennellata, luce, colore, contrasti.
- "context" (80-130 parole): i due contesti storico-artistici (epoche, culture, committenze).
- "critique" (80-130 parole): interpretazione critica — quale lettura prevale, che cosa insegna il confronto.
- "curiosities" (60-100 parole): 1-2 curiosità verificate.
- In italiano chiaro; solo fatti ragionevolmente certi.`;
}
export function normalizeSubjectOutline(raw) {
  const d = (raw && typeof raw === 'object') ? raw : {};
  return {
    shortDesc: String(d.shortDesc || d.short_desc || '').trim().slice(0, 300),
    intro: String(d.intro || '').trim().slice(0, 8000),
    origins: String(d.origins || '').trim().slice(0, 8000)
  };
}
export function normalizeSubjectChapters(raw) {
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.chapters) ? raw.chapters : []);
  return list.slice(0, 8).map(c => ({ era: String(c.era || '').trim().slice(0, 120), text: String(c.text || '').trim().slice(0, 4000) }));
}
export function normalizeSubjectClosing(raw) {
  const d = (raw && typeof raw === 'object') ? raw : {};
  return {
    symbols: (Array.isArray(d.symbols) ? d.symbols : []).slice(0, 10).map(s => ({ symbol: String(s.symbol || s.name || '').trim().slice(0, 120), meaning: String(s.meaning || '').trim().slice(0, 600) })),
    interpretations: String(d.interpretations || '').trim().slice(0, 8000),
    curiosities: String(d.curiosities || '').trim().slice(0, 6000)
  };
}
export function normalizeComparisonIntro(raw) {
  const d = (raw && typeof raw === 'object') ? raw : {};
  return String(d.intro || d.text || '').trim().slice(0, 8000);
}
export function normalizeComparisonPoints(raw) {
  const d = (raw && typeof raw === 'object') ? raw : {};
  const map = (list) => (Array.isArray(list) ? list : []).slice(0, 8).map(p => ({
    title: String(p.title || '').trim().slice(0, 200),
    text: String(p.text || '').trim().slice(0, 3000)
  }));
  return { similar: map(d.similar), different: map(d.different) };
}
export function normalizeComparisonAnalysis(raw) {
  const d = (raw && typeof raw === 'object') ? raw : {};
  return {
    technique: String(d.technique || '').trim().slice(0, 8000),
    context: String(d.context || '').trim().slice(0, 8000),
    critique: String(d.critique || '').trim().slice(0, 8000),
    curiosities: String(d.curiosities || '').trim().slice(0, 6000)
  };
}

// Miniatura composita "faccia a faccia": metà sinistra A + metà destra B (PIL).
async function renderComposeThumb(comparison) {
  const sides = listComparisonSides(comparison.id);
  const sideA = sides.find(s => s.side === 'a');
  const sideB = sides.find(s => s.side === 'b');
  if (!sideA || !sideB) return null;
  const getSidePath = async (side) => {
    let data = null, mime = 'image/jpeg';
    if (side.source === 'library' && side.artworkId) {
      const images = getArtworkImageData(side.artworkId);
      if (images && images.clean) { data = Buffer.from(images.clean.data); mime = images.clean.mime || 'image/jpeg'; }
    }
    if (!data) {
      const img = getComparisonSideImage(comparison.id, side.side);
      if (img) { data = Buffer.from(img.data); mime = img.mime || 'image/jpeg'; }
    }
    if (!data) return null;
    const p = join(UPLOAD_DIR, comparison.id + '.' + side.side + '.src.jpg');
    await writeFile(p, data);
    return p;
  };
  const pa = await getSidePath(sideA);
  const pb = await getSidePath(sideB);
  if (!pa || !pb) return null;
  const outPath = join(UPLOAD_DIR, comparison.id + '.thumb.jpg');
  try {
    await execFileAsync('python3', ['compose_thumb.py', pa, pb, outPath], { cwd: APP_ROOT, timeout: 60000 });
    return { data: await readFile(outPath) };
  } finally {
    unlink(pa).catch(() => {});
    unlink(pb).catch(() => {});
    unlink(outPath).catch(() => {});
  }
}

// ---------- static + avvio ----------
// URL dell'hub per il bottone «← Hub» della UI: porta letta da NOESIS_HUB_PORT (fallback ARTEST_HUB_PORT)
// (default 18080, come launcher.mjs), host preso dalla richiesta in modo che il
// link funzioni anche in LAN. Iniettato sostituendo il segnaposto <!--APP_CONFIG-->.
function hubUrlFor(req) {
  const hostHeader = String((req && req.headers && req.headers.host) || '').trim();
  const hostname = hostHeader.split(':')[0] || '127.0.0.1';
  const hubPort = Number(process.env.NOESIS_HUB_PORT || process.env.ARTEST_HUB_PORT || 18080);
  return `http://${hostname}:${hubPort}/`;
}

async function serveStatic(req, res, urlPath) {
  const requestPath = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = resolve(PUBLIC_DIR, `.${normalize(requestPath)}`);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error();
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    let body = await readFile(filePath);
    if (extname(filePath) === '.html') {
      const configScript = `<script>window.CREATOR_DATA = Object.assign(window.CREATOR_DATA || {}, { hubUrl: ${JSON.stringify(hubUrlFor(req))} });</script>`;
      body = Buffer.from(body.toString('utf8').replace('<!--APP_CONFIG-->', configScript));
    }
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Not Found');
  }
}

export function createCreatorServer() {
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const urlPath = decodeURIComponent(url.pathname);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
      res.end(); return;
    }

    if (urlPath === '/api/status') {
      const full = listArtworks().length;
      return json(res, 200, {
        app: 'noesis-roads-creator',
        configured: Boolean(getOpenRouterApiKey()),
        visionModel: VISION_MODEL,
        textModel: TEXT_MODEL,
        artworks: full,
        database: getDb() ? 'sqlite' : null
      });
    }

    if (urlPath.startsWith('/api/')) return handleApi(req, res, urlPath);

    // uploads/ (immagini)
    if (urlPath.startsWith('/uploads/')) {
      const filePath = resolve(APP_ROOT, `.${normalize(urlPath)}`);
      if (!filePath.startsWith(APP_ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
      return readFile(filePath).then(data => {
        res.writeHead(200, { 'Content-Type': urlPath.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'no-cache' });
        res.end(data);
      }).catch(() => { res.writeHead(404); res.end('Not Found'); });
    }

    return serveStatic(req, res, urlPath);
  });
}

const server = createCreatorServer();

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, HOST, () => {
    console.log(`noesis-roads-creator: http://${HOST}:${PORT}`);
    console.log(`DB: SQLite (node:sqlite)`);
    console.log(`Modello visione: ${VISION_MODEL}`);
    console.log(`Modello testo: ${TEXT_MODEL}`);
    console.log(getOpenRouterApiKey() ? 'OpenRouter API key: configurata' : 'OpenRouter API key: NON configurata');
  });
}
