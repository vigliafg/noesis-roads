// Noesis Roads — prompt-builder per tipo-sezione + override per modello.
//
// I prompt sono DATI versionati, non codice: tono materia ({materie.system_prompt}),
// voce modello (schema.system_prompt), override sezione (sezione.system), frammento
// task (sezione.prompt) + contratto del tipo (TYPE_HINTS + COMMON_RULES).
// Contratto stabile -> system role; task -> messaggio user (vedi assembleSectionPrompts).
// Puro, senza IO.
import { MATERIE } from './models.mjs';

const COMMON_RULES = [
  'Italiano chiaro e didattico.',
  'Solo fatti ragionevolmente certi, mai inventare opere/date/citazioni.',
  'Rispondi SOLO con JSON valido nella forma dello schema della sezione.',
].join(' ');

// Versione del contratto (hint+regole): invalida le prompt_version quando cambia.
export const TYPE_CONTRACT_VERSION = 1;

// Livelli di generazione per scheda (scelti in testata, timbrati per sezione).
export const VERBOSITA = ['essenziale', 'standard', 'approfondita'];
export const ISTRUZIONE = ['primaria', 'secondaria', 'universita'];
export const DEFAULT_VERBOSITA = 'standard';
export const DEFAULT_ISTRUZIONE = 'secondaria';

const WORD_FACTOR = { essenziale: 0.6, standard: 1, approfondita: 1.6 };
// Voci vincolanti per famiglia di tipo (prevalgono sui numeri dei fragment).
const ITEM_COUNTS = {
  essenziale: { list: '2-3', works: '3-4', epochs: '3-4' },
  standard: { list: '3-5', works: '4-8', epochs: '5-6' },
  approfondita: { list: '5-8', works: '6-10', epochs: '6-8' },
};
const VERBOSITY_NOTE = {
  essenziale: 'Priorità alla brevità: rispetta i numeri vincolanti qui sotto anche se il resto ne indica altri; nessun dettaglio superfluo.',
  standard: '',
  approfondita: 'Sviluppa in ampiezza: usa tutti i numeri vincolanti qui sotto e approfondisci ogni voce.',
};
const ISTRUZIONE_BLOCK = {
  primaria: 'Livello di istruzione: primaria. Lessico semplice, frasi brevi, ogni termine tecnico spiegato subito con esempi concreti; niente dibattiti specialistici.',
  secondaria: 'Livello di istruzione: secondaria. Lessico scolastico standard, termini tecnici spiegati alla prima occorrenza, contesto storico essenziale.',
  universita: 'Livello di istruzione: università. Lessico specialistico ammesso, riferimenti storiografici e critici, questioni aperte benvenute, alta densità concettuale.',
};

export function normVerbosita(v) {
  const s = String(v || '').trim().toLowerCase();
  return VERBOSITA.includes(s) ? s : DEFAULT_VERBOSITA;
}
export function normIstruzione(v) {
  const s = String(v || '').trim().toLowerCase();
  return ISTRUZIONE.includes(s) ? s : DEFAULT_ISTRUZIONE;
}
export function scaledMaxWords(base, verbosita) {
  if (!Number.isInteger(base)) return null;
  return Math.max(40, Math.round((base * (WORD_FACTOR[verbosita] || 1)) / 5) * 5);
}

const TYPE_HINTS = {
  text: 'Rispondi con {"text":"..."}: un testo continuo, ben strutturato.',
  epochs: 'Rispondi con {"chapters":[{"era":"...","text":"..."}]}: 5-6 capitoli in ordine cronologico, autori reali.',
  works: 'Rispondi con {"works":[{"title":"...","artist":"...","date":"...","museum":"...","caption":"... max 25 parole"}]}: solo opere reali.',
  points: 'Rispondi con {"items":[{"title":"...","text":"..."}]}: voci numerate, una tesi per voce.',
  kv: 'Rispondi con {"entries":[{"label":"...","value":"..."}]}: coppie etichetta/valore.',
  pair: 'Rispondi con {"a":{"title":"...","text":"..."},"b":{"title":"...","text":"..."}}: due lati affiancati.',
  image: 'Nessun testo da generare: verrà usata un’immagine caricata (ruolo indicato).',
};

function hash8(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function materiaOf(materiaId, modello) {
  if (materiaId && typeof materiaId === 'object') return materiaId;
  const found = MATERIE.find((m) => m.id === (materiaId || modello?.subject));
  if (found) return found;
  return { id: materiaId || modello?.subject || '', nome: materiaId || '', systemPrompt: '' };
}

// Assembla system + user + versione stabile per la generazione di una sezione.
// Accetta materia come id, oggetto {id,nome,systemPrompt} o nulla (fallback registry).
// verbosita/istruzione: livelli scheda (con default); livello: legacy free-text, mantenuto per compat.
export function assembleSectionPrompts({ materiaId, materia, modello, sezione, titoloScheda = '', livello = '', verbosita, istruzione }) {
  const mat = materiaOf(materia || materiaId, modello);
  const verb = normVerbosita(verbosita);
  const istr = normIstruzione(istruzione);
  const sysBits = [];
  const tone = String(mat.systemPrompt || '').trim();
  sysBits.push(tone || `Sei un educatore italiano della materia "${mat.nome || mat.id}".`);
  sysBits.push(ISTRUZIONE_BLOCK[istr]);
  const voice = String(modello?.system_prompt || modello?.systemPrompt || '').trim();
  if (voice) sysBits.push(voice);
  const secSys = String(sezione?.system || '').trim();
  if (secSys) sysBits.push(secSys);
  const typeHint = TYPE_HINTS[sezione?.type] || '';
  if (typeHint) sysBits.push(typeHint);
  sysBits.push(COMMON_RULES);

  const userBits = [
    `Materia: ${mat.nome || mat.id}. Modello: ${modello?.name || ''} (${modello?.subject || ''}:${modello?.key || ''}). Scheda: ${titoloScheda || '(nuova scheda)'}. Sezione: ${sezione?.title || ''} [${sezione?.type || ''}].`,
  ];
  const fragment = String(sezione?.prompt || '').trim();
  if (fragment) userBits.push(fragment);
  const effMax = scaledMaxWords(sezione?.maxWords, verb);
  if (effMax !== null) userBits.push(`Lunghezza vincolante: max ${effMax} parole.`);
  else if (Number.isInteger(sezione?.maxWords)) userBits.push(`Lunghezza vincolante: max ${sezione.maxWords} parole.`);
  const counts = ITEM_COUNTS[verb];
  if (sezione?.type === 'points' || sezione?.type === 'kv') {
    userBits.push(`Numero di voci vincolante: ${counts.list} (prevale su altre indicazioni).`);
  } else if (sezione?.type === 'works') {
    userBits.push(`Numero di opere vincolante: ${counts.works} (prevale su altre indicazioni).`);
  } else if (sezione?.type === 'epochs') {
    userBits.push(`Numero di capitoli vincolante: ${counts.epochs} (prevale su altre indicazioni).`);
  }
  if (VERBOSITY_NOTE[verb]) userBits.push(VERBOSITY_NOTE[verb]);
  if (livello) userBits.push(`Livello: ${livello}.`);

  const versionPayload = JSON.stringify({
    v: modello?.version || 1,
    c: TYPE_CONTRACT_VERSION,
    mat: tone, voice, secSys, fragment,
    type: sezione?.type || '', maxWords: sezione?.maxWords || null,
    verb, istr, livello: String(livello || ''),
  });
  return {
    system: sysBits.join('\n\n'),
    user: userBits.join('\n\n'),
    version: `v${modello?.version || 1}:${hash8(versionPayload)}`,
    verbosita: verb,
    istruzione: istr,
  };
}

// Compat: prima il prompt era un unico messaggio user; ora è system+user.
export function buildSectionPrompt(args) {
  const { system, user } = assembleSectionPrompts(args);
  return `${system}\n\n${user}`;
}
