// Noesis Roads — prompt-builder per tipo-sezione + override per modello.
// Prompt finale = intestazione materia/modello + frammento sezione + vincoli.
// Puro, senza IO.
import { MATERIE } from './models.mjs';

const COMMON_RULES = [
  'Italiano chiaro e didattico.',
  'Solo fatti ragionevolmente certi, mai inventare opere/date/citazioni.',
  'Rispondi SOLO con JSON valido nella forma dello schema della sezione.',
].join(' ');

const TYPE_HINTS = {
  text: 'Scrivi un testo continuo, ben strutturato.',
  epochs: 'Rispondi con {"chapters":[{"era":"...","text":"..."}]}: 5-6 capitoli in ordine cronologico, autori reali.',
  works: 'Rispondi con {"works":[{"title":"...","artist":"...","date":"...","museum":"...","caption":"... max 25 parole"}]}: solo opere reali.',
  points: 'Rispondi con {"items":[{"title":"...","text":"..."}]}: voci numerate, una tesi per voce.',
  kv: 'Rispondi con {"entries":[{"label":"...","value":"..."}]}: coppie etichetta/valore.',
  pair: 'Rispondi con {"a":{"title":"...","text":"..."},"b":{"title":"...","text":"..."}}: due lati affiancati.',
  image: 'Nessun testo da generare: verrà usata un’immagine caricata (ruolo indicato).',
};

export function buildSectionPrompt({ materiaId, modello, sezione, titoloScheda = '', livello = '' }) {
  const materia = MATERIE.find((m) => m.id === (materiaId || modello?.subject));
  const header = `Materia: ${materia ? materia.nome : (materiaId || '')}. Modello: ${modello?.name || ''} (${modello?.subject || ''}:${modello?.key || ''}). Scheda: ${titoloScheda || '(nuova scheda)'}. Sezione: ${sezione?.title || ''} [${sezione?.type || ''}].`;
  const fragment = String(sezione?.prompt || '').trim();
  const bits = [header];
  if (fragment) bits.push(fragment);
  const typeHint = TYPE_HINTS[sezione?.type] || '';
  if (typeHint) bits.push(typeHint);
  if (Number.isInteger(sezione?.maxWords)) bits.push(`Lunghezza vincolante: max ${sezione.maxWords} parole.`);
  if (livello) bits.push(`Livello: ${livello}.`);
  bits.push(COMMON_RULES);
  return bits.join('\n\n');
}
