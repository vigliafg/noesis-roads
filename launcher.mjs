// Noesis Roads — launcher: hub + supervisore dei due server (zero dipendenze).
//
// Uso: node launcher.mjs
//   Avvia subito viewer (noesis-roads) e creator (noesis-roads-creator) come processi figli
//   e serve l'hub su NOESIS_HUB_PORT (default 18080): due grossi bottoni
//   ("Vedi le schede" / "Crea le schede") + ⚙️ Opzioni
//   (chiave API, modelli, porte) che riscrive .env.local e riavvia i figli.
//
// Porte di default (banda 18xxx, fuori dalla affollata 80xx):
//   hub 18080 · viewer APP_PORT=18000 · creator NOESIS_CREATOR_PORT=18100
import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const DEFAULTS = Object.freeze({ hubPort: 18080, viewerPort: 18000, creatorPort: 18100 });

// Mappa campo del pannello Opzioni -> variabile d'ambiente su .env.local
export const CONFIG_FIELDS = Object.freeze({
  apiKey: 'OPENROUTER_API_KEY',
  endpoint: 'OPENROUTER_ENDPOINT',
  visionModel: 'OPENROUTER_VISION_MODEL',
  textModel: 'OPENROUTER_TEXT_MODEL',
  webSearch: 'OPENROUTER_WEB_SEARCH',
  host: 'APP_HOST',
  viewerPort: 'APP_PORT',
  creatorPort: 'NOESIS_CREATOR_PORT',
  hubPort: 'NOESIS_HUB_PORT',
  creatorDb: 'NOESIS_CREATOR_DB',
  rpm: 'OPENROUTER_RPM'
});

export function loadLocalEnv(root = ROOT, env = process.env) {
  for (const filename of ['.env.local', '.env']) {
    try {
      const text = readFileSync(join(root, filename), 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
        if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
      }
    } catch {}
  }
  return env;
}

// Config effettiva (mai valori segreti: solo flag apiKeyConfigured)
export function effectiveConfig(env = process.env) {
  return {
    apiKeyConfigured: Boolean((env.OPENROUTER_API_KEY || '').trim()),
    endpoint: env.OPENROUTER_ENDPOINT || 'https://openrouter.ai/api/v1/chat/completions',
    visionModel: env.OPENROUTER_VISION_MODEL || 'meta/muse-spark-1.3-contributor',
    textModel: env.OPENROUTER_TEXT_MODEL || 'meta/muse-spark-1.3-contributor',
    webSearch: String(env.OPENROUTER_WEB_SEARCH || 'false').trim().toLowerCase() === 'true',
    host: env.APP_HOST || '127.0.0.1',
    viewerPort: Number(env.APP_PORT || DEFAULTS.viewerPort),
    creatorPort: Number(env.NOESIS_CREATOR_PORT || env.ARTEST_CREATOR_PORT || DEFAULTS.creatorPort),
    hubPort: Number(env.NOESIS_HUB_PORT || env.ARTEST_HUB_PORT || DEFAULTS.hubPort),
    creatorDb: env.NOESIS_CREATOR_DB || env.ARTEST_CREATOR_DB || '',
    rpm: Number(env.OPENROUTER_RPM || 26),
    lanExposed: (env.APP_HOST || '127.0.0.1') === '0.0.0.0'
  };
}

// Scrive patch { campoPannello: valore } su file env preservando le righe
// sconosciute. Valore ''/null/undefined -> riga rimossa (vale per la chiave).
export function writeEnvFile(path, patch) {
  const wanted = {};
  for (const [field, value] of Object.entries(patch || {})) {
    const name = CONFIG_FIELDS[field];
    if (!name) continue;
    wanted[name] = value === true ? 'true' : value === false ? 'false' : String(value ?? '');
  }
  let lines = [];
  try { lines = readFileSync(path, 'utf8').split(/\r?\n/); } catch {}
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=/);
    const name = match && match[1];
    if (name && name in wanted) {
      seen.add(name);
      if (wanted[name] !== '') out.push(`${name}=${wanted[name]}`);
    } else if (line.trim() !== '' || out.length === 0) {
      out.push(line);
    }
  }
  for (const [name, value] of Object.entries(wanted)) {
    if (!seen.has(name) && value !== '') out.push(`${name}=${value}`);
  }
  writeFileSync(path, out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n');
}

export function validateConfig(patch) {
  const errors = [];
  const ports = {};
  for (const field of ['viewerPort', 'creatorPort', 'hubPort']) {
    if (patch[field] === undefined || patch[field] === '') continue;
    const n = Number(patch[field]);
    if (!Number.isInteger(n) || n < 1024 || n > 65535) errors.push(`Porta ${field} non valida (1024-65535)`);
    else ports[field] = n;
  }
  if (new Set(Object.values(ports)).size !== Object.values(ports).length) errors.push('Le tre porte devono essere diverse tra loro');
  if (patch.endpoint !== undefined && patch.endpoint !== '' && !/^https?:\/\//.test(String(patch.endpoint))) errors.push('Endpoint non valido (deve iniziare con http)');
  for (const field of ['visionModel', 'textModel']) {
    if (patch[field] !== undefined && String(patch[field]).trim() === '') errors.push(`Campo ${field} vuoto`);
  }
  if (patch.rpm !== undefined && patch.rpm !== '' && (!Number.isInteger(Number(patch.rpm)) || Number(patch.rpm) < 1)) errors.push('RPM non valido');
  return errors;
}

function sendJson(res, status, payload) {
  const data = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(data);
}

async function probeStatus(port, timeoutMs = 2000) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch { return false; }
}

// ---------- pagina hub (stesso design system di viewer/creator) ----------
export function hubPage(cfg) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Noesis Roads · Hub</title>
<style>
:root{--ink:#17344a;--muted:#6b7a83;--paper:#f6f3ee;--white:#fffdf9;--line:#dedbd3;--coral:#dc7056;--mustard:#e2ac44;--green:#628f80;font-family:'DM Sans',Arial,sans-serif;color:var(--ink);background:var(--paper)}
*{box-sizing:border-box}body{margin:0;background:var(--paper)}
h1,h2{font-family:'Playfair Display',Georgia,serif;letter-spacing:-.04em}
.wrap{max-width:860px;margin:0 auto;padding:0 22px 60px}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:22px 0;border-bottom:1px solid var(--line);margin-bottom:26px}
.brand{display:flex;align-items:center;gap:10px;font-size:19px;font-weight:700}
.brand-mark{display:flex;align-items:flex-end;gap:3px}
.brand-mark i{display:block;width:6px;height:16px;border-radius:5px;transform:rotate(35deg);background:var(--coral)}
.brand-mark i:nth-child(2){height:20px;background:var(--mustard)}
.brand-mark i:nth-child(3){height:13px;background:var(--ink)}
.eyebrow{color:var(--coral);text-transform:uppercase;font-weight:700;font-size:10px;letter-spacing:.16em}
.btn{border:1px solid var(--line);border-radius:6px;padding:12px 18px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:8px;text-decoration:none;background:var(--paper);color:var(--ink);cursor:pointer}
.btn.primary{background:var(--ink);color:#fff;border-color:var(--ink)}
.btn.coral{background:var(--coral);color:#fff;border-color:var(--coral)}
.btn.ghost{background:transparent}
.btn.small{padding:8px 12px;font-size:11px;border-radius:5px}
.btn:disabled{opacity:.5;cursor:not-allowed}
button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid var(--mustard);outline-offset:3px}
.lead{color:var(--muted);font-size:13px;line-height:1.6;max-width:640px}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:8px}
@media(max-width:640px){.cards{grid-template-columns:1fr}}
.bigcard{background:var(--white);border:1px solid #e5e2dc;border-radius:14px;padding:30px 26px;box-shadow:0 6px 20px rgba(30,42,44,.04);text-decoration:none;color:var(--ink);display:block;transition:transform .15s ease,box-shadow .15s ease}
.bigcard:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(30,42,44,.10)}
.bigcard h2{margin:10px 0 8px;font-size:24px}
.bigcard p{margin:0 0 18px;color:var(--muted);font-size:12.5px;line-height:1.6}
.bigcard .go{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:12px;border-radius:6px;padding:12px 18px}
.bigcard.viewer .go{background:var(--ink);color:#fff}
.bigcard.creator .go{background:var(--coral);color:#fff}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--line);margin-right:7px;vertical-align:1px}
.dot.ok{background:var(--green)}.dot.ko{background:var(--coral)}
.statusline{font-size:11px;color:var(--muted);margin-top:14px}
.banner{background:#fdf1e8;border:1px solid #f0d5c3;border-radius:12px;padding:14px 18px;color:#8a5a3a;font-size:12px;margin-bottom:22px}
.banner.ok{background:#eef6f1;border-color:#cfe5da;color:#47715f}
.modal-back{position:fixed;inset:0;background:rgba(23,52,74,.45);display:none;align-items:flex-start;justify-content:center;padding:40px 16px;z-index:10}
.modal-back.open{display:flex}
.modal{background:var(--white);border-radius:14px;max-width:560px;width:100%;padding:26px;box-shadow:0 22px 55px rgba(33,51,57,.25);max-height:88vh;overflow:auto}
.modal h2{margin:0 0 4px}
.field{margin-bottom:13px}
.field label{display:block;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px}
.field input{width:100%;border:1px solid var(--line);border-radius:7px;background:var(--white);padding:9px 11px;font-size:12px;color:var(--ink)}
.field input[type=checkbox]{width:auto;transform:scale(1.25)}
.field small{color:var(--muted);font-size:11px}
.row{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}
details.adv{margin-top:6px;border-top:1px solid var(--line);padding-top:12px}
details.adv summary{cursor:pointer;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
#toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;border-radius:8px;padding:11px 18px;font-size:12px;display:none;z-index:20}
</style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <div class="brand"><span class="brand-mark"><i></i><i></i><i></i></span>Noesis Roads</div>
    <button class="btn small" id="gearBtn" title="Opzioni">⚙️ Opzioni</button>
  </div>
  <div class="eyebrow">Leggi l'opera d'arte · da dove cominci</div>
  <h1>Scegli da dove cominciare</h1>
  <p class="lead">Due programmi indipendenti: <b>Vedi</b> mostra le schede didattiche già pronte, <b>Crea</b> le genera con l'aiuto dell'AI. L'hub li tiene accesi entrambi.</p>
  <div id="lanBanner"></div>
  <div class="cards">
    <div class="bigcard viewer">
      <span class="eyebrow">Lettura · porta ${esc(cfg.viewerPort)}</span>
      <h2>Vedi le schede</h2>
      <p>Esplora opere, soggetti e confronti faccia a faccia già pubblicati.</p>
      <span class="go" id="viewerGo" style="cursor:pointer">Apri il viewer →</span>
      <div class="statusline" id="materieLine" style="margin-top:10px">Materie: <span id="materieLinks">caricamento…</span></div>
      <div class="statusline"><span class="dot" id="viewerDot"></span><span id="viewerStatus">verifica…</span></div>
    </div>
    <a class="bigcard creator" id="creatorCard" href="#">
      <span class="eyebrow">Authoring · porta ${esc(cfg.creatorPort)}</span>
      <h2>Crea le schede</h2>
      <p>Carica un'immagine e genera la scheda didattica completa.</p>
      <span class="go">Apri il creator →</span>
      <div class="statusline"><span class="dot" id="creatorDot"></span><span id="creatorStatus">verifica…</span></div>
    </a>
  </div>
</div>
<div class="modal-back" id="modalBack">
  <div class="modal" role="dialog" aria-label="Opzioni">
    <div class="eyebrow">Configurazione · .env.local</div>
    <h2>⚙️ Opzioni</h2>
    <p class="lead" id="keyState"></p>
    <div id="optMsg"></div>
    <div class="field"><label for="f_apiKey">Chiave API OpenRouter</label><input id="f_apiKey" type="password" autocomplete="off" placeholder="lascia vuoto per non cambiare"><small>Non viene mai mostrata: solo "configurata sì/no".</small></div>
    <div class="field"><label for="f_endpoint">Endpoint</label><input id="f_endpoint"></div>
    <div class="field"><label for="f_visionModel">Modello visione</label><input id="f_visionModel"></div>
    <div class="field"><label for="f_textModel">Modello testo</label><input id="f_textModel"></div>
    <div class="field"><label><input id="f_webSearch" type="checkbox"> Ricerca web OpenRouter (grounding live)</label></div>
    <div class="field"><label for="f_viewerPort">Porta viewer</label><input id="f_viewerPort" inputmode="numeric"></div>
    <div class="field"><label for="f_creatorPort">Porta creator</label><input id="f_creatorPort" inputmode="numeric"></div>
    <div class="field"><label for="f_hubPort">Porta hub</label><input id="f_hubPort" inputmode="numeric"><small>Cambiarla richiede il riavvio manuale del launcher.</small></div>
    <details class="adv"><summary>Avanzate</summary>
      <div class="field"><label for="f_host">Host di ascolto</label><input id="f_host"><small>0.0.0.0 espone in rete locale: la gestione chiave diventa raggiungibile in LAN.</small></div>
      <div class="field"><label for="f_creatorDb">Percorso DB creator</label><input id="f_creatorDb" placeholder="default: noesis-roads-creator/data/noesis-roads-creator.db"></div>
      <div class="field"><label for="f_rpm">Richieste/min (rate limiter)</label><input id="f_rpm" inputmode="numeric"></div>
    </details>
    <div class="row"><button class="btn ghost" id="cancelBtn">Annulla</button><button class="btn primary" id="saveBtn">Salva e riavvia i server</button></div>
  </div>
</div>
<div id="toast"></div>
<script>
(function () {
  var viewerPort = ${JSON.stringify(cfg.viewerPort)}, creatorPort = ${JSON.stringify(cfg.creatorPort)};
  function host() { return location.hostname || '127.0.0.1'; }
  var viewerUrl = 'http://' + host() + ':' + viewerPort + '/';
  document.getElementById('viewerGo').onclick = function () { location.href = viewerUrl; };
  fetch('http://' + host() + ':' + creatorPort + '/api/materie').then(function (r) { return r.ok ? r.json() : null; }).then(function (b) {
    var el = document.getElementById('materieLinks');
    var list = b && Array.isArray(b.materie) ? b.materie : [];
    if (!list.length) { el.textContent = 'non disponibili (creator spento?)'; return; }
    el.textContent = '';
    list.forEach(function (m, i) {
      if (i) el.appendChild(document.createTextNode(' · '));
      var a = document.createElement('a');
      a.href = viewerUrl + '?materia=' + encodeURIComponent(m.id);
      a.textContent = m.nome || m.id;
      el.appendChild(a);
    });
  }).catch(function () { document.getElementById('materieLinks').textContent = 'non disponibili (creator spento?)'; });
  document.getElementById('creatorCard').href = 'http://' + host() + ':' + creatorPort + '/';
  function toast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.style.display = 'block'; setTimeout(function () { t.style.display = 'none'; }, 3500); }
  function setDot(dot, label, up, port) {
    dot.className = 'dot ' + (up ? 'ok' : 'ko');
    label.textContent = up ? 'acceso · porta ' + port : 'spento — si riavvia da solo, riprova';
  }
  function refresh() {
    fetch('/api/health').then(function (r) { return r.json(); }).then(function (h) {
      setDot(document.getElementById('viewerDot'), document.getElementById('viewerStatus'), h.viewer.up, h.viewer.port);
      setDot(document.getElementById('creatorDot'), document.getElementById('creatorStatus'), h.creator.up, h.creator.port);
      var b = document.getElementById('lanBanner');
      b.innerHTML = h.config && h.config.lanExposed ? '<div class="banner">⚠️ Ascolto su 0.0.0.0: l\u2019hub (e le opzioni con la chiave) è raggiungibile da tutta la rete locale.</div>' : '';
    }).catch(function () {});
  }
  refresh(); setInterval(refresh, 5000);
  var back = document.getElementById('modalBack');
  document.getElementById('gearBtn').onclick = function () { openModal(); };
  document.getElementById('cancelBtn').onclick = function () { back.classList.remove('open'); };
  back.addEventListener('click', function (e) { if (e.target === back) back.classList.remove('open'); });
  function val(id) { return document.getElementById(id).value; }
  function openModal() {
    fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
      document.getElementById('keyState').textContent = 'Chiave API: ' + (c.apiKeyConfigured ? 'configurata ✓' : 'non configurata');
      document.getElementById('f_apiKey').value = '';
      document.getElementById('f_endpoint').value = c.endpoint || '';
      document.getElementById('f_visionModel').value = c.visionModel || '';
      document.getElementById('f_textModel').value = c.textModel || '';
      document.getElementById('f_webSearch').checked = !!c.webSearch;
      document.getElementById('f_viewerPort').value = c.viewerPort;
      document.getElementById('f_creatorPort').value = c.creatorPort;
      document.getElementById('f_hubPort').value = c.hubPort;
      document.getElementById('f_host').value = c.host || '';
      document.getElementById('f_creatorDb').value = c.creatorDb || '';
      document.getElementById('f_rpm').value = c.rpm;
      document.getElementById('optMsg').innerHTML = '';
      back.classList.add('open');
    });
  }
  document.getElementById('saveBtn').onclick = function () {
    var body = {
      endpoint: val('f_endpoint'), visionModel: val('f_visionModel'), textModel: val('f_textModel'),
      webSearch: document.getElementById('f_webSearch').checked,
      viewerPort: val('f_viewerPort'), creatorPort: val('f_creatorPort'), hubPort: val('f_hubPort'),
      host: val('f_host'), creatorDb: val('f_creatorDb'), rpm: val('f_rpm')
    };
    if (val('f_apiKey')) body.apiKey = val('f_apiKey');
    var btn = document.getElementById('saveBtn');
    btn.disabled = true;
    fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (r) {
        if (!r.ok) { document.getElementById('optMsg').innerHTML = '<div class="banner">' + (r.body.error || 'Errore') + '</div>'; return; }
        back.classList.remove('open');
        toast(r.body.hubRestartRequired ? 'Salvato. Riavvia il launcher per la nuova porta hub.' : 'Salvato. Server riavviati.');
        setTimeout(refresh, 2500);
      })
      .catch(function (e) { document.getElementById('optMsg').innerHTML = '<div class="banner">Errore: ' + e.message + '</div>'; })
      .then(function () { btn.disabled = false; });
  };
})();
</script>
</body>
</html>`;
}

// ---------- supervisore ----------
export function createHubServer(opts = {}) {
  const env = opts.env || process.env;
  const envFile = opts.envFile || env.NOESIS_HUB_ENV_FILE || env.ARTEST_HUB_ENV_FILE || join(ROOT, '.env.local');
  const host = opts.host ?? env.APP_HOST ?? '127.0.0.1';
  const hubPort = Number(opts.hubPort ?? env.NOESIS_HUB_PORT ?? env.ARTEST_HUB_PORT ?? DEFAULTS.hubPort);
  const viewerPort = Number(opts.viewerPort ?? env.APP_PORT ?? DEFAULTS.viewerPort);
  const creatorPort = Number(opts.creatorPort ?? env.NOESIS_CREATOR_PORT ?? env.ARTEST_CREATOR_PORT ?? DEFAULTS.creatorPort);
  const doSpawn = opts.spawn !== false;

  const scripts = opts.scripts || {};
  const children = {
    viewer: { name: 'viewer', script: scripts.viewer || join(ROOT, 'server.mjs'), extraEnv: { APP_PORT: String(viewerPort) }, proc: null, up: false, expectExit: false, restartTimer: null },
    creator: { name: 'creator', script: scripts.creator || join(ROOT, 'noesis-roads-creator', 'server.mjs'), extraEnv: { NOESIS_CREATOR_PORT: String(creatorPort), NOESIS_VIEWER_PORT: String(viewerPort) }, proc: null, up: false, expectExit: false, restartTimer: null }
  };
  let stopping = false;

  function log(name, msg) { console.log(`[launcher:${name}] ${msg}`); }

  function startChild(key) {
    const child = children[key];
    if (!doSpawn) return;
    child.expectExit = false; // figlio fresco: futuri crash DEVONO respawnare
    const proc = fork(child.script, [], { env: { ...env, ...child.extraEnv }, silent: true });
    child.proc = proc;
    proc.stdout.on('data', (d) => process.stdout.write(`[${child.name}] ${d}`));
    proc.stderr.on('data', (d) => process.stderr.write(`[${child.name}] ${d}`));
    proc.on('exit', (code, signal) => {
      child.proc = null;
      child.up = false;
      // Uscita attesa (stop pianificato o shutdown): nessun respawn.
      if (stopping || child.expectExit) return;
      log(child.name, `uscito (codice ${code ?? signal}), riavvio tra 1.5s…`);
      child.restartTimer = setTimeout(() => { child.restartTimer = null; if (!stopping && !child.expectExit) startChild(key); }, 1500);
    });
    log(child.name, `avviato (pid ${proc.pid})`);
  }

  function stopChild(key, timeoutMs = 5000) {
    const child = children[key];
    const proc = child.proc;
    if (child.restartTimer) { clearTimeout(child.restartTimer); child.restartTimer = null; }
    if (!proc) return Promise.resolve();
    child.expectExit = true; // stop pianificato: l'exit handler non deve respawnare
    return new Promise((resolve) => {
      const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, timeoutMs);
      proc.once('exit', () => { clearTimeout(timer); resolve(); });
      try { proc.kill('SIGTERM'); } catch { clearTimeout(timer); resolve(); }
    });
  }

  async function restartChildren() {
    await Promise.all([stopChild('viewer'), stopChild('creator')]);
    await new Promise((r) => setTimeout(r, 400));
    // rilegge le porte dall'env aggiornato (il pannello può averle cambiate)
    children.viewer.extraEnv.APP_PORT = String(Number(env.APP_PORT || DEFAULTS.viewerPort));
    children.creator.extraEnv.NOESIS_CREATOR_PORT = String(Number(env.NOESIS_CREATOR_PORT || env.ARTEST_CREATOR_PORT || DEFAULTS.creatorPort));
    startChild('viewer');
    startChild('creator');
  }

  function readBody(req, limit = 64 * 1024) {
    return new Promise((resolvePromise, reject) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; if (body.length > limit) reject(new Error('Payload troppo grande')); });
      req.on('end', () => { try { resolvePromise(JSON.parse(body || '{}')); } catch { reject(new Error('JSON non valido')); } });
      req.on('error', reject);
    });
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/') {
        const html = hubPage(effectiveConfig(env));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html), 'Cache-Control': 'no-cache' });
        return res.end(html);
      }
      if (req.method === 'GET' && url.pathname === '/api/health') {
        const cfg = effectiveConfig(env);
        const [viewerUp, creatorUp] = await Promise.all([
          doSpawn ? probeStatus(cfg.viewerPort) : Promise.resolve(false),
          doSpawn ? probeStatus(cfg.creatorPort) : Promise.resolve(false)
        ]);
        children.viewer.up = viewerUp;
        children.creator.up = creatorUp;
        return sendJson(res, 200, {
          hub: { port: hubPort },
          viewer: { port: cfg.viewerPort, up: viewerUp },
          creator: { port: cfg.creatorPort, up: creatorUp },
          config: { lanExposed: cfg.lanExposed }
        });
      }
      if (req.method === 'GET' && url.pathname === '/api/config') {
        return sendJson(res, 200, effectiveConfig(env));
      }
      if (req.method === 'POST' && url.pathname === '/api/config') {
        const patch = await readBody(req).catch(() => null);
        if (!patch || typeof patch !== 'object') return sendJson(res, 400, { error: 'JSON non valido' });
        const errors = validateConfig(patch);
        if (errors.length) return sendJson(res, 400, { error: errors.join('; ') });
        writeEnvFile(envFile, patch);
        // Applica subito all'env del launcher (i figli lo ereditano al restart)
        for (const [field, value] of Object.entries(patch)) {
          const name = CONFIG_FIELDS[field];
          if (!name) continue;
          const str = value === true ? 'true' : value === false ? 'false' : String(value ?? '');
          if (str === '' && field === 'apiKey') delete env[name];
          else if (str !== '') env[name] = str;
        }
        await restartChildren();
        const hubChanged = patch.hubPort !== undefined && patch.hubPort !== '' &&
          Number(patch.hubPort) !== hubPort;
        return sendJson(res, 200, { ok: true, hubRestartRequired: hubChanged });
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    } catch (e) {
      sendJson(res, 500, { error: String((e && e.message) || e) });
    }
  });

  startChild('viewer');
  startChild('creator');

  return {
    server, children,
    ports: { hub: hubPort, viewer: viewerPort, creator: creatorPort },
    restart: restartChildren,
    async stop() {
      stopping = true;
      await Promise.all([stopChild('viewer'), stopChild('creator')]);
      await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }
  };
}

async function main() {
  loadLocalEnv();
  const hub = createHubServer();
  const host = process.env.APP_HOST || '127.0.0.1';
  hub.server.listen(hub.ports.hub, host, () => {
    console.log(`Noesis Roads hub: http://${host}:${hub.ports.hub}`);
    console.log(`  viewer  (Vedi le schede): http://${host}:${hub.ports.viewer}`);
    console.log(`  creator (Crea le schede): http://${host}:${hub.ports.creator}`);
  });
  const shutdown = () => {
    console.log('\n[launcher] arresto…');
    hub.stop().then(() => process.exit(0)).catch(() => process.exit(1));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('[launcher] errore fatale:', e); process.exit(1); });
}
