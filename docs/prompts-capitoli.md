# Prompt per capitoli di manuale — tre livelli

Template riutilizzabili per trasformare una scheda esportata (`export/*.md`) in un
capitolo di manuale. Placeholder: `{TITOLO}`, `{ARGOMENTO}`, `{FONTE_MD}`.
Tutti i livelli condividono queste regole base:

- partire SOLO dai contenuti di `{FONTE_MD}`, senza inventare fatti;
- le sezioni marcate ⚠ (punti da ricontrollare) vanno riformulate con cautela
  ("secondo la tradizione interpretativa…", "è discusso…") oppure omesse;
- nessuna ripetizione: ogni concetto è definito una sola volta, poi richiamato;
- citazioni virgolettate SOLO in riquadri `📌 A margine`, mai nel corpo;
- chiudere con riquadro di riepilogo + nota onesta sui punti dibattuti.

---

## 1. Superiori — approfondito (~2000 parole)

> Riscrivi `{FONTE_MD}` come capitolo di manuale di filosofia per la scuola
> secondaria superiore, livello approfondito.
>
> TONO: didattico ma non banale. Narrazione continua con flusso argomentativo,
> non elenchi: fondi le sezioni che si sovrappongono in un unico arco
> (es. biografia+contesto, cuore+temi affini). Le opere diventano un riquadro
> cronologico finale, non testo corrente.
>
> LEGGIBILITÀ: frasi scorrevoli, termini tecnici spiegati alla prima occorrenza,
> poi usati senza ripetere la spiegazione. Date e nomi essenziali una sola volta.
>
> STRUTTURA: apertura con gancio narrativo → contesto storico-filosofico →
> nuclei teorici in 3-4 sezioni → chiusura critica con i dibattiti aperti
> compressi in un paragrafo. 5-6 riquadri `📌 A margine` innestati nel punto
> giusto del testo, ciascuno con UNA citazione + 2-3 righe di spiegazione.

Prompt originale usato per `{TITOLO}` = "Blaise Pascal: la ragione e il cuore":
partire da `export/pascal.md`, tono didattico non banale, evitare ripetizioni
(giansenismo/date definiti una volta), semplice lettura, output
`export/pascal-capitolo.md`, citazioni in riquadri a margine.

---

## 2. Medie — standard (~900 parole)

> Riscrivi `{FONTE_MD}` come capitolo per la scuola secondaria di primo grado
> (medie), livello standard.
>
> TONO: diretto e concreto, esempi vicini all'esperienza dei ragazzi
> (telefono, noia, distrazioni). Niente dibattiti specialistici, niente dottrina
> tecnica: i conflitti dottrinali si nominano in una riga sola.
>
> LEGGIBILITÀ: lessico scolastico, ogni termine nuovo spiegato subito alla prima
> occorrenza, frasi brevi. Stessa struttura narrativa del capitolo superiori ma
> semplificata in 4-5 sezioni corte.
>
> STRUTTURA: apertura con immagine concreta → un'idea per sezione, ciascuna con
> esempio → chiusura in 3 lezioni numerate ("perché studiarlo"). 3-4 riquadri
> `📌 A margine` + riquadro cronologico "in pillole" con sole date-chiave.
> Le affermazioni ⚠ del source si omettono o si generalizzano in forma sicura.

Prompt originale usato per `{TITOLO}` = "Blaise Pascal: il genio che ascoltava
il cuore": stessa fonte `export/pascal.md`, didattica adattata alle medie,
output `export/pascal-capitolo-medie.md`, riquadri a margine.

---

## 3. Elementari — essenziale (~600 parole)

> Riscrivi `{FONTE_MD}` come capitolo per la scuola primaria (elementari),
> livello essenziale.
>
> TONO: registro da racconto ("tanto tempo fa…"), domande dirette al bambino,
> zero date da memorizzare (solo "tanto tempo fa / …anni fa").
>
> LEGGIBILITÀ: frasi brevissime, parole semplici, un concetto per sezione.
> NIENTE nomi secondari, niente titoli in latino, niente conflitti religiosi o
> dottrinali: solo 4 idee essenziali, una per sezione.
>
> STRUTTURA: 4-5 micro-sezioni con titolo-domanda o immagine → chiusura-gioco
> o morale pratica. 3-4 riquadri `📌 A margine` + riquadro "Ricorda" con emoji
> (una riga per idea). I concetti astratti diventano immagini concrete
> (es. "vocina dentro di noi" per l'intuizione).

Prompt originale usato per `{TITOLO}` = "Blaise, il bambino che amava i perché":
stessa fonte `export/pascal.md`, didattica adattata alle elementari, output
`export/pascal-capitolo-elementari.md`, riquadri a margine.
