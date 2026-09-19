#!/usr/bin/env node
// install.mjs — installer multipiattaforma di Noesis Roads (zero dipendenze).
//
// Uso:  node install.mjs [--skip-python] [--skip-launch]
//
// Cosa fa, in ordine:
//   1. Verifica Node.js ≥ 22.5 e che `node:sqlite` funzioni davvero (requisito
//      duro di noesis-roads-creator/db.mjs). Con istruzioni di aggiornamento
//      specifiche per Windows / macOS / Linux.
//   2. Rileva un interprete Python 3 e verifica/installa i moduli per gli
//      export (pillow, reportlab, python-docx, python-pptx, markdown,
//      ebooklib). GLI EXPORT SONO OPZIONALI: senza moduli tutto il resto
//      funziona, solo PDF/DOCX/SLIDES/EPUB non si generano. Gestisce i casi
//      tipici: PEP 668 su Linux/macOS (--break-system-packages --user),
//      launcher `py`/`python` su Windows (dove `python3` è spesso lo stub
//      dello Store), assenza totale di Python.
//   3. Prepara .env.local a partire da .env.example, MAI sovrascrivendo un
//      eventuale file esistente. Rimuove le righe dei segreti vuote (una
//      OPENROUTER_API_KEY= vuota nel file cancellerebbe la chiave di sistema:
//      il loader dà ora precedenza al file, quindi non deve esserci).
//   4. Avvia node launcher.mjs (hub + viewer + creator), salvo --skip-launch.
//
// Exit code: 0 ok · 1 prerequisito mancante (Node) · 2 errore imprevisto.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { platform, release } from 'node:os';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const IS_WIN = platform() === 'win32';
const IS_MAC = platform() === 'darwin';
const OS_NAME = IS_WIN ? 'Windows' : IS_MAC ? 'macOS' : 'Linux';
const PY_MODULES = ['pillow', 'reportlab', 'python-docx', 'python-pptx', 'markdown', 'ebooklib'];

const args = new Set(process.argv.slice(2));
const skipPython = args.has('--skip-python');
const skipLaunch = args.has('--skip-launch');

const c = { reset: '\x1b[0m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m' };
const NO_COLOR = !process.stdout.isTTY || process.env.NO_COLOR;
const paint = (code, s) => (NO_COLOR ? s : `${code}${s}${c.reset}`);
const ok = (s) => console.log(paint(c.green, `  ✓ ${s}`));
const warn = (s) => console.log(paint(c.yellow, `  ⚠ ${s}`));
const fail = (s) => console.log(paint(c.red, `  ✗ ${s}`));
const info = (s) => console.log(paint(c.dim, `    ${s}`));
const step = (n, s) => console.log(`\n${paint(c.bold, `[${n}/4]`)} ${paint(c.bold, s)}`);

function die(msg, hints = []) {
  fail(msg);
  for (const h of hints) info(h);
  process.exit(1);
}

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', timeout: opts.timeout || 60000, ...opts });
  return { status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), error: r.error };
}

// ---------- 1/4 · Node ----------
function checkNode() {
  step(1, `Node.js (${OS_NAME})`);
  const [maj, min] = process.versions.node.split('.').map(Number);
  if (maj > 22 || (maj === 22 && min >= 5)) {
    ok(`Node.js ${process.versions.node} (≥ 22.5 richiesto)`);
  } else {
    die(`Node.js ${process.versions.node} è troppo vecchio: serve ≥ 22.5 (modulo nativo node:sqlite).`, [
      IS_WIN && 'Windows: scarica l\u2019installer da https://nodejs.org/ (LTS) e rilancia.',
      IS_MAC && 'macOS: brew install node@22  — oppure installer da https://nodejs.org/.',
      !IS_WIN && !IS_MAC && 'Linux (Debian/Ubuntu): usa NodeSource — https://github.com/nodesource/distributions.',
      !IS_WIN && !IS_MAC && 'Linux (Fedora): sudo dnf module install nodejs:22 — o https://nodejs.org/.'
    ].filter(Boolean));
  }
  try {
    const { DatabaseSync } = await_import('node:sqlite');
    new DatabaseSync(':memory:').exec('CREATE TABLE t(x)');
    ok('node:sqlite operativo (database in memoria creato e chiuso)');
  } catch (e) {
    die(`node:sqlite non è disponibile in questo Node (${e.message}).`, [
      'Serve Node.js ≥ 22.5 ufficiale: build alternative (distro, snap vecchi) possono escluderlo.'
    ]);
  }
}
// import() dinamico in helper per non far valutare il modulo a parse time di questo file su Node vecchi.
function await_import(spec) { return require_shim(spec); }
import { createRequire } from 'node:module';
function require_shim(spec) { return createRequire(import.meta.url)(spec); }

// ---------- 2/4 · Python + moduli export ----------
function findPython() {
  const candidates = IS_WIN
    ? [['py', ['-3']], ['python', []], ['python3', []]]
    : [['python3', []], ['python', []]];
  for (const [cmd, argv] of candidates) {
    const r = run(cmd, [...argv, '--version'], { timeout: 15000 });
    if (r.status === 0 && /Python 3\./.test(r.out + r.err)) {
      const ver = (r.out || r.err).replace('Python ', '').trim();
      return { cmd, baseArgv: argv, ver };
    }
  }
  return null;
}

function pyVersionOk(ver) {
  const [a, b = 0] = ver.split('.').map(Number);
  return a > 3 || (a === 3 && b >= 8);
}

function checkPython() {
  if (skipPython) { console.log(`\n${paint(c.bold, '[2/4]')} Python: saltato (--skip-python)`); return; }
  step(2, `Python per gli export PDF/DOCX/SLIDES/EPUB (${OS_NAME})`);
  const py = findPython();
  if (!py) {
    warn('Python 3 non trovato: gli export PDF/DOCX/SLIDES/EPUB non saranno disponibili.');
    info('Il resto dell\u2019applicazione funziona comunque (viewer, creator, generazioni AI).');
    info(IS_WIN && 'Windows: installa da https://www.python.org/downloads/ spuntando "Add python.exe to PATH".');
    info(IS_MAC && 'macOS: brew install python3 (o python.org).');
    info(!IS_WIN && !IS_MAC && 'Linux: sudo apt install python3 python3-pip  (Debian/Ubuntu) — sudo dnf install python3 (Fedora).');
    return; // opzionale: non è un errore bloccante
  }
  if (!pyVersionOk(py.ver)) {
    warn(`Python ${py.ver} trovato ma serve ≥ 3.8 per i moduli di export: salto la configurazione.`);
    return;
  }
  ok(`Python ${py.ver} trovato (${py.cmd})`);

  const IMPORT_NAME = { pillow: 'PIL', 'python-docx': 'docx', 'python-pptx': 'pptx' };
  const missing = PY_MODULES.filter((m) => {
    const imp = IMPORT_NAME[m] || m;
    const r = run(py.cmd, [...py.baseArgv, '-c', `import ${imp}`], { timeout: 20000 });
    return r.status !== 0;
  });
  if (!missing.length) { ok('Tutti i moduli di export sono già presenti'); return; }
  console.log(`  Mancano: ${missing.join(', ')} — installazione in corso (può richiedere un minuto)…`);

  const pipArgv = [...py.baseArgv, '-m', 'pip', 'install', ...missing];
  let res = run(py.cmd, pipArgv, { timeout: 420000 });
  if (res.status !== 0 && /externally-managed-environment/i.test(res.out + res.err)) {
    // PEP 668 (Debian 12+, Ubuntu 23+, Fedora, Homebrew Python): ambiente gestito dal sistema.
    info('Ambiente Python gestito dal sistema (PEP 668): riprovo per l\u2019utente (--user --break-system-packages).');
    res = run(py.cmd, [...pipArgv, '--user', '--break-system-packages'], { timeout: 420000 });
  }
  if (res.status !== 0) {
    warn('Installazione dei moduli non riuscita: gli export PDF/DOCX/SLIDES/EPUB non funzioneranno.');
    info('Dettaglio errore: ' + (res.err || res.out || '?').split('\n').slice(-3).join(' | '));
    info('Riprovare a mano: ' + py.cmd + ' -m pip install ' + missing.join(' '));
    return; // opzionale
  }
  ok('Moduli di export installati');
}

// ---------- 3/4 · .env.local ----------
// Trasforma il testo di .env.example nel contenuto di .env.local:
// - riunisce la riga-commento "# pip install pillow reportlab" se spezzata su due righe;
// - rimuove le righe dei SEGRETI vuote: con la precedenza file > ambiente, una
//   "OPENROUTER_API_KEY=" vuota cancellerebbe la chiave di sistema.
export function envLocalContentFromExample(text) {
  const raw = String(text || '').split(/\r?\n/);
  const lines = [];
  for (let i = 0; i < raw.length; i++) {
    const l = raw[i];
    if (/^#\s*pip install pillow reportlab/i.test(l) && /^\s*pillow\s+reportlab\s*$/.test(raw[i + 1] || '')) { i++; continue; }
    if (!/^\s*OPENROUTER_API_KEY\s*=\s*$/.test(l)) lines.push(l);
  }
  return lines.join('\n');
}

function prepareEnvFile() {
  step(3, 'Configurazione (.env.local)');
  const envLocal = join(ROOT, '.env.local');
  const example = join(ROOT, '.env.example');
  if (existsSync(envLocal)) {
    ok('.env.local già presente: non lo tocco (le impostazioni dell\u2019utente restano).');
  } else if (existsSync(example)) {
    try {
      writeFileSync(envLocal, envLocalContentFromExample(readFileSync(example, 'utf8')));
      ok('.env.local creato da .env.example (senza campi segreto vuoti).');
    } catch (e) {
      warn(`Impossibile creare .env.local (${e.message}): lo creerà il pannello Opzioni dell\u2019hub al bisogno.`);
    }
  } else {
    warn('.env.example non trovato: salto la preparazione di .env.local.');
  }
  // Garanzia operativa: il file deve essere scrivibile (l'hub ci salva la chiave).
  try {
    const probe = join(ROOT, existsSync(envLocal) ? '.env.local' : '.env.local', '.probe-' + Date.now());
    if (existsSync(envLocal)) { const fd = openSync(envLocal, 'a'); closeSync(fd); ok('.env.local scrivibile: l\u2019hub potrà salvarci la chiave.'); }
  } catch {
    warn('.env.local non è scrivibile: il salvataggio della chiave dal pannello Opzioni fallirà.');
    info(IS_WIN && 'Windows: verifica che il file non sia aperto in un altro programma o in sola lettura.');
    info(!IS_WIN && 'Verifica i permessi della cartella del progetto (chmod u+w .env.local).');
  }
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim()) {
    info('Rilevata una OPENROUTER_API_KEY nell\u2019ambiente: se salvi una chiave dal pannello Opzioni, quella del file avrà la precedenza (documentato nel README).');
  }
}

// ---------- 4/4 · launcher ----------
async function portBusy(port) {
  try { await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) }); return true; }
  catch { return false; }
}

async function startLauncher() {
  if (skipLaunch) { console.log(`\n${paint(c.bold, '[4/4]')} Avvio: saltato (--skip-launch)`); return; }
  step(4, 'Avvio (node launcher.mjs)');
  // Porte di default (rispettano gli override d'ambiente usati dal launcher).
  const hubPort = Number(process.env.NOESIS_HUB_PORT || 18080);
  const viewerPort = Number(process.env.APP_PORT || 18000);
  const creatorPort = Number(process.env.NOESIS_CREATOR_PORT || 18100);
  const busy = [];
  for (const [name, p] of [['hub', hubPort], ['viewer', viewerPort], ['creator', creatorPort]]) {
    if (await portBusy(p)) busy.push(`${name} :${p}`);
  }
  if (busy.length) {
    warn(`Porte già occupate (${busy.join(' · ')}): niente doppio avvio.`);
    if (busy.some((b) => b.startsWith('hub'))) {
      info(`Un’istanza sembra già attiva: apri http://127.0.0.1:${hubPort}/ (o ferma quella istanza e rilancia l’installer).`);
    } else {
      info('Libera le porte (o imposta APP_PORT / NOESIS_CREATOR_PORT / NOESIS_HUB_PORT) e rilancia.');
    }
    return;
  }
  console.log(paint(c.dim, `  Hub: http://127.0.0.1:${hubPort} · viewer: ${viewerPort} · creator: ${creatorPort}. Ctrl+C spegne tutto.\n`));
  const child = spawn(process.execPath, [join(ROOT, 'launcher.mjs')], { stdio: 'inherit' });
  child.on('exit', (code) => process.exitCode = code || 0);
  child.on('error', (e) => { fail(`Impossibile avviare il launcher: ${e.message}`); process.exitCode = 2; });
}

// ---------- main ----------
export async function main() {
  console.log(paint(c.bold, `Noesis Roads — installer (${OS_NAME} ${release()})`));
  await checkNode();
  checkPython();
  prepareEnvFile();
  await startLauncher();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => die(`Errore imprevisto: ${e.message}`));
}
