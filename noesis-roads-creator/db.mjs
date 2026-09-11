// noesis-roads-creator — storage layer (SQLite nativo node:sqlite, zero dipendenze)
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(ROOT, 'data');
export const UPLOAD_DIR = join(ROOT, 'uploads');
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(UPLOAD_DIR, { recursive: true });

// Percorso DB: NOESIS_CREATOR_DB (nuovo) con fallback ARTEST_CREATOR_DB (legacy).
// Default nuovo; se esiste solo il DB storico artest-creator.db lo si riusa
// (migrazione trasparente al primo avvio dopo la rinomina).
function resolveDbPath() {
  if (process.env.NOESIS_CREATOR_DB) return process.env.NOESIS_CREATOR_DB;
  if (process.env.ARTEST_CREATOR_DB) return process.env.ARTEST_CREATOR_DB;
  const next = join(DATA_DIR, 'noesis-roads-creator.db');
  const legacy = join(DATA_DIR, 'artest-creator.db');
  if (!existsSync(next) && existsSync(legacy)) return legacy;
  return next;
}
export const DB_PATH = resolveDbPath();

// Connessione di SCRITTURA (server noesis-roads-creator): inizializzata in modo lazy da initSchema().
// Quando il modulo è importato dal viewer (server di sola lettura), il DB non viene aperto in scrittura
// e lo schema non viene toccato: il viewer usa le funzioni *RO qui sotto (connessione read-only per query).
let _db = null;
export function getDb() {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    _db.exec('PRAGMA journal_mode = WAL;');
    _db.exec('PRAGMA foreign_keys = ON;');
  }
  return _db;
}

export function initSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS artworks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      artist TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      period TEXT NOT NULL DEFAULT '',
      technique TEXT NOT NULL DEFAULT '',
      institution TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      image_path TEXT NOT NULL,
      image_width INTEGER NOT NULL DEFAULT 0,
      image_height INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft'
    );

    CREATE TABLE IF NOT EXISTS detail_content (
      detail_id INTEGER NOT NULL REFERENCES details(id) ON DELETE CASCADE,
      tab TEXT NOT NULL CHECK (tab IN ('studio', 'approfondimento')),
      observation TEXT NOT NULL DEFAULT '',
      meaning TEXT NOT NULL DEFAULT '',
      relation TEXT NOT NULL DEFAULT '',
      curiosity TEXT NOT NULL DEFAULT '',
      comparisons TEXT NOT NULL DEFAULT '',
      open_questions TEXT NOT NULL DEFAULT '',
      technique TEXT NOT NULL DEFAULT '',
      look_again TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      model TEXT NOT NULL DEFAULT '',
      prompt_version TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (detail_id, tab)
    );

    CREATE TABLE IF NOT EXISTS overview (
      artwork_id TEXT PRIMARY KEY REFERENCES artworks(id) ON DELETE CASCADE,
      painting TEXT NOT NULL DEFAULT '',
      artist TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      model TEXT NOT NULL DEFAULT '',
      prompt_version TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
      detail_id INTEGER REFERENCES details(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_details_artwork ON details(artwork_id);
    CREATE INDEX IF NOT EXISTS idx_content_detail ON detail_content(detail_id);
    CREATE INDEX IF NOT EXISTS idx_sources_artwork ON sources(artwork_id);

    CREATE TABLE IF NOT EXISTS similar_works (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      artist TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      museum TEXT NOT NULL DEFAULT '',
      caption TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      image_page TEXT NOT NULL DEFAULT '',
      image_data BLOB,
      image_mime TEXT NOT NULL DEFAULT 'image/jpeg',
      image_status TEXT NOT NULL DEFAULT 'missing',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_similar_artwork ON similar_works(artwork_id);

    -- --- Schede "Soggetto nella storia dell'arte" ---
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_desc TEXT NOT NULL DEFAULT '',
      intro TEXT NOT NULL DEFAULT '',
      origins TEXT NOT NULL DEFAULT '',
      symbols TEXT NOT NULL DEFAULT '',
      interpretations TEXT NOT NULL DEFAULT '',
      curiosities TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS subject_chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      era TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS subject_works (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      artist TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      museum TEXT NOT NULL DEFAULT '',
      caption TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      image_page TEXT NOT NULL DEFAULT '',
      image_data BLOB,
      image_mime TEXT NOT NULL DEFAULT 'image/jpeg',
      image_status TEXT NOT NULL DEFAULT 'missing',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_subject_chapters ON subject_chapters(subject_id);
    CREATE INDEX IF NOT EXISTS idx_subject_works ON subject_works(subject_id);

    -- --- Schede "Faccia a faccia" ---
    CREATE TABLE IF NOT EXISTS comparisons (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      comparison_type TEXT NOT NULL DEFAULT 'same-subject' CHECK (comparison_type IN ('same-subject','same-artist')),
      intro TEXT NOT NULL DEFAULT '',
      technique TEXT NOT NULL DEFAULT '',
      context TEXT NOT NULL DEFAULT '',
      critique TEXT NOT NULL DEFAULT '',
      curiosities TEXT NOT NULL DEFAULT '',
      thumb_data BLOB,
      thumb_mime TEXT NOT NULL DEFAULT 'image/jpeg',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS comparison_sides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comparison_id TEXT NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
      side TEXT NOT NULL CHECK (side IN ('a','b')),
      source TEXT NOT NULL CHECK (source IN ('library','external')),
      artwork_id TEXT REFERENCES artworks(id) ON DELETE SET NULL,
      title TEXT NOT NULL DEFAULT '',
      artist TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      museum TEXT NOT NULL DEFAULT '',
      image_data BLOB,
      image_mime TEXT NOT NULL DEFAULT 'image/jpeg',
      image_url TEXT NOT NULL DEFAULT '',
      image_status TEXT NOT NULL DEFAULT 'missing',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(comparison_id, side)
    );
    CREATE TABLE IF NOT EXISTS comparison_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comparison_id TEXT NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('similar','different')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_comparison_sides ON comparison_sides(comparison_id);
    CREATE INDEX IF NOT EXISTS idx_comparison_points ON comparison_points(comparison_id);

    -- --- Nucleo generico Noesis Roads (Fase 2, additivo: tabelle legacy intatte) ---
    -- cfr. docs/ARCHITECTURE.md: materie, modelli_scheda, schede_lezione, sezioni, immagini
    CREATE TABLE IF NOT EXISTS materie (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL DEFAULT '',
      descrizione TEXT NOT NULL DEFAULT '',
      stato TEXT NOT NULL DEFAULT 'attiva',
      system_prompt TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS modelli_scheda (
      id TEXT PRIMARY KEY,               -- stabile "materia:chiave:vN"
      materia_id TEXT NOT NULL REFERENCES materie(id) ON DELETE CASCADE,
      chiave TEXT NOT NULL,
      nome TEXT NOT NULL DEFAULT '',
      versione INTEGER NOT NULL DEFAULT 1,
      schema_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(materia_id, chiave, versione)
    );
    CREATE TABLE IF NOT EXISTS schede_lezione (
      id TEXT PRIMARY KEY,
      modello_id TEXT NOT NULL REFERENCES modelli_scheda(id) ON DELETE CASCADE,
      titolo TEXT NOT NULL DEFAULT '',
      stato TEXT NOT NULL DEFAULT 'draft' CHECK (stato IN ('draft','ready')),
      sezioni_attive TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sezioni (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheda_id TEXT NOT NULL REFERENCES schede_lezione(id) ON DELETE CASCADE,
      chiave TEXT NOT NULL,
      titolo TEXT NOT NULL DEFAULT '',
      corpo_json TEXT NOT NULL DEFAULT '{}',
      ordine INTEGER NOT NULL DEFAULT 0,
      model TEXT NOT NULL DEFAULT '',
      prompt_version TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(scheda_id, chiave)
    );
    CREATE TABLE IF NOT EXISTS immagini (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheda_id TEXT NOT NULL REFERENCES schede_lezione(id) ON DELETE CASCADE,
      ruolo TEXT NOT NULL DEFAULT '',
      dati BLOB,
      mime TEXT NOT NULL DEFAULT 'image/jpeg',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_modelli_materia ON modelli_scheda(materia_id);
    CREATE INDEX IF NOT EXISTS idx_schede_modello ON schede_lezione(modello_id);
    CREATE INDEX IF NOT EXISTS idx_sezioni_scheda ON sezioni(scheda_id);
    CREATE INDEX IF NOT EXISTS idx_immagini_scheda ON immagini(scheda_id);
  `);

  // migrazione: le immagini vivono nel DB come BLOB (binary, non base64: più compatto e veloce).
  // Il file in uploads/ resta come scratch per PIL (crop/annotazione) e come fallback.
  const cols = getDb().prepare('PRAGMA table_info(artworks)').all().map(c => c.name);
  if (!cols.includes('image_data')) db.exec('ALTER TABLE artworks ADD COLUMN image_data BLOB');
  if (!cols.includes('image_mime')) db.exec("ALTER TABLE artworks ADD COLUMN image_mime TEXT NOT NULL DEFAULT 'image/jpeg'");
  if (!cols.includes('annotated_data')) db.exec('ALTER TABLE artworks ADD COLUMN annotated_data BLOB');
  if (!cols.includes('annotated_mime')) db.exec("ALTER TABLE artworks ADD COLUMN annotated_mime TEXT NOT NULL DEFAULT 'image/jpeg'");

  // migrazione: sezione "Tecnica e materia" (tab Approfondimento) sulle schede dei dettagli
  const dcols = getDb().prepare('PRAGMA table_info(detail_content)').all().map(c => c.name);
  if (!dcols.includes('technique')) db.exec("ALTER TABLE detail_content ADD COLUMN technique TEXT NOT NULL DEFAULT ''");

  // migrazione: prompt-database + wizard (system_prompt, sezioni_attive, timbri)
  const mcols = getDb().prepare('PRAGMA table_info(materie)').all().map(c => c.name);
  if (!mcols.includes('system_prompt')) db.exec("ALTER TABLE materie ADD COLUMN system_prompt TEXT NOT NULL DEFAULT ''");
  const scols = getDb().prepare('PRAGMA table_info(schede_lezione)').all().map(c => c.name);
  if (!scols.includes('sezioni_attive')) db.exec("ALTER TABLE schede_lezione ADD COLUMN sezioni_attive TEXT NOT NULL DEFAULT ''");
  const zcols = getDb().prepare('PRAGMA table_info(sezioni)').all().map(c => c.name);
  if (!zcols.includes('model')) db.exec("ALTER TABLE sezioni ADD COLUMN model TEXT NOT NULL DEFAULT ''");
  if (!zcols.includes('prompt_version')) db.exec("ALTER TABLE sezioni ADD COLUMN prompt_version TEXT NOT NULL DEFAULT ''");

  // backfill: opere esistenti (solo file su disco) -> carica il BLOB una tantum
  const missing = getDb().prepare("SELECT id, image_path FROM artworks WHERE image_data IS NULL AND image_path != ''").all();
  for (const row of missing) {
    const filePath = join(ROOT, row.image_path);
    if (existsSync(filePath)) {
      const buf = readFileSync(filePath);
      const mime = buf.length > 3 && buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : 'image/jpeg';
      getDb().prepare('UPDATE artworks SET image_data = ?, image_mime = ? WHERE id = ?').run(buf, mime, row.id);
    }
  }
}

function now() { return new Date().toISOString(); }

function rowToArtwork(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    date: row.date,
    period: row.period,
    technique: row.technique,
    institution: row.institution,
    location: row.location,
    imagePath: row.image_path,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    hasImage: row.image_data != null,
    hasAnnotated: row.annotated_data != null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createArtwork({ id, title, artist, date, period, technique, institution, location, imagePath, imageWidth = 0, imageHeight = 0, imageData = null, imageMime = 'image/jpeg' }) {
  getDb().prepare(`INSERT INTO artworks (id, title, artist, date, period, technique, institution, location, image_path, image_data, image_mime, image_width, image_height, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
    .run(id, title || '', artist || '', date || '', period || '', technique || '', institution || '', location || '', imagePath, imageData, imageMime, imageWidth, imageHeight, now(), now());
  return getArtwork(id);
}

export function getArtwork(id, conn) {
  return rowToArtwork((conn || getDb()).prepare('SELECT * FROM artworks WHERE id = ?').get(id));
}

export function listArtworks(conn) {
  return (conn || getDb()).prepare('SELECT * FROM artworks ORDER BY created_at DESC').all().map(rowToArtwork);
}

export function updateArtwork(id, patch) {
  const current = getArtwork(id);
  if (!current) return null;
  const merged = {
    title: patch.title ?? current.title,
    artist: patch.artist ?? current.artist,
    date: patch.date ?? current.date,
    period: patch.period ?? current.period,
    technique: patch.technique ?? current.technique,
    institution: patch.institution ?? current.institution,
    location: patch.location ?? current.location,
    status: patch.status ?? current.status
  };
  getDb().prepare(`UPDATE artworks SET title=?, artist=?, date=?, period=?, technique=?, institution=?, location=?, status=?, updated_at=? WHERE id=?`)
    .run(merged.title, merged.artist, merged.date, merged.period, merged.technique, merged.institution, merged.location, merged.status, now(), id);
  return getArtwork(id);
}

export function deleteArtwork(id) {
  getDb().prepare('DELETE FROM artworks WHERE id = ?').run(id);
}

// --- immagini BLOB (pulita + annotata) ---
export function getArtworkImageData(id, conn) {
  const row = (conn || getDb()).prepare('SELECT image_data, image_mime, annotated_data, annotated_mime FROM artworks WHERE id = ?').get(id);
  if (!row) return null;
  return {
    clean: row.image_data ? { data: row.image_data, mime: row.image_mime || 'image/jpeg' } : null,
    annotated: row.annotated_data ? { data: row.annotated_data, mime: row.annotated_mime || 'image/jpeg' } : null
  };
}
export function setAnnotatedImage(id, data, mime = 'image/jpeg') {
  getDb().prepare('UPDATE artworks SET annotated_data = ?, annotated_mime = ?, updated_at = ? WHERE id = ?').run(data, mime, now(), id);
}
export function setArtworkImageData(id, data, mime = 'image/jpeg') {
  getDb().prepare('UPDATE artworks SET image_data = ?, image_mime = ?, updated_at = ? WHERE id = ?').run(data, mime, now(), id);
}

// --- dettagli (hotspot) ---
export function addDetail(artworkId, { title, category, x, y, width, height, sortOrder = 0 }) {
  const result = getDb().prepare(`INSERT INTO details (artwork_id, title, category, x, y, width, height, sort_order)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(artworkId, title, category || '', x, y, width, height, sortOrder);
  return getDetail(result.lastInsertRowid);
}

export function getDetail(detailId) {
  const row = getDb().prepare('SELECT * FROM details WHERE id = ?').get(detailId);
  if (!row) return null;
  return {
    id: row.id,
    artworkId: row.artwork_id,
    title: row.title,
    category: row.category,
    region: { x: row.x, y: row.y, width: row.width, height: row.height },
    sortOrder: row.sort_order,
    status: row.status
  };
}

export function listDetails(artworkId, conn) {
  return (conn || getDb()).prepare('SELECT * FROM details WHERE artwork_id = ? ORDER BY sort_order, id').all(artworkId)
    .map(row => ({
      id: row.id,
      artworkId: row.artwork_id,
      title: row.title,
      category: row.category,
      region: { x: row.x, y: row.y, width: row.width, height: row.height },
      sortOrder: row.sort_order,
      status: row.status
    }));
}

export function replaceDetails(artworkId, items) {
  getDb().prepare('DELETE FROM details WHERE artwork_id = ?').run(artworkId);
  return items.map((item, index) => {
    const region = item.region || {};
    return addDetail(artworkId, {
      title: item.title,
      category: item.category,
      x: item.x ?? region.x,
      y: item.y ?? region.y,
      width: item.width ?? region.width,
      height: item.height ?? region.height,
      sortOrder: index
    });
  });
}

export function updateDetail(detailId, patch) {
  const fields = ['title', 'category', 'x', 'y', 'width', 'height'];
  const sets = [];
  const values = [];
  for (const field of fields) {
    if (patch[field] !== undefined) {
      if (field === 'title' || field === 'category') { sets.push(`${field}=?`); values.push(patch[field]); }
      else { sets.push(`${field}=?`); values.push(Number(patch[field])); }
    }
  }
  if (sets.length) { values.push(detailId); getDb().prepare(`UPDATE details SET ${sets.join(', ')} WHERE id=?`).run(...values); }
  return getDetail(detailId);
}

export function deleteDetail(detailId) {
  getDb().prepare('DELETE FROM details WHERE id = ?').run(detailId);
}

export function approveDetail(detailId) {
  getDb().prepare("UPDATE detail_content SET status = 'approved' WHERE detail_id = ?").run(detailId);
  getDb().prepare("UPDATE details SET status = 'approved' WHERE id = ?").run(detailId);
  return getDetail(detailId);
}

// --- contenuto per dettaglio e tab ---
export function saveDetailContent(detailId, tab, content, meta = {}) {
  getDb().prepare(`INSERT INTO detail_content (detail_id, tab, observation, meaning, relation, curiosity, comparisons, open_questions, technique, look_again, status, model, prompt_version, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(detail_id, tab) DO UPDATE SET
                observation=excluded.observation, meaning=excluded.meaning, relation=excluded.relation,
                curiosity=excluded.curiosity, comparisons=excluded.comparisons, open_questions=excluded.open_questions,
                technique=excluded.technique, look_again=excluded.look_again, status=excluded.status, model=excluded.model,
                prompt_version=excluded.prompt_version, updated_at=excluded.updated_at`)
    .run(detailId, tab, content.observation || '', content.meaning || '', content.relation || '',
         content.curiosity || '', content.comparisons || '', content.openQuestions || '',
         content.technique || '', content.lookAgain || '', meta.status || 'generated', meta.model || '', meta.promptVersion || '', now());
}

export function getDetailContent(detailId, tab, conn) {
  const row = (conn || getDb()).prepare('SELECT * FROM detail_content WHERE detail_id = ? AND tab = ?').get(detailId, tab);
  if (!row) return null;
  return {
    detailId: row.detail_id,
    tab: row.tab,
    content: {
      observation: row.observation,
      meaning: row.meaning,
      relation: row.relation,
      curiosity: row.curiosity,
      comparisons: row.comparisons,
      openQuestions: row.open_questions,
      technique: row.technique,
      lookAgain: row.look_again
    },
    status: row.status,
    model: row.model,
    promptVersion: row.prompt_version,
    updatedAt: row.updated_at
  };
}

// --- overview ---
export function saveOverview(artworkId, { painting, artist }, meta = {}) {
  getDb().prepare(`INSERT INTO overview (artwork_id, painting, artist, status, model, prompt_version, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(artwork_id) DO UPDATE SET
                painting=excluded.painting, artist=excluded.artist, status=excluded.status,
                model=excluded.model, prompt_version=excluded.prompt_version, updated_at=excluded.updated_at`)
    .run(artworkId, painting || '', artist || '', meta.status || 'generated', meta.model || '', meta.promptVersion || '', now());
}

export function getOverview(artworkId, conn) {
  const row = (conn || getDb()).prepare('SELECT * FROM overview WHERE artwork_id = ?').get(artworkId);
  if (!row) return null;
  return { artworkId: row.artwork_id, painting: row.painting, artist: row.artist, status: row.status, updatedAt: row.updated_at };
}

// --- fonti ---
export function addSource({ artworkId, detailId = null, title, url, type }) {
  const result = getDb().prepare('INSERT INTO sources (artwork_id, detail_id, title, url, type) VALUES (?, ?, ?, ?, ?)')
    .run(artworkId, detailId, title || '', url || '', type || '');
  return result.lastInsertRowid;
}

export function listSources(artworkId, conn) {
  return (conn || getDb()).prepare('SELECT * FROM sources WHERE artwork_id = ? ORDER BY detail_id IS NOT NULL, id').all(artworkId)
    .map(row => ({ id: row.id, detailId: row.detail_id, title: row.title, url: row.url, type: row.type }));
}

// --- opere simili (carousel) ---
function rowToSimilar(row) {
  if (!row) return null;
  return {
    id: row.id, artworkId: row.artwork_id, sortOrder: row.sort_order,
    title: row.title, artist: row.artist, date: row.date, museum: row.museum,
    caption: row.caption, imageUrl: row.image_url, imagePage: row.image_page,
    hasImage: Boolean(row.image_data), imageStatus: row.image_status, status: row.status
  };
}
export function replaceSimilarWorks(artworkId, works) {
  getDb().prepare('DELETE FROM similar_works WHERE artwork_id = ?').run(artworkId);
  const insert = getDb().prepare(`INSERT INTO similar_works (artwork_id, sort_order, title, artist, date, museum, caption, image_url, image_page, image_data, image_mime, image_status, status, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  (Array.isArray(works) ? works : []).forEach((w, index) => {
    insert.run(artworkId, index, w.title || '', w.artist || '', w.date || '', w.museum || '', w.caption || '',
      w.imageUrl || '', w.imagePage || '', w.imageData || null, w.imageMime || 'image/jpeg',
      w.imageStatus || 'missing', w.status || 'draft', now());
  });
  return listSimilarWorks(artworkId);
}
export function listSimilarWorks(artworkId) {
  return getDb().prepare('SELECT * FROM similar_works WHERE artwork_id = ? ORDER BY sort_order, id').all(artworkId).map(rowToSimilar);
}
export function getSimilarImage(artworkId, similarId) {
  const row = getDb().prepare('SELECT image_data, image_mime FROM similar_works WHERE id = ? AND artwork_id = ?').get(similarId, artworkId);
  return (row && row.image_data) ? { data: row.image_data, mime: row.image_mime } : null;
}
export function updateSimilarWork(similarId, patch) {
  const map = { title: 'title', artist: 'artist', date: 'date', museum: 'museum', caption: 'caption', imageUrl: 'image_url', imagePage: 'image_page', imageStatus: 'image_status', imageData: 'image_data', imageMime: 'image_mime', sortOrder: 'sort_order' };
  const sets = [];
  const values = [];
  for (const [key, col] of Object.entries(map)) {
    if (patch[key] !== undefined) { sets.push(col + '=?'); values.push(patch[key]); }
  }
  if (sets.length) {
    values.push(now(), similarId);
    getDb().prepare(`UPDATE similar_works SET ${sets.join(', ')}, updated_at=? WHERE id=?`).run(...values);
  }
  return rowToSimilar(getDb().prepare('SELECT * FROM similar_works WHERE id = ?').get(similarId));
}
export function clearSimilarImage(similarId) {
  getDb().prepare("UPDATE similar_works SET image_data = NULL, image_mime = 'image/jpeg', image_status = 'missing', image_url = '', image_page = '', updated_at = ? WHERE id = ?").run(now(), similarId);
  return rowToSimilar(getDb().prepare('SELECT * FROM similar_works WHERE id = ?').get(similarId));
}

// --- lettura completa (per viewer / publish) ---
export function getFullArtwork(id) {
  const artwork = getArtwork(id);
  if (!artwork) return null;
  const overview = getOverview(id);
  const details = listDetails(id).map(detail => {
    const studio = getDetailContent(detail.id, 'studio');
    const approfondimento = getDetailContent(detail.id, 'approfondimento');
    return { ...detail, tabs: { studio, approfondimento } };
  });
  return { ...artwork, overview, details, sources: listSources(id), similarWorks: listSimilarWorks(id) };
}

export function countStatus() {
  return {
    artworks: getDb().prepare('SELECT COUNT(*) AS c FROM artworks').get().c,
    ready: getDb().prepare("SELECT COUNT(*) AS c FROM artworks WHERE status = 'ready'").get().c,
    generated: getDb().prepare("SELECT COUNT(*) AS c FROM artworks WHERE status = 'generated'").get().c
  };
}

// --- Schede "Soggetto nella storia dell'arte" ---
function rowToSubject(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, shortDesc: row.short_desc,
    intro: row.intro, origins: row.origins, symbols: row.symbols,
    interpretations: row.interpretations, curiosities: row.curiosities,
    status: row.status, createdAt: row.created_at, updatedAt: row.updated_at
  };
}
export function createSubject({ id, name }) {
  getDb().prepare('INSERT INTO subjects (id, name, status, created_at, updated_at) VALUES (?, ?, \'draft\', ?, ?)')
    .run(id, name || '', now(), now());
  return getSubject(id);
}
export function getSubject(id, conn) {
  return rowToSubject((conn || getDb()).prepare('SELECT * FROM subjects WHERE id = ?').get(id));
}
export function listSubjects(conn) {
  return (conn || getDb()).prepare('SELECT * FROM subjects ORDER BY updated_at DESC').all().map(rowToSubject);
}
export function updateSubject(id, patch) {
  const current = getSubject(id);
  if (!current) return null;
  const fields = ['name', 'short_desc', 'intro', 'origins', 'symbols', 'interpretations', 'curiosities', 'status'];
  const sets = []; const values = [];
  for (const f of fields) {
    if (patch[f] !== undefined) { sets.push(f + '=?'); values.push(patch[f]); }
  }
  if (sets.length) { values.push(now(), id); getDb().prepare(`UPDATE subjects SET ${sets.join(', ')}, updated_at=? WHERE id=?`).run(...values); }
  return getSubject(id);
}
export function deleteSubject(id) {
  getDb().prepare('DELETE FROM subjects WHERE id = ?').run(id);
}
export function approveSubject(id) {
  const subject = getSubject(id);
  if (!subject) return null;
  updateSubject(id, { status: 'ready' });
  return getSubject(id);
}
export function replaceSubjectChapters(subjectId, items) {
  getDb().prepare('DELETE FROM subject_chapters WHERE subject_id = ?').run(subjectId);
  const insert = getDb().prepare('INSERT INTO subject_chapters (subject_id, sort_order, era, text) VALUES (?, ?, ?, ?)');
  (Array.isArray(items) ? items : []).forEach((c, index) => insert.run(subjectId, index, c.era || '', c.text || ''));
  return listSubjectChapters(subjectId);
}
export function listSubjectChapters(subjectId, conn) {
  return (conn || getDb()).prepare('SELECT * FROM subject_chapters WHERE subject_id = ? ORDER BY sort_order, id').all(subjectId)
    .map(r => ({ id: r.id, era: r.era, text: r.text, sortOrder: r.sort_order }));
}
function rowToSubjectWork(row) {
  if (!row) return null;
  return {
    id: row.id, sortOrder: row.sort_order, title: row.title, artist: row.artist, date: row.date,
    museum: row.museum, caption: row.caption, imageUrl: row.image_url, imagePage: row.image_page,
    hasImage: Boolean(row.image_data), imageStatus: row.image_status, status: row.status
  };
}
export function replaceSubjectWorks(subjectId, works) {
  getDb().prepare('DELETE FROM subject_works WHERE subject_id = ?').run(subjectId);
  const insert = getDb().prepare(`INSERT INTO subject_works (subject_id, sort_order, title, artist, date, museum, caption, image_url, image_page, image_data, image_mime, image_status, status, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  (Array.isArray(works) ? works : []).forEach((w, index) => {
    insert.run(subjectId, index, w.title || '', w.artist || '', w.date || '', w.museum || '', w.caption || '',
      w.imageUrl || '', w.imagePage || '', w.imageData || null, w.imageMime || 'image/jpeg',
      w.imageStatus || 'missing', w.status || 'draft', now());
  });
  return listSubjectWorks(subjectId);
}
export function listSubjectWorks(subjectId, conn) {
  return (conn || getDb()).prepare('SELECT * FROM subject_works WHERE subject_id = ? ORDER BY sort_order, id').all(subjectId).map(rowToSubjectWork);
}
export function getSubjectWorkImage(subjectId, workId, conn) {
  const row = (conn || getDb()).prepare('SELECT image_data, image_mime FROM subject_works WHERE id = ? AND subject_id = ?').get(workId, subjectId);
  return (row && row.image_data) ? { data: row.image_data, mime: row.image_mime } : null;
}
export function getFullSubject(id, conn) {
  const c = conn || getDb();
  const subject = getSubject(id, c);
  if (!subject) return null;
  return { ...subject, chapters: listSubjectChapters(id, c), works: listSubjectWorks(id, c) };
}

// --- Schede "Faccia a faccia" ---
function rowToComparison(row) {
  if (!row) return null;
  return {
    id: row.id, title: row.title, comparisonType: row.comparison_type,
    intro: row.intro, technique: row.technique, context: row.context,
    critique: row.critique, curiosities: row.curiosities,
    hasThumb: Boolean(row.thumb_data), status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}
export function createComparison({ id, title = '', comparisonType = 'same-subject' }) {
  getDb().prepare('INSERT INTO comparisons (id, title, comparison_type, status, created_at, updated_at) VALUES (?, ?, ?, \'draft\', ?, ?)')
    .run(id, title, comparisonType, now(), now());
  return getComparison(id);
}
export function getComparison(id, conn) {
  return rowToComparison((conn || getDb()).prepare('SELECT * FROM comparisons WHERE id = ?').get(id));
}
export function listComparisons(conn) {
  return (conn || getDb()).prepare('SELECT * FROM comparisons ORDER BY updated_at DESC').all().map(rowToComparison);
}
export function updateComparison(id, patch) {
  const current = getComparison(id);
  if (!current) return null;
  const fields = ['title', 'comparison_type', 'intro', 'technique', 'context', 'critique', 'curiosities', 'status'];
  const sets = []; const values = [];
  for (const f of fields) {
    if (patch[f] !== undefined) { sets.push(f + '=?'); values.push(patch[f]); }
  }
  if (sets.length) { values.push(now(), id); getDb().prepare(`UPDATE comparisons SET ${sets.join(', ')}, updated_at=? WHERE id=?`).run(...values); }
  return getComparison(id);
}
export function deleteComparison(id) {
  getDb().prepare('DELETE FROM comparisons WHERE id = ?').run(id);
}
export function setComparisonThumb(id, data, mime = 'image/jpeg') {
  getDb().prepare('UPDATE comparisons SET thumb_data = ?, thumb_mime = ?, updated_at = ? WHERE id = ?').run(data, mime, now(), id);
  return getComparison(id);
}
export function approveComparison(id) {
  const comparison = getComparison(id);
  if (!comparison) return null;
  updateComparison(id, { status: 'ready' });
  return getComparison(id);
}
function rowToSide(row) {
  if (!row) return null;
  return {
    id: row.id, side: row.side, source: row.source, artworkId: row.artwork_id,
    title: row.title, artist: row.artist, date: row.date, museum: row.museum,
    hasImage: Boolean(row.image_data), imageUrl: row.image_url, imageStatus: row.image_status
  };
}
export function setComparisonSide(comparisonId, side, data) {
  getDb().prepare(`INSERT INTO comparison_sides (comparison_id, side, source, artwork_id, title, artist, date, museum, image_data, image_mime, image_url, image_status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(comparison_id, side) DO UPDATE SET
                source=excluded.source, artwork_id=excluded.artwork_id, title=excluded.title, artist=excluded.artist,
                date=excluded.date, museum=excluded.museum, image_data=excluded.image_data, image_mime=excluded.image_mime,
                image_url=excluded.image_url, image_status=excluded.image_status, updated_at=excluded.updated_at`)
    .run(comparisonId, side, data.source || 'external', data.artworkId || null,
      data.title || '', data.artist || '', data.date || '', data.museum || '',
      data.imageData || null, data.imageMime || 'image/jpeg', data.imageUrl || '', data.imageStatus || 'missing', now(), now());
  return getComparisonSide(comparisonId, side);
}
export function getComparisonSide(comparisonId, side, conn) {
  return rowToSide((conn || getDb()).prepare('SELECT * FROM comparison_sides WHERE comparison_id = ? AND side = ?').get(comparisonId, side));
}
export function listComparisonSides(comparisonId, conn) {
  return (conn || getDb()).prepare('SELECT * FROM comparison_sides WHERE comparison_id = ? ORDER BY side').all(comparisonId).map(rowToSide);
}
export function getComparisonSideImage(comparisonId, side, conn) {
  const row = (conn || getDb()).prepare('SELECT image_data, image_mime FROM comparison_sides WHERE comparison_id = ? AND side = ?').get(comparisonId, side);
  return (row && row.image_data) ? { data: row.image_data, mime: row.image_mime } : null;
}
export function getComparisonThumb(comparisonId, conn) {
  const row = (conn || getDb()).prepare('SELECT thumb_data, thumb_mime FROM comparisons WHERE id = ?').get(comparisonId);
  return (row && row.thumb_data) ? { data: row.thumb_data, mime: row.thumb_mime || 'image/jpeg' } : null;
}
export function replaceComparisonPoints(comparisonId, points) {
  getDb().prepare('DELETE FROM comparison_points WHERE comparison_id = ?').run(comparisonId);
  const insert = getDb().prepare('INSERT INTO comparison_points (comparison_id, kind, sort_order, title, text) VALUES (?, ?, ?, ?, ?)');
  (Array.isArray(points) ? points : []).forEach((p, index) => insert.run(comparisonId, p.kind === 'different' ? 'different' : 'similar', index, p.title || '', p.text || ''));
  return listComparisonPoints(comparisonId);
}
export function listComparisonPoints(comparisonId, conn) {
  return (conn || getDb()).prepare('SELECT * FROM comparison_points WHERE comparison_id = ? ORDER BY kind, sort_order, id').all(comparisonId)
    .map(r => ({ id: r.id, kind: r.kind, title: r.title, text: r.text, sortOrder: r.sort_order }));
}
export function getFullComparison(id, conn) {
  const c = conn || getDb();
  const comparison = getComparison(id, c);
  if (!comparison) return null;
  return { ...comparison, sides: listComparisonSides(id, c), points: listComparisonPoints(id, c) };
}

// --- approvazione e publish ---
export function approveArtwork(id) {
  const artwork = getArtwork(id);
  if (!artwork) return null;
  getDb().prepare("UPDATE detail_content SET status = 'approved' WHERE detail_id IN (SELECT id FROM details WHERE artwork_id = ?)").run(id);
  getDb().prepare("UPDATE overview SET status = 'approved' WHERE artwork_id = ?").run(id);
  getDb().prepare("UPDATE similar_works SET status = 'approved' WHERE artwork_id = ?").run(id);
  updateArtwork(id, { status: 'ready' });
  return getFullArtwork(id);
}

export function publishArtwork(id) {
  const full = getFullArtwork(id);
  if (!full || full.status !== 'ready') return null;
  return {
    id: full.id,
    title: full.title,
    artist: full.artist,
    date: full.date,
    period: full.period,
    technique: full.technique,
    institution: full.institution,
    location: full.location,
    imageUrl: '/api/artworks/' + full.id + '/image',
    annotatedImageUrl: full.hasAnnotated ? '/api/artworks/' + full.id + '/image-annotated' : null,
    status: full.status,
    publishedAt: new Date().toISOString(),
    overview: full.overview
      ? { painting: full.overview.painting, artist: full.overview.artist }
      : null,
    details: full.details.map(detail => ({
      id: detail.id,
      title: detail.title,
      category: detail.category,
      region: detail.region,
      tabs: {
        studio: detail.tabs.studio ? detail.tabs.studio.content : null,
        approfondimento: detail.tabs.approfondimento ? detail.tabs.approfondimento.content : null
      }
    })),
    sources: full.sources.map(s => ({ title: s.title, url: s.url, type: s.type })),
    similarWorks: full.similarWorks.map(s => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      date: s.date,
      museum: s.museum,
      caption: s.caption,
      imageUrl: s.hasImage ? '/api/artworks/' + full.id + '/similar/' + s.id + '/image' : null,
      sourceUrl: s.imagePage || s.imageUrl,
      imageStatus: s.imageStatus
    }))
  };
}

// ---------------------------------------------------------------------------
// Nucleo generico (Fase 2): CRUD materie / modelli / schede-lezione / sezioni / immagini.
// Additivo: le funzioni legacy sopra restano intatte.
// La validazione dei corpi-sezione riusa il registry dei tipi via import
// dinamico evitato qui per non accoppiare lo storage: il chiamante (server)
// valida con core/* prima di salvare; qui si applica il gate required.
// ---------------------------------------------------------------------------
function rowToMateria(row) {
  if (!row) return null;
  return { id: row.id, nome: row.nome, descrizione: row.descrizione, stato: row.stato, systemPrompt: row.system_prompt || '', createdAt: row.created_at };
}
function rowToModello(row) {
  if (!row) return null;
  let schema = {};
  try { schema = JSON.parse(row.schema_json || '{}'); } catch { schema = {}; }
  return { id: row.id, materiaId: row.materia_id, chiave: row.chiave, nome: row.nome, versione: row.versione, schema, createdAt: row.created_at };
}
function rowToScheda(row) {
  if (!row) return null;
  let attive = null;
  try { const v = JSON.parse(row.sezioni_attive || 'null'); if (Array.isArray(v)) attive = v; } catch { attive = null; }
  return { id: row.id, modelloId: row.modello_id, titolo: row.titolo, stato: row.stato, sezioniAttive: attive, createdAt: row.created_at, updatedAt: row.updated_at };
}
function encodeAttive(v) {
  if (v === undefined || v === null) return null; // null = non toccare / tutte
  if (!Array.isArray(v)) throw new Error('sezioniAttive deve essere un array di chiavi');
  return JSON.stringify(v.map(String));
}

export function upsertMateria({ id, nome, descrizione = '', stato = 'attiva', systemPrompt = '' }) {
  if (!String(id || '').trim()) throw new Error('materia.id obbligatorio');
  // Il system_prompt si imposta solo all'inserimento: il seed a ogni avvio non
  // deve mai sovrascrivere il tono personalizzato dall'utente (PATCH lo aggiorna).
  getDb().prepare(`INSERT INTO materie (id, nome, descrizione, stato, system_prompt) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, descrizione=excluded.descrizione, stato=excluded.stato`)
    .run(id, nome || '', descrizione || '', stato || 'attiva', systemPrompt || '');
  return getMateria(id);
}
export function updateMateria(id, patch = {}) {
  const current = getMateria(id);
  if (!current) return null;
  const merged = {
    nome: patch.nome !== undefined ? String(patch.nome) : current.nome,
    descrizione: patch.descrizione !== undefined ? String(patch.descrizione) : current.descrizione,
    stato: patch.stato !== undefined ? String(patch.stato) : current.stato,
    systemPrompt: patch.systemPrompt !== undefined ? String(patch.systemPrompt) : current.systemPrompt,
  };
  if (!merged.nome.trim()) throw new Error('materia.nome obbligatorio');
  getDb().prepare('UPDATE materie SET nome = ?, descrizione = ?, stato = ?, system_prompt = ? WHERE id = ?')
    .run(merged.nome, merged.descrizione, merged.stato, merged.systemPrompt, id);
  return getMateria(id);
}
export function deleteMateria(id) {
  getDb().prepare('DELETE FROM materie WHERE id = ?').run(id);
}
export function getMateria(id, conn) {
  const row = (conn || getDb()).prepare('SELECT * FROM materie WHERE id = ?').get(id);
  return rowToMateria(row);
}
export function listMaterie(conn) {
  return (conn || getDb()).prepare('SELECT * FROM materie ORDER BY id').all().map(rowToMateria);
}

export function modelloIdStabile(materiaId, chiave, versione) {
  return `${materiaId}:${chiave}:v${versione}`;
}
export function upsertModello({ materiaId, chiave, nome, versione = 1, schema }) {
  if (!String(materiaId || '').trim()) throw new Error('modello.materiaId obbligatorio');
  if (!String(chiave || '').trim()) throw new Error('modello.chiave obbligatorio');
  if (!getMateria(materiaId)) throw new Error(`materia sconosciuta: ${materiaId}`);
  const id = modelloIdStabile(materiaId, chiave, versione);
  // Come per systemPrompt: il seed a ogni avvio non deve mai sovrascrivere lo
  // schema di un modello con schede (congelato). Solo il nome si aggiorna.
  if (modelHasCards(id)) {
    getDb().prepare('UPDATE modelli_scheda SET nome = ? WHERE id = ?').run(nome || '', id);
    return getModello(id);
  }
  getDb().prepare(`INSERT INTO modelli_scheda (id, materia_id, chiave, nome, versione, schema_json) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, schema_json=excluded.schema_json`)
    .run(id, materiaId, chiave, nome || '', versione, JSON.stringify(schema || {}));
  return getModello(id);
}
export function getModello(id, conn) {
  const row = (conn || getDb()).prepare('SELECT * FROM modelli_scheda WHERE id = ?').get(id);
  return rowToModello(row);
}
export function updateModello(id, { nome, schema } = {}) {
  const current = getModello(id);
  if (!current) return null;
  getDb().prepare('UPDATE modelli_scheda SET nome = ?, schema_json = ? WHERE id = ?')
    .run(nome !== undefined ? String(nome) : current.nome, JSON.stringify(schema !== undefined ? schema : current.schema), id);
  return getModello(id);
}
export function deleteModello(id) {
  getDb().prepare('DELETE FROM modelli_scheda WHERE id = ?').run(id);
}
export function modelHasCards(modelloId, conn) {
  const row = (conn || getDb()).prepare('SELECT COUNT(*) AS c FROM schede_lezione WHERE modello_id = ?').get(modelloId);
  return (row?.c || 0) > 0;
}
export function listModelli(materiaId, conn) {
  if (materiaId) return (conn || getDb()).prepare('SELECT * FROM modelli_scheda WHERE materia_id = ? ORDER BY chiave, versione').all(materiaId).map(rowToModello);
  return (conn || getDb()).prepare('SELECT * FROM modelli_scheda ORDER BY materia_id, chiave, versione').all().map(rowToModello);
}

// Popola il nucleo dal registry dichiarativo (core/models.mjs): idempotente.
// Accetta { materie: [...], modelli: [...] } per restare iniettabile nei test.
// Il system_prompt si imposta solo alla prima creazione (vedi upsertMateria).
export function seedCore({ materie = [], modelli = [] } = {}) {
  for (const m of materie) upsertMateria({ id: m.id, nome: m.nome, descrizione: m.descrizione || '', stato: m.stato || 'attiva', systemPrompt: m.systemPrompt || '' });
  for (const mod of modelli) {
    upsertModello({ materiaId: mod.subject, chiave: mod.key, nome: mod.name, versione: mod.version || 1, schema: mod });
  }
  return { materie: listMaterie().length, modelli: listModelli().length };
}

export function createScheda({ id = null, modelloId, titolo = '', sezioniAttive = null }) {
  const modello = getModello(modelloId);
  if (!modello) throw new Error(`modello sconosciuto: ${modelloId}`);
  const schedaId = id || ('scheda-' + Date.now().toString(36));
  if (getScheda(schedaId)) throw new Error(`esiste già una scheda con id ${schedaId}`);
  const att = encodeAttive(sezioniAttive);
  getDb().prepare(`INSERT INTO schede_lezione (id, modello_id, titolo, stato, sezioni_attive, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?, ?)`)
    .run(schedaId, modelloId, titolo || '', att === null ? '' : att, now(), now());
  return getScheda(schedaId);
}
export function getScheda(id, conn) {
  const row = (conn || getDb()).prepare('SELECT * FROM schede_lezione WHERE id = ?').get(id);
  return rowToScheda(row);
}
export function listSchede({ modelloId = null, stato = null } = {}, conn) {
  const db = conn || getDb();
  if (modelloId && stato) return db.prepare('SELECT * FROM schede_lezione WHERE modello_id = ? AND stato = ? ORDER BY updated_at DESC').all(modelloId, stato).map(rowToScheda);
  if (modelloId) return db.prepare('SELECT * FROM schede_lezione WHERE modello_id = ? ORDER BY updated_at DESC').all(modelloId).map(rowToScheda);
  if (stato) return db.prepare('SELECT * FROM schede_lezione WHERE stato = ? ORDER BY updated_at DESC').all(stato).map(rowToScheda);
  return db.prepare('SELECT * FROM schede_lezione ORDER BY updated_at DESC').all().map(rowToScheda);
}
export function updateScheda(id, patch = {}) {
  const current = getScheda(id);
  if (!current) return null;
  const titolo = patch.titolo !== undefined ? String(patch.titolo) : current.titolo;
  let att = null;
  let attTouched = false;
  if (patch.sezioniAttive !== undefined) { att = encodeAttive(patch.sezioniAttive); attTouched = true; }
  if (attTouched) {
    getDb().prepare('UPDATE schede_lezione SET titolo = ?, sezioni_attive = ?, updated_at = ? WHERE id = ?')
      .run(titolo, att === null ? '' : att, now(), id);
  } else {
    getDb().prepare('UPDATE schede_lezione SET titolo = ?, updated_at = ? WHERE id = ?').run(titolo, now(), id);
  }
  return getScheda(id);
}
export function deleteScheda(id) {
  getDb().prepare('DELETE FROM schede_lezione WHERE id = ?').run(id);
}

function parseCorpo(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}
function rowToSezione(row) {
  if (!row) return null;
  return { id: row.id, schedaId: row.scheda_id, chiave: row.chiave, titolo: row.titolo, corpo: parseCorpo(row.corpo_json), ordine: row.ordine, model: row.model || '', promptVersion: row.prompt_version || '', updatedAt: row.updated_at };
}
export function saveSezione(schedaId, chiave, corpo, meta = {}) {
  const scheda = getScheda(schedaId);
  if (!scheda) throw new Error(`scheda sconosciuta: ${schedaId}`);
  const modello = getModello(scheda.modelloId);
  const def = modello && Array.isArray(modello.schema.sections)
    ? modello.schema.sections.find((s) => s.key === chiave)
    : null;
  if (!def) throw new Error(`sezione sconosciuta per questo modello: ${chiave}`);
  if (scheda.sezioniAttive && !scheda.sezioniAttive.includes(chiave)) {
    throw new Error(`sezione non attiva per questa scheda: ${chiave}`);
  }
  const corpoObj = (corpo && typeof corpo === 'object') ? corpo : parseCorpo(corpo);
  const ordine = Math.max(0, modello.schema.sections.findIndex((s) => s.key === chiave));
  getDb().prepare(`INSERT INTO sezioni (scheda_id, chiave, titolo, corpo_json, ordine, model, prompt_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scheda_id, chiave) DO UPDATE SET titolo=excluded.titolo, corpo_json=excluded.corpo_json, ordine=excluded.ordine, model=excluded.model, prompt_version=excluded.prompt_version, updated_at=excluded.updated_at`)
    .run(schedaId, chiave, def.title || '', JSON.stringify(corpoObj), ordine, String(meta.model || ''), String(meta.promptVersion || ''), now());
  return getSezione(schedaId, chiave);
}
export function getSezione(schedaId, chiave, conn) {
  const row = (conn || getDb()).prepare('SELECT * FROM sezioni WHERE scheda_id = ? AND chiave = ?').get(schedaId, chiave);
  return rowToSezione(row);
}
export function listSezioni(schedaId, conn) {
  return (conn || getDb()).prepare('SELECT * FROM sezioni WHERE scheda_id = ? ORDER BY ordine, chiave').all(schedaId).map(rowToSezione);
}

function corpoVuoto(tipo, corpo, haImmagini) {
  if (tipo === 'image') return !haImmagini;
  if (!corpo || typeof corpo !== 'object') return true;
  if (tipo === 'text') return !String(corpo.text || '').trim();
  if (tipo === 'epochs') return !Array.isArray(corpo.chapters) || corpo.chapters.length === 0;
  if (tipo === 'works') return !Array.isArray(corpo.works) || corpo.works.length === 0;
  if (tipo === 'points') return !Array.isArray(corpo.items) || corpo.items.length === 0;
  if (tipo === 'kv') return !Array.isArray(corpo.entries) || corpo.entries.length === 0;
  if (tipo === 'pair') {
    const a = corpo.a || {}, b = corpo.b || {};
    return (!String(a.title || '').trim() && !String(a.text || '').trim()) && (!String(b.title || '').trim() && !String(b.text || '').trim());
  }
  return false;
}

// Gate "Genera e salva prima i contenuti": ready solo a sezioni required piene.
// Ritorna { ok, missing: [chiavi] }; se ok, passa la scheda a ready.
// Conta solo le required comprese in sezioni_attive (null = tutte).
export function approveScheda(id) {
  const scheda = getScheda(id);
  if (!scheda) return null;
  const modello = getModello(scheda.modelloId);
  const sections = (modello && Array.isArray(modello.schema.sections)) ? modello.schema.sections : [];
  const attive = scheda.sezioniAttive;
  const salvate = new Map(listSezioni(id).map((s) => [s.chiave, s.corpo]));
  const nImmagini = getDb().prepare('SELECT COUNT(*) AS c FROM immagini WHERE scheda_id = ?').get(id).c;
  const missing = sections
    .filter((s) => s.required && (!attive || attive.includes(s.key)))
    .filter((s) => corpoVuoto(s.type, salvate.get(s.key), nImmagini > 0)).map((s) => s.key);
  if (missing.length) return { ok: false, missing };
  getDb().prepare("UPDATE schede_lezione SET stato = 'ready', updated_at = ? WHERE id = ?").run(now(), id);
  return { ok: true, missing: [], scheda: getScheda(id) };
}

export function addImmagine(schedaId, ruolo, dati, mime = 'image/jpeg') {
  if (!getScheda(schedaId)) throw new Error(`scheda sconosciuta: ${schedaId}`);
  if (!String(ruolo || '').trim()) throw new Error('immagini.ruolo obbligatorio');
  const result = getDb().prepare('INSERT INTO immagini (scheda_id, ruolo, dati, mime) VALUES (?, ?, ?, ?)')
    .run(schedaId, ruolo, dati, mime || 'image/jpeg');
  return result.lastInsertRowid;
}
export function listImmagini(schedaId, conn, withData = false) {
  const rows = (conn || getDb()).prepare('SELECT * FROM immagini WHERE scheda_id = ? ORDER BY id').all(schedaId);
  return rows.map((row) => withData
    ? { id: row.id, schedaId: row.scheda_id, ruolo: row.ruolo, data: row.dati, mime: row.mime }
    : { id: row.id, schedaId: row.scheda_id, ruolo: row.ruolo, mime: row.mime, bytes: row.dati ? row.dati.length : 0 });
}
export function getImmagine(immagineId, conn) {
  const row = (conn || getDb()).prepare('SELECT * FROM immagini WHERE id = ?').get(immagineId);
  if (!row) return null;
  return { id: row.id, schedaId: row.scheda_id, ruolo: row.ruolo, data: row.dati, mime: row.mime || 'image/jpeg' };
}
export function deleteImmagine(immagineId) {
  getDb().prepare('DELETE FROM immagini WHERE id = ?').run(immagineId);
}

export function getSchedaFull(id, conn) {
  const db = conn || getDb();
  const scheda = rowToScheda(db.prepare('SELECT * FROM schede_lezione WHERE id = ?').get(id));
  if (!scheda) return null;
  const modello = rowToModello(db.prepare('SELECT * FROM modelli_scheda WHERE id = ?').get(scheda.modelloId));
  const sezioni = db.prepare('SELECT * FROM sezioni WHERE scheda_id = ? ORDER BY ordine, chiave').all(id).map(rowToSezione);
  const immaginiMeta = db.prepare('SELECT id, ruolo, mime, length(dati) AS bytes FROM immagini WHERE scheda_id = ? ORDER BY id').all(id);
  return { ...scheda, modello, sezioni, immagini: immaginiMeta };
}

// ---------------------------------------------------------------------------
// Accesso di SOLA LETTURA per il viewer (noesis-roads): apre una connessione read-only
// al DB di noesis-roads-creator senza MAI scrivere o toccare lo schema. Ogni chiamata
// apre/chiude la connessione: nessun lock persistente verso il server autore.
// ---------------------------------------------------------------------------
function openReadonly() {
  return new DatabaseSync(DB_PATH, { readOnly: true });
}

export function listReadyArtworksRO() {
  const conn = openReadonly();
  try {
    return conn.prepare("SELECT * FROM artworks WHERE status = 'ready' ORDER BY updated_at DESC").all().map(rowToArtwork);
  } finally { conn.close(); }
}

export function getArtworkImageDataRO(id) {
  const conn = openReadonly();
  try {
    return getArtworkImageData(id, conn);
  } finally { conn.close(); }
}

export function getOverviewRO(id) {
  const conn = openReadonly();
  try { return getOverview(id, conn); } finally { conn.close(); }
}

export function listDetailsRO(artworkId) {
  const conn = openReadonly();
  try { return listDetails(artworkId, conn); } finally { conn.close(); }
}

export function getDetailContentRO(detailId, tab) {
  const conn = openReadonly();
  try { return getDetailContent(detailId, tab, conn); } finally { conn.close(); }
}

export function listSourcesRO(artworkId) {
  const conn = openReadonly();
  try { return listSources(artworkId, conn); } finally { conn.close(); }
}

export function listSimilarWorksRO(artworkId) {
  const conn = openReadonly();
  try { return listSimilarWorks(artworkId, conn); } finally { conn.close(); }
}

export function getSimilarImageRO(artworkId, similarId) {
  const conn = openReadonly();
  try { return getSimilarImage(artworkId, similarId); } finally { conn.close(); }
}

// --- Schede Soggetto (RO per il viewer) ---
export function listReadySubjectsRO() {
  const conn = openReadonly();
  try { return conn.prepare("SELECT * FROM subjects WHERE status = 'ready' ORDER BY updated_at DESC").all().map(rowToSubject); } finally { conn.close(); }
}
export function getSubjectRO(id) {
  const conn = openReadonly();
  try { return getFullSubject(id, conn); } finally { conn.close(); }
}
export function getSubjectWorkImageRO(subjectId, workId) {
  const conn = openReadonly();
  try { return getSubjectWorkImage(subjectId, workId, conn); } finally { conn.close(); }
}

// --- Schede Faccia a faccia (RO per il viewer) ---
export function listReadyComparisonsRO() {
  const conn = openReadonly();
  try { return conn.prepare("SELECT * FROM comparisons WHERE status = 'ready' ORDER BY updated_at DESC").all().map(rowToComparison); } finally { conn.close(); }
}
export function getComparisonRO(id) {
  const conn = openReadonly();
  try { return getFullComparison(id, conn); } finally { conn.close(); }
}
export function getComparisonSideImageRO(comparisonId, side) {
  const conn = openReadonly();
  try { return getComparisonSideImage(comparisonId, side, conn); } finally { conn.close(); }
}
export function getComparisonThumbRO(comparisonId) {
  const conn = openReadonly();
  try {
    const row = conn.prepare('SELECT thumb_data, thumb_mime FROM comparisons WHERE id = ?').get(comparisonId);
    return (row && row.thumb_data) ? { data: row.thumb_data, mime: row.thumb_mime || 'image/jpeg' } : null;
  } finally { conn.close(); }
}

// --- Nucleo generico (RO per il viewer generico) ---
export function listMaterieRO() {
  const conn = openReadonly();
  try { return listMaterie(conn); } finally { conn.close(); }
}
export function listModelliRO(materiaId) {
  const conn = openReadonly();
  try { return listModelli(materiaId, conn); } finally { conn.close(); }
}
export function listReadySchedeRO(modelloId = null) {
  const conn = openReadonly();
  try {
    if (modelloId) return conn.prepare("SELECT * FROM schede_lezione WHERE stato = 'ready' AND modello_id = ? ORDER BY updated_at DESC").all(modelloId).map(rowToScheda);
    return conn.prepare("SELECT * FROM schede_lezione WHERE stato = 'ready' ORDER BY updated_at DESC").all().map(rowToScheda);
  } finally { conn.close(); }
}
export function getSchedaFullRO(id) {
  const conn = openReadonly();
  try { return getSchedaFull(id, conn); } finally { conn.close(); }
}
export function getImmagineRO(immagineId) {
  const conn = openReadonly();
  try { return getImmagine(immagineId, conn); } finally { conn.close(); }
}
