// Noesis Roads — materie + modelli di scheda dichiarativi (cfr. docs/MODEL_SPEC.md,
// docs/PHILOSOPHY_MODELS.md e mappatura arte in MODEL_SPEC).
// Le viste custom arte restano renderer d'esempio; questi modelli guidano
// il viewer/creator generico senza nuovo codice per materia.

export const MATERIE = Object.freeze([
  { id: 'arte', nome: "Storia dell'arte", descrizione: 'Schede didattiche sulle opere, i soggetti e i confronti.', stato: 'attiva',
    systemPrompt: "Sei uno storico dell'arte e un educatore italiano: preciso su opere, date e attribuzioni, chiaro con gli studenti." },
  { id: 'filosofia', nome: 'Storia della filosofia', descrizione: 'Autori, tematiche e confronti filosofici.', stato: 'attiva',
    systemPrompt: 'Sei uno storico della filosofia e un educatore italiano: rigoroso sulle dottrine attestate, chiaro con gli studenti.' },
  { id: 'letteratura-italiana', nome: 'Letteratura Italiana', descrizione: 'Autori, opere e confronti della letteratura italiana.', stato: 'attiva',
    systemPrompt: 'Sei uno storico della letteratura italiana rigoroso e chiaro: date, opere e testi attestati, mai inventare citazioni.' },
]);

function artModels() {
  return [
    {
      key: 'opera', subject: 'arte', name: "L'opera", version: 1,
      cover: { eyebrow: "Scheda didattica · storia dell'arte", heroRole: 'hero' },
      sections: [
        { key: 'presentazione', title: 'Presentazione', type: 'text', required: true, maxWords: 300, prompt: 'Presenta il dipinto: soggetto, contesto e committenza, iconografia essenziale, stile e importanza.' },
        { key: 'artista', title: "L'artista", type: 'text', required: true, maxWords: 200, prompt: "Chi era l'artista: formazione, tratti stilistici, ruolo nella storia dell'arte." },
        { key: 'tavola', title: 'Tavola', type: 'image', required: false, fullpage: true, prompt: "Tavola dell'opera a tutta pagina (nessun testo generato)." },
        { key: 'dettagli', title: 'Dettagli notevoli', type: 'points', required: true, prompt: 'Dettagli visivi notevoli: per ciascuno osservazione, significato e relazione con gli altri.' },
        { key: 'tecnica', title: 'Tecnica e materia', type: 'text', required: false, maxWords: 120, prompt: 'Come è dipinta: materia, pennellata, colore, luci, supporto.' },
        { key: 'simili', title: 'Opere simili', type: 'works', withImages: true, required: false, prompt: 'Opere reali e celebri con lo stesso soggetto, con perché della somiglianza (max 25 parole).' },
        { key: 'fonti', title: 'Fonti', type: 'kv', required: false, prompt: 'Fonti editoriali: titolo e URL.' },
      ],
    },
    {
      key: 'soggetto', subject: 'arte', name: "Il soggetto nella storia dell'arte", version: 1,
      cover: { eyebrow: "Scheda didattica · storia dell'arte", heroRole: 'hero' },
      sections: [
        { key: 'introduzione', title: 'Introduzione', type: 'text', required: true, maxWords: 250, prompt: "Introduzione al soggetto: di cosa si tratta e perché conta." },
        { key: 'origini', title: 'Origini iconografiche', type: 'text', required: true, maxWords: 250, prompt: 'Origini e fonti iconografiche del soggetto.' },
        { key: 'evoluzione', title: "L'evoluzione per epoche", type: 'epochs', required: true, prompt: 'Evoluzione per epoche: 5-7 capitoli era+testo con autori reali.' },
        { key: 'opere', title: 'Opere rappresentative', type: 'works', withImages: true, required: true, prompt: 'Opere rappresentative con immagini: titolo, autore, data, perché conta (max 25 parole).' },
        { key: 'simboli', title: 'Simboli ricorrenti', type: 'kv', required: false, prompt: 'Attributi e simboli ricorrenti: simbolo verso significato.' },
        { key: 'interpretazioni', title: 'Interpretazioni', type: 'text', required: false, maxWords: 250, prompt: 'Interpretazioni e varianti del soggetto nei secoli.' },
        { key: 'curiosita', title: 'Curiosità', type: 'text', required: false, maxWords: 180, prompt: 'Curiosità e questioni aperte, solo fatti verificabili.' },
      ],
    },
    {
      key: 'confronto', subject: 'arte', name: 'Faccia a faccia', version: 1,
      cover: { eyebrow: "Scheda didattica · storia dell'arte", heroRole: 'thumb' },
      sections: [
        { key: 'coppia', title: 'Le due opere', type: 'pair', required: true, prompt: 'Le due opere a confronto: metadati essenziali per lato.' },
        { key: 'introduzione', title: 'Introduzione', type: 'text', required: true, maxWords: 180, prompt: "Introduzione al confronto: cosa accomuna e cosa distingue le due opere." },
        { key: 'comuni', title: 'Punti in comune', type: 'points', groups: ['comuni'], required: true, prompt: 'Punti in comune: 3-5 voci titolo+testo.' },
        { key: 'differenze', title: 'Differenze', type: 'points', groups: ['differenze'], required: true, prompt: 'Differenze: 4-6 voci titolo+testo.' },
        { key: 'tecnica', title: 'Tecnica a confronto', type: 'text', required: false, maxWords: 200, prompt: 'Tecnica a confronto tra le due opere.' },
        { key: 'contesto', title: 'Contesto', type: 'text', required: false, maxWords: 200, prompt: 'Contesto storico-artistico delle due opere.' },
        { key: 'critica', title: 'Sintesi critica', type: 'text', required: false, maxWords: 200, prompt: 'Interpretazione critica del confronto.' },
        { key: 'curiosita', title: 'Curiosità', type: 'text', required: false, maxWords: 150, prompt: 'Curiosità verificabili sul confronto.' },
      ],
    },
  ];
}

function philosophyModels() {
  return [
    {
      key: 'autore-pensiero', subject: 'filosofia', name: "L'autore e il suo pensiero", version: 1,
      cover: { eyebrow: 'Scheda didattica · filosofia', heroRole: 'ritratto' },
      sections: [
        { key: 'vita', title: 'Vita e contesto', type: 'text', required: true, maxWords: 180, prompt: 'Date, luoghi, formazione, contesto storico. 120-180 parole.' },
        { key: 'nuclei', title: 'I nuclei del pensiero', type: 'points', groups: ['nuclei'], required: true, prompt: 'Nuclei del pensiero: 3-5 voci, una tesi per voce, 40-70 parole, solo dottrine attestate.' },
        { key: 'opere', title: 'Opere chiave', type: 'works', withImages: true, required: true, prompt: 'Opere chiave 4-8 con galleria: titolo, data, perché conta (max 25 parole).' },
        { key: 'concetti', title: 'Concetti e glossario', type: 'kv', required: false, prompt: 'Concetti e glossario: 5-7 voci termine verso significato.' },
        { key: 'citazioni', title: 'Citazioni', type: 'points', groups: ['citazioni'], required: false, prompt: 'Citazioni 2-4: solo citazioni verificabili, con opera di provenienza.' },
        { key: 'questioni', title: 'Questioni aperte', type: 'text', required: false, maxWords: 180, prompt: 'Dibattiti interpretativi reali.' },
      ],
    },
    {
      key: 'tematica', subject: 'filosofia', name: 'La tematica filosofica', version: 1,
      cover: { eyebrow: 'Scheda didattica · filosofia', heroRole: 'hero' },
      sections: [
        { key: 'introduzione', title: 'Introduzione', type: 'text', required: true, maxWords: 200, prompt: 'Introduzione alla questione filosofica.' },
        { key: 'origini', title: 'Origini della questione', type: 'text', required: true, maxWords: 200, prompt: 'Origini della questione: dove e con chi nasce.' },
        { key: 'evoluzione', title: 'Evoluzione per epoche', type: 'epochs', required: true, prompt: 'Evoluzione per epoche: 5-6 capitoli con 1-2 autori reali ciascuno.' },
        { key: 'testi', title: 'Testi e autori', type: 'works', withImages: true, required: true, prompt: 'Testi/autori rappresentativi con galleria semplice.' },
        { key: 'interpretazioni', title: 'Interpretazioni', type: 'text', required: false, maxWords: 220, prompt: 'Interpretazioni principali della questione.' },
        { key: 'curiosita', title: 'Curiosità e questioni', type: 'text', required: false, maxWords: 180, prompt: 'Curiosità e questioni aperte, solo fatti verificabili.' },
      ],
    },
    {
      key: 'opera-filosofica', subject: 'filosofia', name: "L'opera filosofica", version: 1,
      cover: { eyebrow: 'Scheda didattica · filosofia', heroRole: 'copertina' },
      sections: [
        { key: 'argomento', title: "La tesi dell'opera", type: 'text', required: true, maxWords: 200, prompt: "Tesi centrale dell'opera in breve; solo dottrine attestate, mai inventare." },
        { key: 'genesi', title: 'Genesi e composizione', type: 'text', required: true, maxWords: 200, prompt: 'Quando e dove composta, contesto, edizione di riferimento.' },
        { key: 'struttura', title: 'Struttura argomentativa', type: 'points', required: true, prompt: 'Argomentazione in 3-6 voci titolo+testo: parti o capitoli e loro funzione.' },
        { key: 'concetti', title: 'Concetti chiave', type: 'kv', required: true, prompt: 'Concetti chiave 4-6: termine verso significato rigoroso.' },
        { key: 'fortuna', title: 'Fortuna e ricezione', type: 'epochs', required: false, prompt: 'Ricezione ed edizioni per epoche, 4-6 capitoli documentati.' },
        { key: 'questioni', title: 'Questioni aperte', type: 'text', required: false, maxWords: 180, prompt: 'Dibattiti interpretativi reali.' },
      ],
    },
    {
      key: 'confronto-filosofico', subject: 'filosofia', name: 'Il confronto tra due autori', version: 1,
      cover: { eyebrow: 'Scheda didattica · filosofia', heroRole: 'ritratto' },
      sections: [
        { key: 'coppia', title: 'I due autori', type: 'pair', required: true, prompt: 'I due autori a confronto (ritratti): metadati essenziali per lato.' },
        { key: 'introduzione', title: 'Introduzione', type: 'text', required: true, maxWords: 180, prompt: 'Introduzione al confronto: 120-180 parole.' },
        { key: 'comuni', title: 'Punti in comune', type: 'points', groups: ['comuni'], required: true, prompt: 'Punti in comune: 3-5 voci titolo+testo.' },
        { key: 'differenze', title: 'Differenze', type: 'points', groups: ['differenze'], required: true, prompt: 'Differenze: 4-6 voci titolo+testo.' },
        { key: 'metodo', title: 'Metodo e stile', type: 'text', required: false, maxWords: 200, prompt: 'Metodo e stile a confronto.' },
        { key: 'contesto', title: 'Contesto storico', type: 'text', required: false, maxWords: 200, prompt: 'Contesto storico dei due autori.' },
        { key: 'sintesi', title: 'Sintesi critica', type: 'text', required: false, maxWords: 200, prompt: 'Sintesi critica del confronto.' },
        { key: 'curiosita', title: 'Curiosità', type: 'text', required: false, maxWords: 150, prompt: 'Curiosità verificabili.' },
      ],
    },
  ];
}

function letteraturaModels() {
  return [
    {
      key: 'opera-letteraria', subject: 'letteratura-italiana', name: "L'opera letteraria", version: 1,
      cover: { eyebrow: 'Scheda didattica · Letteratura Italiana', heroRole: 'copertina' },
      sections: [
        { key: 'argomento', title: "L'argomento", type: 'text', required: true, maxWords: 200, prompt: 'Argomento in breve: di cosa parla, antefatto essenziale, senza riassunto integrale; solo contenuti attestati.' },
        { key: 'genesi', title: 'Genesi e composizione', type: 'text', required: true, maxWords: 200, prompt: "Quando e dove composta, per chi, dediche, revisioni e varianti d'autore documentate." },
        { key: 'struttura', title: "Struttura dell'opera", type: 'points', required: true, prompt: 'Partizioni (canti, capitoli, atti) in 3-6 voci titolo+testo: cosa contiene ciascuna e la sua funzione.' },
        { key: 'stile', title: 'Stile e lingua', type: 'text', required: true, maxWords: 200, prompt: 'Forma metrica o prosa, lingua, stilemi riconoscibili con esempi brevi e verificabili.' },
        { key: 'fortuna', title: 'Fortuna e ricezione', type: 'epochs', required: false, prompt: 'Per epoche, 4-6 capitoli: edizioni principali, giudizi e riusi documentati, mai inventare date.' },
        { key: 'curiosita', title: 'Edizioni e curiosità', type: 'text', required: false, maxWords: 150, prompt: 'Questioni filologiche e aneddoti: solo fatti verificabili, mai inventare citazioni.' },
      ],
    },
    {
      key: 'tematica-letteraria', subject: 'letteratura-italiana', name: 'Il tema letterario', version: 1,
      cover: { eyebrow: 'Scheda didattica · Letteratura Italiana', heroRole: 'hero' },
      sections: [
        { key: 'introduzione', title: 'Introduzione', type: 'text', required: true, maxWords: 200, prompt: 'Introduzione al tema letterario: di cosa si tratta e perché conta.' },
        { key: 'origini', title: 'Origini del tema', type: 'text', required: true, maxWords: 200, prompt: 'Origini del tema: dove e con chi nasce nella letteratura.' },
        { key: 'evoluzione', title: 'Evoluzione per epoche', type: 'epochs', required: true, prompt: 'Evoluzione per epoche: 5-6 capitoli con autori e opere reali.' },
        { key: 'opere', title: 'Opere ed edizioni', type: 'works', withImages: true, required: true, prompt: 'Opere ed edizioni rappresentative con galleria semplice: titolo, autore, data, perché conta (max 25 parole).' },
        { key: 'interpretazioni', title: 'Interpretazioni', type: 'text', required: false, maxWords: 220, prompt: 'Interpretazioni principali del tema.' },
        { key: 'curiosita', title: 'Curiosità e questioni', type: 'text', required: false, maxWords: 180, prompt: 'Curiosità e questioni aperte, solo fatti verificabili.' },
      ],
    },
  ];
}

const _MODELS = [...artModels(), ...philosophyModels(), ...letteraturaModels()];

export function listMaterie() {
  return MATERIE.map((m) => ({ ...m }));
}

export function listModelli(materiaId) {
  return _MODELS.filter((m) => m.subject === materiaId).map((m) => ({ ...m, sections: m.sections.map((s) => ({ ...s })) }));
}

export function getModello(materiaId, chiave) {
  const found = _MODELS.find((m) => m.subject === materiaId && m.key === chiave);
  if (!found) return null;
  return { ...found, sections: found.sections.map((s) => ({ ...s })) };
}

export function getModelloById(modelloId) {
  // id stabile "materia:chiave:v<versione>" oppure "materia:chiave"
  const [subject, key] = String(modelloId || '').split(':');
  if (!subject || !key) return null;
  return getModello(subject, key);
}

export function modelloIdOf(model) {
  return `${model.subject}:${model.key}:v${model.version}`;
}
