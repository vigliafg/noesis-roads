import { createServer } from 'node:http';
import { readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildArtworkPdfPayload, buildSubjectPdfPayload, buildComparisonPdfPayload, buildGenericPdfPayload,
} from './noesis-roads-creator/pdf-payloads.mjs';

export const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));

// Lettura (sola lettura, zero scritture) delle schede "ready" prodotte da noesis-roads-creator.
import {
  listReadyArtworksRO, getArtworkImageDataRO, getOverviewRO, listDetailsRO,
  getDetailContentRO, listSourcesRO, listSimilarWorksRO, getSimilarImageRO,
  listReadySubjectsRO, getSubjectRO, getSubjectWorkImageRO,
  listReadyComparisonsRO, getComparisonRO, getComparisonSideImageRO, getComparisonThumbRO,
  listMaterieRO, listModelliRO, listReadySchedeRO, getSchedaFullRO, getImmagineRO
} from './noesis-roads-creator/db.mjs';

function loadLocalEnv() {
  for (const filename of ['.env.local', '.env']) {
    try {
      const text = readFileSync(join(ROOT, filename), 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
      }
    } catch {}
  }
}
loadLocalEnv();

export const OPENROUTER_ENDPOINT = process.env.OPENROUTER_ENDPOINT || 'https://openrouter.ai/api/v1/chat/completions';
export const VISION_MODEL = process.env.OPENROUTER_VISION_MODEL || 'meta/muse-spark-1.3-contributor';
export const TEXT_MODEL = process.env.OPENROUTER_TEXT_MODEL || 'meta/muse-spark-1.3-contributor';
export const VERIFY_MODEL = process.env.OPENROUTER_VERIFY_MODEL || 'perplexity/sonar';
export function webSearchEnabled(env = process.env) { return env.OPENROUTER_WEB_SEARCH?.trim().toLowerCase() === 'true'; }
const PORT = Number(process.env.APP_PORT || 18000);
const HOST = process.env.APP_HOST || '127.0.0.1';
const IMAGE_PATH = join(ROOT, 'annunciazione-beato-angelico.jpg');

export function getOpenRouterApiKey(env = process.env) { return env.OPENROUTER_API_KEY?.trim() || ''; }

const FENCE = String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);

function tryParseJson(text) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

function unwrapJson(value, depth) {
  if (!value || depth > 4) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return tryParseJson(trimmed) || value;
    if (trimmed.startsWith('"')) {
      try { return unwrapJson(JSON.parse(trimmed), depth + 1); } catch { return value; }
    }
    return value;
  }
  if (typeof value === 'object') {
    // Model wrapped the real JSON as a string inside a single envelope key.
    const keys = Object.keys(value);
    if (keys.length === 1) {
      const nested = value[keys[0]];
      const candidate = unwrapJson(nested, depth + 1);
      if (candidate && candidate !== nested && typeof candidate === 'object') return candidate;
    }
    return value;
  }
  return value;
}

export function cleanModelJson(value) {
  if (value && typeof value === 'object') return unwrapJson(value, 0);
  let text = String(value || '').trim();
  if (text.indexOf(FENCE) === 0) {
    const endIdx = text.lastIndexOf(FENCE);
    if (endIdx > 3) text = text.slice(3, endIdx).trim();
  }
  let parsed = tryParseJson(text);
  if (parsed) return unwrapJson(parsed, 0);
  const unescaped = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  parsed = tryParseJson(unescaped);
  if (parsed) return unwrapJson(parsed, 0);
  return unwrapJson({ observation: text }, 0);
}
function stripLookAgainPrefix(text) {
  return String(text || '').replace(/^[\"'\u2019\u2018 ]*guarda ancora[\"'\u2019\u2018 :.!-]*/i, '').trim();
}

export function normalizeAnalysis(raw, input, citations = []) {
  const selection = input.selection || {};
  const hotspot = input.hotspot || {};
  const content = extractContent(raw);
  const confidence = raw?.confidence && typeof raw.confidence === 'object' ? raw.confidence : {};
  const fallback = {
    observation: 'Il modello non ha restituito un’osservazione sufficiente per questa selezione.',
    meaning: 'Prova a selezionare un’area più precisa o ad allargare leggermente la selezione.',
    relation: 'Il collegamento con gli altri dettagli dell’opera non è stato descritto dal modello.'
  };
  const get = key => String(content[key] || fallback[key]).trim();
  const level = String(confidence.level || (selection.type === 'hotspot' ? 'high' : 'medium'));
  const advanced = String(input.learningLevel || '').toLowerCase().includes('approfondimento');
  return {
    id: `openrouter-analysis-${Date.now()}`,
    status: 'completed',
    title: hotspot.title || 'Area selezionata',
    confidence: {
      level,
      label: String(confidence.label || (level === 'high' ? 'Osservazione ben supportata' : 'Interpretazione probabile')),
      tone: level === 'high' ? 'cool' : 'warm'
    },
    content: {
      observation: get('observation'),
      meaning: get('meaning'),
      relation: get('relation'),
      curiosity: String(content.curiosity || '').trim(),
      comparisons: advanced ? String(content.comparisons || '').trim() : '',
      openQuestions: advanced ? String(content.openQuestions || '').trim() : '',
      technique: advanced ? String(content.technique || '').trim() : '',
      lookAgain: stripLookAgainPrefix(String(content.lookAgain || '').trim())
    },
    sources: [...collectWebSources(citations), ...(input.sources || [])],
    disclaimer: 'La spiegazione è generata tramite OpenRouter: osserva il dettaglio selezionato e lo collega agli altri dettagli dell’opera. Il contesto storico-artistico generale è presentato in cima alla pagina.'
  };
}
export function normalizeOverview(raw, input, citations = []) {
  const artwork = input.artwork || {};
  const content = extractContent(raw);
  const fallback = {
    painting: 'Il modello non ha prodotto una presentazione del dipinto. Riprova tra poco.',
    artist: 'Il modello non ha prodotto una presentazione dell’artista. Riprova tra poco.'
  };
  const get = key => String(content[key] || fallback[key]).trim();
  return {
    id: `openrouter-overview-${Date.now()}`,
    status: 'completed',
    title: artwork.title || 'Opera',
    content: { painting: get('painting'), artist: get('artist') },
    sources: [...collectWebSources(citations), ...(input.sources || [])],
    disclaimer: 'La presentazione è generata tramite OpenRouter a partire dalla conoscenza del modello e dalle fonti indicate. Verifica i dati con le fonti prima di un uso didattico.'
  };
}
function collectWebSources(citations) {
  return (Array.isArray(citations) ? citations : []).filter(c => c && c.url).map((c, index) => ({ title: c.title || `Fonte web ${index + 1}`, url: c.url, type: 'Web' }));
}

function extractContent(raw) {
  return raw?.content && typeof raw.content === 'object' ? raw.content : (raw || {});
}

export async function imageDataUri() { return `data:image/jpeg;base64,${(await readFile(IMAGE_PATH)).toString('base64')}`; }


export function normalizeSimilar(raw, input) {
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.works) ? raw.works : []);
  return list.slice(0, 10).map((w, index) => ({
    title: String(w.title || ('Opera ' + (index + 1))).slice(0, 120),
    artist: String(w.artist || '').slice(0, 120),
    date: String(w.date || '').slice(0, 60),
    museum: String(w.museum || '').slice(0, 120),
    caption: String(w.caption || '').slice(0, 300),
    search: String(w.search || ((w.title || '') + ' ' + (w.artist || ''))).trim().slice(0, 160),
    imageStatus: 'pending'
  }));
}

export function buildSimilarPrompt(input) {
  const a = input.artwork || {};
  const level = input.learningLevel || 'Scuola secondaria';
  return `Sei uno storico dell\'arte italiano. Proponi 10 opere REALI e CELEBRI, di ogni epoca e paese, che condividono il soggetto dell\'opera in esame (stessa iconografia o stesso tema, in tutta la storia dell\'arte: dal Medioevo al Novecento, scuole diverse).

Opera in esame: ${a.title || ''}
Artista: ${a.artist || ''}
Data: ${a.date || ''}
Periodo: ${a.period || ''}
Tecnica: ${a.technique || ''}

Regole:
- SOLO opere reali e riconoscibili: più sono celebri, meglio è (perché devono avere una foto in pubblico dominio su Wikimedia Commons o al MET).
- Varietà: scegli autori, secoli e paesi diversi quando possibile.
- Per ogni opera restituisci:
  - "title": titolo (in italiano se noto, altrimenti quello internazionale)
  - "artist": autore
  - "date": data o periodo
  - "museum": museo o collezione che la conserva
  - "caption": perché è simile al soggetto dell\'opera in esame (max 25 parole, tono didattico)
  - "search": parole chiave per trovare l\'immagine (titolo originale + autore, in inglese se aiuta; es. "Annunciation Memling")
- Non inventare nulla: se non sei certo che un\'opera esista, sostituiscila con un\'altra.

Rispondi SOLO con JSON valido, senza markdown, nella forma:
{"works":[{"title":"...","artist":"...","date":"...","museum":"...","caption":"...","search":"..."}, ... 10 voci]}`;
}

// ---------- risoluzione immagini (Wikimedia Commons + MET, senza chiavi) ----------
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const MET_SEARCH_API = 'https://collectionapi.metmuseum.org/public/collection/v1/search';
const MET_OBJECT_API = 'https://collectionapi.metmuseum.org/public/collection/v1/objects/';
const IMAGE_UA = 'noesis-roads-didattico/1.0 (didactic app; contact: local)';

export async function resolveSimilarImage(work, fetchImpl = globalThis.fetch) {
  const query = String(work.search || `${work.title} ${work.artist}`).trim().slice(0, 120);
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search',
    gsrsearch: query, gsrnamespace: '6', gsrlimit: '3',
    prop: 'imageinfo', iiprop: 'url|mime', iiurlwidth: '640'
  });
  try {
    const resp = await fetchImpl(`${COMMONS_API}?${params.toString()}`, { headers: { 'User-Agent': IMAGE_UA } });
    if (resp.ok) {
      const data = await resp.json();
      const pages = (data?.query?.pages && typeof data.query.pages === 'object') ? Object.values(data.query.pages) : [];
      for (const page of pages) {
        const ii = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
        if (ii && ii.thumburl && (!ii.mime || ii.mime.startsWith('image/'))) {
          return { ...work, imageUrl: ii.thumburl, imagePage: ii.descriptionurl || '', imageStatus: 'ok' };
        }
      }
    }
  } catch {}
  try {
    const searchResp = await fetchImpl(`${MET_SEARCH_API}?${new URLSearchParams({ q: query, hasImages: 'true' })}`, { headers: { 'User-Agent': IMAGE_UA } });
    if (searchResp.ok) {
      const searchData = await searchResp.json();
      const objectId = Array.isArray(searchData?.objectIDs) ? searchData.objectIDs[0] : null;
      if (objectId) {
        const objResp = await fetchImpl(`${MET_OBJECT_API}${objectId}`, { headers: { 'User-Agent': IMAGE_UA } });
        if (objResp.ok) {
          const obj = await objResp.json();
          const url = obj.primaryImageSmall || obj.primaryImage;
          if (url) return { ...work, imageUrl: url, imagePage: `https://www.metmuseum.org/art/collection/search/${objectId}`, imageStatus: 'ok' };
        }
      }
    }
  } catch {}
  return { ...work, imageUrl: '', imagePage: '', imageStatus: 'missing' };
}

export async function resolveSimilarImages(works, fetchImpl = globalThis.fetch) {
  const out = [];
  for (const w of works) {
    out.push(await resolveSimilarImage(w, fetchImpl));
    await sleep(250);
  }
  return out;
}

export async function callOpenRouterSimilar(input, fetchImpl = globalThis.fetch) {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY non configurata');
  const raw = await callModel(TEXT_MODEL, [{ type: 'text', text: buildSimilarPrompt(input) }], apiKey, fetchImpl);
  const works = normalizeSimilar(raw.data, input);
  const resolved = await resolveSimilarImages(works, fetchImpl);
  return {
    status: 'completed',
    works: resolved,
    disclaimer: 'Opere e didascalie generate con intelligenza artificiale; immagini da Wikimedia Commons e dal Metropolitan Museum of Art (pubblico dominio). Verifica autore, data e collocazione prima dell\'uso didattico.'
  };
}

export function buildVisionPrompt(input) {
  const a = input.artwork || {};
  const s = input.selection || {};
  const h = input.hotspot || {};
  const coordinates = ['x', 'y', 'width', 'height'].map(k => s[k]).filter(v => v !== undefined).join(', ') || 'punto libero';
  return `Analizza visivamente l’opera per un educatore italiano. Opera: ${a.title || ''}; artista: ${a.artist || ''}; dettaglio: ${h.title || 'area selezionata'}; coordinate: ${coordinates}. Descrivi esclusivamente elementi osservabili e restituisci JSON valido con observation, visible_elements, colors, composition e uncertainty. Non inventare dati storici.`;
}

export function buildOverviewPrompt(input) {
  const a = input.artwork || {};
  const level = input.learningLevel || 'Scuola secondaria';
  const sources = (input.sources || []).map(s => `- ${s.title}: ${s.url}`).join('\n') || '- Nessuna fonte aggiuntiva';
  return `Sei uno storico dell’arte e un educatore italiano. Scrivi una presentazione storico-artistica dell’opera e del suo autore, pensata per studenti di livello ${level}, da mostrare in cima alla pagina prima dell’esplorazione dei dettagli.

Opera: ${a.title || ''}
Artista: ${a.artist || ''}
Data: ${a.date || ''}
Periodo: ${a.period || ''}
Tecnica: ${a.technique || ''}
Istituzione: ${a.institution || ''}
Collocazione: ${a.location || ''}

Fonti editoriali di riferimento (usa i fatti che riportano):
${sources}

Regole:
- Massimo 500 parole in totale: circa 250-300 per "painting" e 150-200 per "artist".
- "painting": presentazione storico-artistica del dipinto — soggetto, contesto e committenza, iconografia essenziale, caratteristiche stilistiche, perché è importante nella storia dell’arte.
- "artist": chi era l’artista, formazione e ambiente, tratti distintivi dello stile, ruolo nella storia dell’arte.
- Non inventare dati: usa solo fatti di cui sei ragionevolmente certo o presenti nelle fonti; se un dettaglio è incerto, omettilo.
- Scrivi in italiano chiaro e adatto a studenti di ${level}.
- Rispondi esclusivamente con JSON valido, senza markdown, nella forma: {"painting":"...","artist":"..."}`;
}
export function buildTextPrompt(input, visionResult) {
  const a = input.artwork || {};
  const h = input.hotspot || {};
  const detail = h.title || 'area selezionata';
  const advanced = String(input.learningLevel || '').toLowerCase().includes('approfondimento');
  const others = (Array.isArray(input.notableDetails) ? input.notableDetails : []).filter(d => d && d.title && d.title !== h.title);
  const notable = others.map(d => `- ${d.title}${d.category ? ` (${d.category})` : ''}${d.short ? `: ${d.short}` : ''}`).join('\n') || '- Nessun altro dettaglio notevole è disponibile.';
  const comparisonRule = advanced
    ? '"comparisons" (OBBLIGATORIO al livello Approfondimento): confronta QUESTO dettaglio con 1-2 altre opere REALI che conosci (stesso soggetto, stesso artista o stesso contesto). Cita solo opere esistenti e verificate dalla tua conoscenza: titolo, autore, periodo, luogo. Spiega in cosa il confronto aiuta a capire il dettaglio. Se non trovi un confronto valido, scegli il più vicino e spiega perché.'
    : '"comparisons": NON INCLUDERE questo campo per il livello Scuola secondaria.';
  const openRule = advanced
    ? '"openQuestions" (OBBLIGATORIO al livello Approfondimento): segnala 1-2 questioni aperte o dibattute dagli studiosi su QUESTO dettaglio o sull’opera (iconografia, attribuzione, interpretazione, stato di conservazione). Scrivi almeno una questione.'
    : '"openQuestions": NON INCLUDERE questo campo per il livello Scuola secondaria.';
  const techniqueRule = advanced
    ? '"technique" (OBBLIGATORIO al livello Approfondimento, 60-90 parole): spiega COME è dipinto QUESTO dettaglio — materia e tecnica pittorica: tratto e pennellata, impasto o velature, uso del colore e delle campiture, luci, ombre e contrasti, zone di colore, dorature o vernici, e i materiali del supporto (tela, tavola, intonaco, pigmenti). Descrivi prima ciò che è osservabile nel dettaglio, poi integra con quanto sai della tecnica dell\'opera e dell\'artista (es. affresco, tempera su tavola, olio su tela).'
    : '"technique": NON INCLUDERE questo campo per il livello Scuola secondaria.';
  const lookAgainRule = '"lookAgain" (OBBLIGATORIO, una sola frase, max 20 parole): chiudi il ciclo didattico con un invito a guardare ancora l\'immagine, puntando su UN elemento visivo specifico legato a QUESTO dettaglio (es. "dove cade la luce sulle ali?"). Deve spingere lo studente a tornare all\'immagine, non a leggere.';
  const example = advanced
    ? '{"observation":"...","meaning":"...","relation":"...","curiosity":"...","comparisons":"...","openQuestions":"...","technique":"...","lookAgain":"...","confidence":{"level":"high|medium|low","label":"..."}}'
    : '{"observation":"...","meaning":"...","relation":"...","curiosity":"...","lookAgain":"...","confidence":{"level":"high|medium|low","label":"..."}}';
  return `Sei un educatore d’arte italiano che spiega a uno studente di livello ${input.learningLevel || 'Scuola secondaria'} il dettaglio selezionato di un’opera.

IMPORTANTE: la presentazione storico-artistica generale dell’opera e dell’artista (contesto storico, biografia, epoca, tecnica) è GIÀ mostrata in cima alla pagina. NON ripeterla: occupati esclusivamente del dettaglio selezionato.

Opera: ${a.title || ''}; artista: ${a.artist || ''}.
Dettaglio selezionato: ${detail}.
Osservazione visiva del dettaglio (dall’analisi dell’immagine): ${JSON.stringify(visionResult)}.

Altri dettagli notevoli dell’opera a cui puoi fare riferimento nei collegamenti:
${notable}

Rispondi con UN SOLO oggetto JSON valido, senza markdown né testo fuori dall’oggetto. La risposta deve contenere TUTTI i campi elencati qui sotto, in questo ordine:
1. "observation" (OBBLIGATORIO, 60-90 parole): descrizione visuale del dettaglio — ciò che si vede davvero (forme, colori, gesti, materiali, luce).
2. "meaning" (OBBLIGATORIO, 60-90 parole): descrizione concettuale del dettaglio da solo — cosa rappresenta, che significato ha, perché l’artista lo ha inserito.
3. "relation" (OBBLIGATORIO, 60-90 parole): come il dettaglio si relaziona agli altri dettagli notevoli dell’opera elencati sopra — cita almeno uno di questi dettagli per nome e spiega il legame visivo, simbolico o narrativo.
4. "curiosity" (OPZIONALE a ogni livello): solo se hai una curiosità breve, verificabile e SPECIFICA di QUESTO dettaglio (mai sull’opera o sull’artista in generale). Se non ne hai una di cui sei ragionevolmente certo, usa esattamente la stringa vuota: "".
   Anche "lookAgain" (vedi campo 8) è sempre richiesto: è l’invito finale a tornare a guardare l’immagine.
5. ${comparisonRule}
6. ${openRule}
7. ${techniqueRule}
8. ${lookAgainRule}

Aggiungi sempre anche "confidence": {"level":"high|medium|low","label":"..."}.

Esempio della forma JSON richiesta:
${example}

Non inventare nulla: fonda il testo su ciò che è osservabile e su fatti di cui sei ragionevolmente certo; in caso di dubbio indica una confidenza più bassa.`;
}

// Rate limit globale: i modelli contributor di OpenRouter hanno 30 richieste/min.
// Tutte le chiamate passano da qui -> semaforo a finestra scorrevole (default 26/min, sotto la soglia).
// Consente di parallelizzare in sicurezza la generazione (noesis-roads-creator) senza incappare nel 429.
const OPENROUTER_RPM = Math.max(1, Number(process.env.OPENROUTER_RPM || 26));
const callTimestamps = [];
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function acquireRateSlot() {
  for (;;) {
    const now = Date.now();
    while (callTimestamps.length && callTimestamps[0] <= now - 60000) callTimestamps.shift();
    if (callTimestamps.length < OPENROUTER_RPM) { callTimestamps.push(now); return; }
    await sleep(Math.max(250, callTimestamps[0] + 60000 - now));
  }
}

// Timeout per singola chiamata: senza, un socket appeso blocca la pipeline per sempre.
// Lo scadere abortisce la fetch -> errore -> backoff + retry nel ciclo sotto.
const MODEL_TIMEOUT_MS = Math.max(10000, Number(process.env.OPENROUTER_TIMEOUT_MS || 120000));
export async function callModel(model, content, apiKey, fetchImpl = globalThis.fetch, opts = {}) {
  const messages = opts.system
    ? [{ role: 'system', content: opts.system }, { role: 'user', content }]
    : [{ role: 'user', content }];
  const body = { model, messages, temperature: 0.2, top_p: 0.7, max_tokens: opts.maxTokens || 8000, stream: false };
  if (webSearchEnabled()) body.plugins = [{ id: 'web', max_results: 5 }];
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json', 'HTTP-Referer': 'http://127.0.0.1:18000', 'X-Title': 'Noesis Roads Schede didattiche' };
  let response = null;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await acquireRateSlot();
    try {
      response = await fetchImpl(OPENROUTER_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(MODEL_TIMEOUT_MS) });
      if (response.status !== 429) break;
      lastError = new Error('Limite temporaneo di OpenRouter raggiunto');
    } catch (e) { lastError = e; }
    if (attempt < 2) await sleep(2500 * (attempt + 1)); // backoff su 429 / errore di rete
  }
  if (!response) throw lastError || new Error('Errore di rete verso OpenRouter');
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { if (response.status === 401 || response.status === 403) throw new Error('La chiave OpenRouter non è valida o non è autorizzata'); if (response.status === 429) throw new Error('Limite temporaneo di OpenRouter raggiunto'); throw new Error(`OpenRouter ha rifiutato la richiesta (${response.status})`); }
  const message = payload?.choices?.[0]?.message;
  const text = Array.isArray(message?.content) ? message.content.map(part => part.text || '').join('\n') : message?.content;
  const annotations = Array.isArray(message?.annotations) ? message.annotations : [];
  const citations = annotations.filter(a => a && a.type === 'url_citation' && a.url_citation && a.url_citation.url).map(a => ({ title: a.url_citation.title || '', url: a.url_citation.url }));
  // Formato Sonar/Perplexity: array di URL in message.citations o a livello choice.
  const sonarLists = [message?.citations, payload?.choices?.[0]?.citations].filter(Array.isArray);
  for (const list of sonarLists) {
    for (const u of list) {
      const url = typeof u === 'string' ? u : (u && u.url);
      if (url && !citations.some((c) => c.url === url)) citations.push({ title: '', url });
    }
  }
  return { data: cleanModelJson(text), citations };
}

export async function callOpenRouter(input, fetchImpl = globalThis.fetch) {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY non configurata');
  const image = await imageDataUri();
  const content = [{ type: 'text', text: buildVisionPrompt(input) }, { type: 'image_url', image_url: { url: image } }];
  if (input.selectionImage) content.push({ type: 'text', text: 'La seconda immagine è il crop esatto della regione selezionata.' }, { type: 'image_url', image_url: { url: input.selectionImage } });
  const vision = await callModel(VISION_MODEL, content, apiKey, fetchImpl);
  const explanation = await callModel(TEXT_MODEL, [{ type: 'text', text: buildTextPrompt(input, vision.data) }], apiKey, fetchImpl);
  return normalizeAnalysis(explanation.data, input, explanation.citations);
}

export async function callOpenRouterOverview(input, fetchImpl = globalThis.fetch) {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY non configurata');
  const overview = await callModel(TEXT_MODEL, [{ type: 'text', text: buildOverviewPrompt(input) }], apiKey, fetchImpl);
  return normalizeOverview(overview.data, input, overview.citations);
}
export const callNvidia = callOpenRouter;
function json(res, status, payload) { const data = Buffer.from(JSON.stringify(payload)); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(data); }
function error(code, message, retryable = false) { return { error: { code, message, retryable } }; }

// ---------------------------------------------------------------------------
// Libreria e schede pubblicate: lettura (read-only) del DB di noesis-roads-creator.
// ---------------------------------------------------------------------------
function catalogSubject(s) {
  return {
    cardType: 'subject',
    id: s.id,
    title: s.name || 'Soggetto',
    name: s.name || '',
    shortDesc: s.shortDesc || '',
    image: null,
    fallbackImage: null,
    period: 'Soggetto nella storia dell’arte',
    featured: false
  };
}
function catalogComparison(c) {
  return {
    cardType: 'comparison',
    id: c.id,
    title: c.title || 'Confronto',
    comparisonType: c.comparisonType || 'same-subject',
    hasThumb: Boolean(c.hasThumb),
    image: c.hasThumb ? '/api/comparisons/' + c.id + '/thumb' : null,
    fallbackImage: null,
    period: 'Faccia a faccia',
    featured: false
  };
}
function dbSubjectPayload(id) {
  const full = getSubjectRO(id);
  if (!full) return null;
  let symbols = [];
  try { symbols = JSON.parse(full.symbols || '[]'); } catch (e) { symbols = []; }
  return {
    cardType: 'subject',
    id: full.id,
    name: full.name || '',
    shortDesc: full.shortDesc || '',
    intro: full.intro || '',
    origins: full.origins || '',
    symbols: Array.isArray(symbols) ? symbols : [],
    interpretations: full.interpretations || '',
    curiosities: full.curiosities || '',
    chapters: (full.chapters || []).map(c => ({ era: c.era, text: c.text })),
    works: (full.works || []).map(w => ({
      id: w.id, title: w.title, artist: w.artist, date: w.date, museum: w.museum,
      caption: w.caption,
      imageUrl: w.hasImage ? '/api/subjects/' + full.id + '/works/' + w.id + '/image' : null,
      sourceUrl: w.imagePage || w.imageUrl || null,
      imageStatus: w.imageStatus
    }))
  };
}
function dbComparisonPayload(id) {
  const full = getComparisonRO(id);
  if (!full) return null;
  return {
    cardType: 'comparison',
    id: full.id,
    title: full.title || 'Confronto',
    comparisonType: full.comparisonType || 'same-subject',
    intro: full.intro || '',
    technique: full.technique || '',
    context: full.context || '',
    critique: full.critique || '',
    curiosities: full.curiosities || '',
    hasThumb: Boolean(full.hasThumb),
    thumbUrl: full.hasThumb ? '/api/comparisons/' + full.id + '/thumb' : null,
    sides: (full.sides || []).map(s => {
      const out = {
        side: s.side, source: s.source, title: s.title || '', artist: s.artist || '',
        date: s.date || '', museum: s.museum || '', imageStatus: s.imageStatus || 'missing',
        imageUrl: null
      };
      if (s.source === 'library' && s.artworkId) out.imageUrl = '/api/artworks/' + s.artworkId + '/image';
      else if (s.hasImage) out.imageUrl = '/api/comparisons/' + full.id + '/side/' + s.side + '/image';
      else out.imageUrl = s.imageUrl || null;
      return out;
    }),
    points: (full.points || []).map(p => ({ kind: p.kind, title: p.title, text: p.text }))
  };
}
function catalogScheda(s) {
  const schema = (s.modello && s.modello.schema) || {};
  const imgs = Array.isArray(s.immagini) ? s.immagini : [];
  const imgKeys = ((schema.sections || []).filter((d) => d.type === 'image')).map((d) => d.key);
  const cover = imgs.find((m) => imgKeys.includes(m.ruolo)) || imgs[0] || null;
  return {
    cardType: 'scheda',
    id: s.id,
    title: s.titolo || 'Scheda senza titolo',
    materiaId: schema.subject || '',
    modelloKey: schema.key || '',
    subtitle: [schema.subject, schema.name].filter(Boolean).join(' · '),
    image: cover ? ('/api/cards/' + s.id + '/images/' + cover.id) : null,
    fallbackImage: null,
    period: (schema.cover && schema.cover.eyebrow) || 'Scheda didattica',
    featured: false
  };
}
function dbSchedaPayload(id) {
  const full = getSchedaFullRO(id);
  if (!full || full.stato !== 'ready') return null;
  // Il viewer mostra solo le sezioni attive della scheda (null = tutte).
  const att = full.sezioniAttive;
  const sezioni = att ? (full.sezioni || []).filter((s) => att.includes(s.chiave)) : (full.sezioni || []);
  const modello = full.modello ? {
    ...full.modello,
    schema: { ...(full.modello.schema || {}), sections: ((full.modello.schema || {}).sections || []).filter((d) => !att || att.includes(d.key)) },
  } : full.modello;
  return {
    cardType: 'scheda',
    id: full.id,
    titolo: full.titolo,
    stato: full.stato,
    verbosita: full.verbosita,
    istruzione: full.istruzione,
    modello,
    sezioni,
    verifiche: (full.verifiche || []).map((v) => {
      const acc = new Set(v.accettati || []);
      return { chiave: v.chiave, dubbi: (v.esiti || []).filter((e) => e.esito !== 'confermata' && !acc.has(e.affermazione)).length, fonti: (v.fonti || []).slice(0, 6), updatedAt: v.updatedAt };
    }),
    immagini: (full.immagini || []).map((m) => ({ ...m, url: '/api/cards/' + full.id + '/images/' + m.id }))
  };
}
const execFileAsync = promisify(execFile);
const PDF_CWD = join(ROOT, 'noesis-roads-creator');

function slugify(text) {
  const base = String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'scheda-' + Date.now();
}

// Forme "full" come dal creator (getFullArtwork/getFullSubject/getFullComparison),
// ricostruite in sola lettura: i builder PDF condivisi restano invariati.
function artworkFullRO(id) {
  const ready = listReadyArtworksRO().find((x) => x.id === id);
  if (!ready) return null;
  return {
    ...ready,
    overview: getOverviewRO(id),
    details: listDetailsRO(id).map((d) => ({
      ...d,
      tabs: { studio: getDetailContentRO(d.id, 'studio'), approfondimento: getDetailContentRO(d.id, 'approfondimento') },
    })),
    sources: listSourcesRO(id),
    similarWorks: listSimilarWorksRO(id),
  };
}
function pdfIoRO() {
  return {
    imageData: getArtworkImageDataRO,
    similarImage: getSimilarImageRO,
    subjectWorkImage: getSubjectWorkImageRO,
    artworkImageData: getArtworkImageDataRO,
    comparisonSideImage: getComparisonSideImageRO,
    comparisonThumb: getComparisonThumbRO,
    getImmagine: getImmagineRO,
  };
}
async function renderPdf(payload) {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const inPath = join(tmpdir(), `noesis-pdf-${stamp}.json`);
  const outPath = join(tmpdir(), `noesis-pdf-${stamp}.pdf`);
  await writeFile(inPath, JSON.stringify(payload));
  try {
    try {
      await execFileAsync('python3', ['make_pdf.py', inPath, outPath], { cwd: PDF_CWD, timeout: 120000 });
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
  return renderPdf(payload).then((buf) => {
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': buf.length,
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(buf);
  }).catch((e) => {
    const message = String((e && e.message) || e);
    json(res, message.includes('reportlab') ? 503 : 500, error('PDF_ERROR', message));
  });
}
const PDF_GATE = 'Genera e salva prima i contenuti: il PDF esporta la scheda completa.';

function catalogArtwork(a) {
  return {
    id: a.id,
    title: a.title || '',
    artist: a.artist || '',
    date: a.date || '',
    period: a.period || '',
    technique: a.technique || '',
    institution: a.institution || '',
    location: a.location || '',
    imageWidth: a.imageWidth || 0,
    imageHeight: a.imageHeight || 0,
    featured: false,
    image: '/api/artworks/' + a.id + '/image',
    fallbackImage: '/api/artworks/' + a.id + '/image'
  };
}

function normalizeStoredRow(row) {
  if (!row) return null;
  const c = row.content || {};
  return {
    observation: String(c.observation || '').trim(),
    meaning: String(c.meaning || '').trim(),
    relation: String(c.relation || '').trim(),
    curiosity: String(c.curiosity || '').trim(),
    comparisons: String(c.comparisons || '').trim(),
    openQuestions: String(c.openQuestions || '').trim(),
    technique: String(c.technique || '').trim(),
    lookAgain: stripLookAgainPrefix(String(c.lookAgain || '').trim())
  };
}

function dbArtworkPayload(id) {
  const ready = listReadyArtworksRO().find(a => a.id === id);
  if (!ready) return null;
  const images = getArtworkImageDataRO(id);
  if (!images) return null;
  const overviewRow = getOverviewRO(id);
  const details = listDetailsRO(id);
  const similar = listSimilarWorksRO(id);
  const sources = listSourcesRO(id);
  const hotspots = details.map(detail => {
    const studio = getDetailContentRO(detail.id, 'studio');
    const approfondimento = getDetailContentRO(detail.id, 'approfondimento');
    return {
      id: String(detail.id),
      title: detail.title,
      category: detail.category,
      region: detail.region,
      short: String(studio && studio.content && studio.content.observation ? studio.content.observation.slice(0, 110) : ''),
      insight: String(approfondimento && approfondimento.content && approfondimento.content.technique ? approfondimento.content.technique.slice(0, 140) : ''),
      studio: normalizeStoredRow(studio),
      approfondimento: normalizeStoredRow(approfondimento)
    };
  });
  return Object.assign({}, catalogArtwork(ready), {
    image: '/api/artworks/' + id + '/image',
    fallbackImage: '/api/artworks/' + id + '/image',
    hasAnnotated: Boolean(images.annotated),
    annotatedImageUrl: images.annotated ? '/api/artworks/' + id + '/image-annotated' : null,
    description: (overviewRow && overviewRow.painting ? overviewRow.painting.slice(0, 300) : '') || (ready.title ? 'Esplora «' + ready.title + '» dettaglio per dettaglio.' : ''),
    alt: ready.title ? (ready.artist ? ready.artist + ', ' : '') + ready.title : 'Opera d’arte',
    rights: 'Scheda didattica generata con intelligenza artificiale (noesis-roads-creator). Immagine per uso didattico; verifica i diritti prima di un uso pubblico.',
    featured: true,
    levels: ['Scuola secondaria', 'Approfondimento'],
    hotspots,
    overview: overviewRow ? { painting: overviewRow.painting || '', artist: overviewRow.artist || '' } : null,
    sources: sources.map(s => ({ title: s.title, url: s.url, type: s.type })),
    details: hotspots,
    similarWorks: similar.map(s => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      date: s.date,
      museum: s.museum,
      caption: s.caption,
      imageUrl: s.hasImage ? '/api/artworks/' + id + '/similar/' + s.id + '/image' : null,
      sourceUrl: s.imagePage || s.imageUrl,
      imageStatus: s.imageStatus
    }))
  });
}

function sendImage(res, img) {
  if (!img) return json(res, 404, error('NOT_FOUND', 'Immagine non disponibile'));
  const buf = Buffer.from(img.data);
  res.writeHead(200, { 'Content-Type': img.mime || 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
  res.end(buf);
}

async function serveStatic(req, res) { const pathname = new URL(req.url, 'http://localhost').pathname; const requestPath = pathname === '/' ? '/index.html' : pathname; const filePath = resolve(ROOT, `.${normalize(requestPath)}`); if (!filePath.startsWith(ROOT)) return (res.writeHead(403), res.end('Forbidden')); try { const info = await stat(filePath); if (!info.isFile()) throw new Error(); const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jsx': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg' }; res.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(await readFile(filePath)); } catch { res.writeHead(404); res.end('Not Found'); } }
export function createAppServer() { return createServer((req, res) => { if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(); return; }

    // ---------- scheda pubblicata da noesis-roads-creator (sola lettura dal DB SQLite) ----------
    if (req.method === 'GET' && req.url === '/api/library') {
      let artworks = [], subjects = [], comparisons = [], schede = [];
      try { artworks = listReadyArtworksRO().map(catalogArtwork); } catch (e) {}
      try { subjects = listReadySubjectsRO().map(catalogSubject); } catch (e) {}
      try { comparisons = listReadyComparisonsRO().map(catalogComparison); } catch (e) {}
      try {
        schede = listReadySchedeRO()
          .map((s) => getSchedaFullRO(s.id))
          .filter(Boolean)
          .map(catalogScheda);
      } catch (e) {}
      return json(res, 200, { artworks, subjects, comparisons, cards: schede, source: 'noesis-roads-creator' });
    }
    // ---------- nucleo generico (sola lettura) ----------
    if (req.method === 'GET' && req.url === '/api/materie') {
      let materie = [];
      try { materie = listMaterieRO(); } catch (e) {}
      return json(res, 200, { materie });
    }
    if (req.method === 'GET' && req.url && /^\/api\/models(\?.*)?$/.test(req.url)) {
      const subject = new URL(req.url, 'http://localhost').searchParams.get('subject') || '';
      if (!subject) return json(res, 400, error('INVALID_REQUEST', 'Parametro subject obbligatorio'));
      let models = [];
      try { models = listModelliRO(subject); } catch (e) {}
      return json(res, 200, { models });
    }
    if (req.method === 'GET' && req.url && /^\/api\/cards\/[^/]+$/.test(req.url)) {
      const id = decodeURIComponent(req.url.split('/')[3]);
      let payload = null;
      try { payload = dbSchedaPayload(id); } catch (e) {}
      if (!payload) return json(res, 404, error('NOT_FOUND', 'Scheda non trovata: pubblica la scheda da noesis-roads-creator'));
      return json(res, 200, payload);
    }
    if (req.method === 'GET' && req.url && /^\/api\/cards\/[^/]+\/images\/\d+$/.test(req.url)) {
      const parts = req.url.split('/');
      let img = null;
      try {
        img = getImmagineRO(Number(parts[5]));
        if (img && String(img.schedaId) !== decodeURIComponent(parts[3])) img = null;
      } catch (e) {}
      return sendImage(res, img);
    }
    // ---------- PDF schede in sola lettura (stessi builder del creator) ----------
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url && /^\/api\/artworks\/[^/]+\/pdf$/.test(req.url)) {
      const id = decodeURIComponent(req.url.split('/')[3]);
      let full = null;
      try { full = artworkFullRO(id); } catch (e) {}
      if (!full) return json(res, 404, error('NOT_FOUND', 'Scheda non trovata: pubblica l’opera da noesis-roads-creator'));
      if (!full.overview && !(full.details || []).length) return json(res, 400, error('EMPTY_CARD', PDF_GATE));
      return sendPdf(res, buildArtworkPdfPayload(full, pdfIoRO()), slugify(full.title || 'opera') + '.pdf');
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url && /^\/api\/subjects\/[^/]+\/pdf$/.test(req.url)) {
      const id = decodeURIComponent(req.url.split('/')[3]);
      let full = null;
      try { full = getSubjectRO(id); } catch (e) {}
      if (!full) return json(res, 404, error('NOT_FOUND', 'Soggetto non trovato: pubblica la scheda da noesis-roads-creator'));
      if (!full.intro && !full.origins && !(full.chapters || []).length) return json(res, 400, error('EMPTY_CARD', PDF_GATE));
      return sendPdf(res, buildSubjectPdfPayload(full, pdfIoRO()), slugify(full.name || 'soggetto') + '.pdf');
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url && /^\/api\/comparisons\/[^/]+\/pdf$/.test(req.url)) {
      const id = decodeURIComponent(req.url.split('/')[3]);
      let full = null;
      try { full = getComparisonRO(id); } catch (e) {}
      if (!full) return json(res, 404, error('NOT_FOUND', 'Confronto non trovato: pubblica la scheda da noesis-roads-creator'));
      if (!full.intro && !(full.points || []).length) return json(res, 400, error('EMPTY_CARD', PDF_GATE));
      return sendPdf(res, buildComparisonPdfPayload(full, pdfIoRO()), slugify(full.title || 'confronto') + '.pdf');
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url && /^\/api\/cards\/[^/]+\/pdf$/.test(req.url)) {
      const id = decodeURIComponent(req.url.split('/')[3]);
      let full = null;
      try { full = getSchedaFullRO(id); } catch (e) {}
      if (!full || full.stato !== 'ready') return json(res, 404, error('NOT_FOUND', 'Scheda non trovata: pubblica la scheda da noesis-roads-creator'));
      if (!(full.sezioni || []).length) return json(res, 400, error('EMPTY_CARD', PDF_GATE));
      return sendPdf(res, buildGenericPdfPayload(full, pdfIoRO()), slugify(full.titolo || 'scheda') + '.pdf');
    }
    if (req.method === 'GET' && req.url && /^\/api\/subjects\/[^/]+$/.test(req.url)) {
      let payload = null;
      try { payload = dbSubjectPayload(decodeURIComponent(req.url.split('/')[3])); } catch (e) {}
      if (!payload) return json(res, 404, error('NOT_FOUND', 'Soggetto non trovato: pubblica la scheda da noesis-roads-creator'));
      return json(res, 200, payload);
    }
    if (req.method === 'GET' && req.url && /^\/api\/subjects\/[^/]+\/works\/\d+\/image$/.test(req.url)) {
      const parts = req.url.split('/');
      let img = null;
      try { img = getSubjectWorkImageRO(decodeURIComponent(parts[3]), Number(parts[5])); } catch (e) {}
      return sendImage(res, img);
    }
    if (req.method === 'GET' && req.url && /^\/api\/comparisons\/[^/]+$/.test(req.url)) {
      let payload = null;
      try { payload = dbComparisonPayload(decodeURIComponent(req.url.split('/')[3])); } catch (e) {}
      if (!payload) return json(res, 404, error('NOT_FOUND', 'Confronto non trovato: pubblica la scheda da noesis-roads-creator'));
      return json(res, 200, payload);
    }
    if (req.method === 'GET' && req.url && /^\/api\/comparisons\/[^/]+\/thumb$/.test(req.url)) {
      let img = null;
      try { img = getComparisonThumbRO(decodeURIComponent(req.url.split('/')[3])); } catch (e) {}
      return sendImage(res, img);
    }
    if (req.method === 'GET' && req.url && /^\/api\/comparisons\/[^/]+\/side\/(a|b)\/image$/.test(req.url)) {
      const parts = req.url.split('/');
      let img = null;
      try { img = getComparisonSideImageRO(decodeURIComponent(parts[3]), parts[5]); } catch (e) {}
      return sendImage(res, img);
    }
    const artworkMatch = req.method === 'GET' && req.url && req.url.match(/^\/api\/artworks\/([^/]+)\/image-annotated$/);
    const imageMatch = req.method === 'GET' && req.url && req.url.match(/^\/api\/artworks\/([^/]+)\/image$/);
    const similarMatch = req.method === 'GET' && req.url && req.url.match(/^\/api\/artworks\/([^/]+)\/similar\/(\d+)\/image$/);
    if (req.method === 'GET' && req.url && /^\/api\/artworks\/[^/]+$/.test(req.url)) {
      const id = decodeURIComponent(req.url.split('/')[3]);
      let payload = null;
      try { payload = dbArtworkPayload(id); } catch (e) {}
      if (!payload) return json(res, 404, error('NOT_FOUND', 'Scheda non trovata: pubblica l’opera da noesis-roads-creator'));
      return json(res, 200, payload);
    }
    if (similarMatch) {
      let img = null;
      try { img = getSimilarImageRO(decodeURIComponent(similarMatch[1]), Number(similarMatch[2])); } catch (e) {}
      return sendImage(res, img);
    }
    if (imageMatch) {
      let img = null;
      try { img = getArtworkImageDataRO(decodeURIComponent(imageMatch[1])); } catch (e) {}
      return sendImage(res, img && img.clean);
    }
    if (artworkMatch) {
      let img = null;
      try { img = getArtworkImageDataRO(decodeURIComponent(artworkMatch[1])); } catch (e) {}
      return sendImage(res, img && img.annotated);
    }

    if (req.method === 'GET' && req.url === '/api/status') return json(res, 200, { configured: Boolean(getOpenRouterApiKey()), visionModel: VISION_MODEL, textModel: TEXT_MODEL }); if (req.method === 'POST' && (req.url === '/api/overview' || req.url === '/api/analyze' || req.url === '/api/similar')) { let body = ''; let tooLarge = false; req.on('data', chunk => { body += chunk; if (Buffer.byteLength(body) > 2 * 1024 * 1024) tooLarge = true; }); req.on('end', async () => { if (tooLarge) return json(res, 413, error('PAYLOAD_TOO_LARGE', 'Richiesta non valida o troppo grande')); try { const input = JSON.parse(body); if (!input.artwork) return json(res, 400, error('INVALID_REQUEST', 'Opera e selezione sono obbligatorie')); if (req.url === '/api/overview') return json(res, 200, await callOpenRouterOverview(input));
    if (req.url === '/api/similar') return json(res, 200, await callOpenRouterSimilar(input)); if (!input.selection) return json(res, 400, error('INVALID_REQUEST', 'Opera e selezione sono obbligatorie')); return json(res, 200, await callOpenRouter(input)); } catch (err) { const message = err.message || 'Errore interno durante l’analisi'; if (message.includes('OPENROUTER_API_KEY')) return json(res, 503, error('OPENROUTER_NOT_CONFIGURED', message)); if (message.includes('non è valida') || message.includes('rifiutato') || message.includes('Limite')) return json(res, 502, error('OPENROUTER_ERROR', message, true)); return json(res, 500, error('INTERNAL_ERROR', message, true)); } }); return; } if (req.method === 'GET') return serveStatic(req, res); json(res, 404, error('NOT_FOUND', 'Endpoint non trovato')); }); }
if (process.argv[1] === fileURLToPath(import.meta.url)) createAppServer().listen(PORT, HOST, () => { console.log(`Noesis Roads (viewer): http://${HOST}:${PORT}`); console.log(`Modello visione: ${VISION_MODEL}`); console.log(`Modello testo: ${TEXT_MODEL}`); console.log(getOpenRouterApiKey() ? 'OpenRouter API key: configurata' : 'OpenRouter API key: non configurata'); });
