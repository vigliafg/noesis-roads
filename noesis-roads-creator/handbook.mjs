// noesis-roads-creator — handbook-chapter: capitoli di manuale in 3 livelli.
// Sorgente: docs/prompts-capitoli.md. Input: markdown della scheda (export-model
// -> toMarkdown) con badge di verifica; output: markdown del capitolo.
// Livelli: superiori (approfondito ~2000 parole), medie (standard ~900),
// elementari (essenziale ~600). Solo .md, on-demand + memorizzazione in DB.

export const HANDBOOK_LEVELS = ['superiori', 'medie', 'elementari'];

const BASE_RULES = `Regole vincolanti:
- usa SOLO i contenuti della scheda fonte, senza inventare fatti, nomi o date;
- le sezioni marcate con ⚠ (punti da ricontrollare) riformulale con cautela ("secondo la tradizione interpretativa…", "è discusso…") oppure omettile;
- nessuna ripetizione: ogni concetto è definito una sola volta, poi solo richiamato;
- citazioni virgolettate SOLO in riquadri "📌 A margine", mai nel corpo del testo;
- rispondi con il SOLO markdown del capitolo, senza commenti introduttivi.`;

const LEVEL_PROMPTS = {
  superiori: `Riscrivi la scheda fonte come capitolo di manuale di filosofia per la scuola secondaria superiore, livello approfondito (~2000 parole).
TONO: didattico ma non banale. Narrazione continua con flusso argomentativo, non elenchi: fondi le sezioni che si sovrappongono in un unico arco (es. biografia+contesto, cuore+temi affini). Le opere diventano un riquadro cronologico finale, non testo corrente.
LEGGIBILITÀ: frasi scorrevoli, termini tecnici spiegati alla prima occorrenza, poi usati senza ripetere la spiegazione. Date e nomi essenziali una sola volta.
STRUTTURA: apertura con gancio narrativo → contesto storico-filosofico → nuclei teorici in 3-4 sezioni → chiusura critica con i dibattiti aperti compressi in un paragrafo. 5-6 riquadri "📌 A margine" nel punto giusto del testo, ciascuno con UNA citazione + 2-3 righe di spiegazione. Chiudi con riquadro di riepilogo + nota onesta sui punti dibattuti.`,
  medie: `Riscrivi la scheda fonte come capitolo per la scuola secondaria di primo grado (medie), livello standard (~900 parole).
TONO: diretto e concreto, esempi vicini all'esperienza dei ragazzi. Niente dibattiti specialistici, niente dottrina tecnica: i conflitti dottrinali si nominano in una riga sola.
LEGGIBILITÀ: lessico scolastico, ogni termine nuovo spiegato subito alla prima occorrenza, frasi brevi. Stessa struttura narrativa di un capitolo superiori ma semplificata in 4-5 sezioni corte.
STRUTTURA: apertura con immagine concreta → un'idea per sezione, ciascuna con esempio → chiusura in 3 lezioni numerate ("perché studiarlo"). 3-4 riquadri "📌 A margine" + riquadro cronologico "in pillole" con sole date-chiave. Le affermazioni ⚠ della fonte si omettono o si generalizzano in forma sicura.`,
  elementari: `Riscrivi la scheda fonte come capitolo per la scuola primaria (elementari), livello essenziale (~600 parole).
TONO: registro da racconto ("tanto tempo fa…"), domande dirette al bambino, zero date da memorizzare (solo "tanto tempo fa / …anni fa").
LEGGIBILITÀ: frasi brevissime, parole semplici, un concetto per sezione. NIENTE nomi secondari, niente titoli in latino, niente conflitti religiosi o dottrinali: solo 4 idee essenziali, una per sezione.
STRUTTURA: 4-5 micro-sezioni con titolo-immagine → chiusura-gioco o morale pratica. 3-4 riquadri "📌 A margine" + riquadro "Ricorda" con emoji (una riga per idea). I concetti astratti diventano immagini concrete.`,
};

export function isHandbookLevel(livello) {
  return HANDBOOK_LEVELS.includes(String(livello || '').toLowerCase());
}

export function normHandbookLevel(livello) {
  return String(livello || '').toLowerCase();
}

export function buildHandbookPrompts({ livello, titolo = '', markdown = '' }) {
  const lvl = normHandbookLevel(livello);
  const spec = LEVEL_PROMPTS[lvl];
  if (!spec) throw new Error(`Livello handbook sconosciuto: ${livello} (superiori|medie|elementari)`);
  return {
    system: 'Sei un redattore di manuali scolastici italiani: preciso sui fatti, chiaro per età, mai banale. Rispondi SOLO con il markdown del capitolo.',
    user: `${spec}\n\nTitolo della scheda: ${titolo}\n\n--- SCHEDA FONTE (markdown) ---\n${String(markdown || '').slice(0, 24000)}`,
    maxTokens: lvl === 'superiori' ? 6000 : lvl === 'medie' ? 3000 : 2000,
  };
}
