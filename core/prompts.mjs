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
export function assembleSectionPrompts({ materiaId, materia, modello, sezione, titoloScheda = '', livello = '' }) {
  const mat = materiaOf(materia || materiaId, modello);
  const sysBits = [];
  const tone = String(mat.systemPrompt || '').trim();
  sysBits.push(tone || `Sei un educatore italiano della materia "${mat.nome || mat.id}".`);
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
  if (Number.isInteger(sezione?.maxWords)) userBits.push(`Lunghezza vincolante: max ${sezione.maxWords} parole.`);
  if (livello) userBits.push(`Livello: ${livello}.`);

  const versionPayload = JSON.stringify({
    v: modello?.version || 1,
    c: TYPE_CONTRACT_VERSION,
    mat: tone, voice, secSys, fragment,
    type: sezione?.type || '', maxWords: sezione?.maxWords || null,
  });
  return {
    system: sysBits.join('\n\n'),
    user: userBits.join('\n\n'),
    version: `v${modello?.version || 1}:${hash8(versionPayload)}`,
  };
}

// Compat: prima il prompt era un unico messaggio user; ora è system+user.
export function buildSectionPrompt(args) {
  const { system, user } = assembleSectionPrompts(args);
  return `${system}\n\n${user}`;
}
