// Noesis Roads — nucleo generico: vocabolario condiviso dei tipi-sezione.
// Puro, senza IO (cfr. docs/TESTING.md): builder convalidabili con unit test.
// Vedi docs/ARCHITECTURE.md tabella tipi-sezione.
export const SECTION_TYPES = Object.freeze({
  text: {
    key: 'text',
    editor: 'textarea',
    viewer: 'paragrafo giustificato',
    pdf: 'p / lead',
    emptyBody: () => ({ text: '' }),
    validate(body) {
      if (!body || typeof body.text !== 'string') return ['text: campo "text" mancante'];
      return [];
    },
    isEmpty: (body) => !body || !String(body.text || '').trim(),
  },
  epochs: {
    key: 'epochs',
    editor: 'lista epoca+testo',
    viewer: 'timeline capitoli',
    pdf: 'chapter + h2 + p',
    emptyBody: () => ({ chapters: [] }),
    validate(body) {
      if (!body || !Array.isArray(body.chapters)) return ['epochs: campo "chapters" mancante'];
      const errs = [];
      body.chapters.forEach((c, i) => {
        if (!c || !String(c.era || '').trim()) errs.push(`epochs[${i}]: "era" mancante`);
        if (!c || !String(c.text || '').trim()) errs.push(`epochs[${i}]: "text" mancante`);
      });
      return errs;
    },
    isEmpty: (body) => !body || !Array.isArray(body.chapters) || body.chapters.length === 0,
  },
  works: {
    key: 'works',
    editor: 'lista opere + immagini',
    viewer: 'galleria 2 colonne',
    pdf: 'gallery',
    emptyBody: () => ({ works: [] }),
    validate(body) {
      if (!body || !Array.isArray(body.works)) return ['works: campo "works" mancante'];
      const errs = [];
      body.works.forEach((w, i) => {
        if (!w || !String(w.title || '').trim()) errs.push(`works[${i}]: "title" mancante`);
      });
      return errs;
    },
    isEmpty: (body) => !body || !Array.isArray(body.works) || body.works.length === 0,
  },
  points: {
    key: 'points',
    editor: 'lista titolo+testo (2 gruppi)',
    viewer: 'elenchi numerati',
    pdf: 'points',
    emptyBody: () => ({ items: [] }),
    validate(body) {
      if (!body || !Array.isArray(body.items)) return ['points: campo "items" mancante'];
      const errs = [];
      body.items.forEach((p, i) => {
        if (!p || !String(p.title || '').trim()) errs.push(`points[${i}]: "title" mancante`);
        if (!p || !String(p.text || '').trim()) errs.push(`points[${i}]: "text" mancante`);
      });
      return errs;
    },
    isEmpty: (body) => !body || !Array.isArray(body.items) || body.items.length === 0,
  },
  kv: {
    key: 'kv',
    editor: 'coppie etichetta/valore',
    viewer: 'tabella',
    pdf: 'kv',
    emptyBody: () => ({ entries: [] }),
    validate(body) {
      if (!body || !Array.isArray(body.entries)) return ['kv: campo "entries" mancante'];
      const errs = [];
      body.entries.forEach((e, i) => {
        if (!e || !String(e.label || e.term || '').trim()) errs.push(`kv[${i}]: etichetta mancante`);
        if (!e || !String(e.value || e.meaning || '').trim()) errs.push(`kv[${i}]: valore mancante`);
      });
      return errs;
    },
    isEmpty: (body) => !body || !Array.isArray(body.entries) || body.entries.length === 0,
  },
  pair: {
    key: 'pair',
    editor: 'due lati A/B + immagini',
    viewer: 'affiancate',
    pdf: 'pair',
    emptyBody: () => ({ a: { title: '', text: '' }, b: { title: '', text: '' } }),
    validate(body) {
      const errs = [];
      for (const side of ['a', 'b']) {
        if (!body || typeof body[side] !== 'object') errs.push(`pair: lato "${side}" mancante`);
        else if (!String(body[side].title || '').trim() && !String(body[side].text || '').trim()) errs.push(`pair: lato "${side}" vuoto`);
      }
      return errs;
    },
    isEmpty: (body) => !body || ((!body.a || (!String(body.a.title || '').trim() && !String(body.a.text || '').trim())) && (!body.b || (!String(body.b.title || '').trim() && !String(body.b.text || '').trim()))),
  },
  image: {
    key: 'image',
    editor: 'upload singolo',
    viewer: 'tavola',
    pdf: 'image (anche fullpage)',
    emptyBody: () => ({ role: '', caption: '' }),
    validate() { return []; }, // il contenuto vero vive in `immagini` (BLOB); il corpo può essere solo didascalia
    isEmpty: () => false, // mai bloccante da solo: la presenza si verifica sulle immagini per ruolo
  },
});

export function isKnownSectionType(type) {
  return Object.prototype.hasOwnProperty.call(SECTION_TYPES, type);
}

export function emptyBodyFor(type) {
  const def = SECTION_TYPES[type];
  if (!def) throw new Error(`Tipo-sezione sconosciuto: ${type}`);
  return def.emptyBody();
}

export function validateBody(type, body) {
  const def = SECTION_TYPES[type];
  if (!def) return [`tipo-sezione sconosciuto: ${type}`];
  return def.validate(body);
}

export function isBodyEmpty(type, body) {
  const def = SECTION_TYPES[type];
  if (!def) return true;
  return def.isEmpty(body);
}
