// Noesis Roads — validazione dei modelli di scheda (cfr. docs/MODEL_SPEC.md).
// Pura, senza IO.
import { isKnownSectionType } from './sectionTypes.mjs';

export function validateModel(model) {
  const errors = [];
  if (!model || typeof model !== 'object') return ['modello non è un oggetto'];
  if (!String(model.key || '').trim()) errors.push('key mancante');
  if (!String(model.subject || '').trim()) errors.push('subject mancante');
  if (!String(model.name || '').trim()) errors.push('name mancante');
  if (!Number.isInteger(model.version) || model.version < 1) errors.push('version deve essere intero >= 1');
  if (!model.cover || typeof model.cover !== 'object') errors.push('cover mancante');
  else {
    if (!String(model.cover.eyebrow || '').trim()) errors.push('cover.eyebrow mancante');
    if (!String(model.cover.heroRole || '').trim()) errors.push('cover.heroRole mancante');
  }
  if (!Array.isArray(model.sections) || model.sections.length === 0) {
    errors.push('sections: almeno una sezione richiesta');
    return errors;
  }
  const seen = new Set();
  model.sections.forEach((s, i) => {
    const where = `sections[${i}]`;
    if (!s || typeof s !== 'object') { errors.push(`${where}: non è un oggetto`); return; }
    if (!String(s.key || '').trim()) errors.push(`${where}: key mancante`);
    else if (seen.has(s.key)) errors.push(`${where}: key duplicata "${s.key}"`);
    else seen.add(s.key);
    if (!String(s.title || '').trim()) errors.push(`${where}: title mancante`);
    if (!isKnownSectionType(s.type)) errors.push(`${where}: type sconosciuto "${s.type}"`);
    if (s.maxWords !== undefined && (!Number.isInteger(s.maxWords) || s.maxWords < 1)) errors.push(`${where}: maxWords non valido`);
  });
  return errors;
}

export function assertValidModel(model) {
  const errors = validateModel(model);
  if (errors.length) throw new Error('Modello non valido: ' + errors.join('; '));
  return true;
}
