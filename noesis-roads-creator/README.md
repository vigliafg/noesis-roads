# noesis-roads-creator · app sorella di noesis-roads

Applicazione di **authoring dei contenuti didattici**: carichi l'immagine di un
dipinto e l'LLM propone l'intera scheda (opera, artista, dettagli notevoli e
tutte le sezioni didattiche). Tu rivedi, correggi e **salvi nel database** con
un clic. La sorella **noesis-roads** resta l'app di lettura/esplorazione.

## Stack

- **Zero dipendenze**: Node ≥ 22.5, solo moduli nativi (`node:http`,
  `node:sqlite`). Nessun `npm install`.
- **Database**: SQLite singolo file (`data/noesis-roads-creator.db`, modalità WAL),
  schema normalizzato: `artworks` → `details` (hotspot con regioni 0–1) →
  `detail_content` (7 campi per dettaglio × tab `studio`/`approfondimento`),
  più `overview` (testo opera + artista), `sources` e `similar_works` (10
  opere con lo stesso soggetto, con `image_data` BLOB della thumbnail).
- **Immagini nel DB (BLOB, non base64)**: ogni opera memorizza **due** versioni
  in colonne BLOB — `image_data` (l'immagine pulita originale) e
  `annotated_data` (riquadri oro + didascalie numerate dei dettagli, resa da
  `annotate.py` via PIL). Servite come binario da
  `/api/artworks/:id/image` e `/api/artworks/:id/image-annotated`; il file in
  `uploads/` resta solo scratch per PIL. Le due immagini vengono esportate nel
  publish JSON (campi `imageUrl` / `annotatedImageUrl`) per il viewer. La BLOB
  binaria evita l'+33% di base64 e si serve senza decodifica.
- **Modelli**: riusa il motore del viewer (`../server.mjs`): modello **visione**
  per riconoscimento opera, proposta dettagli e osservazione del crop; modello
  **testo** per le sezioni. Chiave `OPENROUTER_API_KEY` da `.env.local`/`.env`
  alla radice del repo.

## Avvio

```bash
pip install pillow reportlab   # dipendenze Python una tantum (vedi sotto)
cd noesis-roads-creator
node server.mjs            # http://127.0.0.1:18100  (porta: NOESIS_CREATOR_PORT)
```

DB e cartella `uploads/` si creano da soli al primo avvio; sono ignorati da git
(artefatti runtime), quindi su un sistema nuovo la libreria parte **vuota** e va
riempita con la pipeline (vedi "Flusso d'uso"). Il DB demo con l'Annunciazione
(stato `ready`) è presente solo localmente. La procedura completa d'installazione
(requisiti, chiave API, secondo server viewer, verifica) è nel README alla radice.

## Flusso d'uso (una sola richiesta all'utente: l'immagine)

Dopo il caricamento dell'immagine la **pipeline automatica** parte da sola e
procede **in sequenza, senza intervento dell'utente**, mostrando a ogni passo
la percentuale di completamento, la fase corrente e lo stato dei dettagli:

1. **+ Nuova opera** → carica l'immagine del dipinto. Parte subito la
   *generazione automatica* (pannello dedicato con avanzamento in %).
2. **Fase 1 · Riconoscimento** → il modello visione riconosce l'opera e
   compila da solo la scheda (titolo, artista, data, periodo, tecnica,
   istituzione, collocazione); i metadati riconosciuti vengono **persistiti
   subito nel database** (servono alle fasi successive, es. alla
   presentazione).
3. **Fase 2 · Dettagli notevoli** → il modello visione individua 4–6 dettagli
   notevoli come rettangoli normalizzati sovrapposti all'immagine; subito dopo
   viene generata e salvata l'**immagine annotata** (riquadri oro + didascalie
   numerate, una per dettaglio, mai sovrapposte).
4. **Fase 3 · Contenuti dei dettagli** → **un dettaglio alla volta** (in
   sequenza), per ciascuno le due tab tramite `/generate/both` (una sola
   visione condivisa + i due testi in parallelo). A ogni completamento la riga
   diventa ✔ completo e l'editor mostra il contenuto appena generato:
   - **Studio del dettaglio**: `observation` · `meaning` · `relation` ·
     `lookAgain` (Cosa vedi / Cosa significa / In relazione all'opera /
     Guarda ancora).
   - **Approfondimento**: `curiosity` · `comparisons` · `openQuestions` ·
     `technique` · `lookAgain` (Una curiosità / Confronti / Questioni aperte /
     Tecnica e materia). "Tecnica e materia" spiega COME il dettaglio è
     dipinto (tratto e pennellata, colore, luci, ombre e contrasti, zone di
     colore, vernici o dorature, materiali del supporto e dei pigmenti); la
     curiosità è opzionale per progetto (mai inventata).
5. **Fase 4 · Presentazione** → testo "Il dipinto" + "L'artista" (ora la
   scheda riconosciuta è già nel DB, quindi il modello ha i dati dell'opera).
6. **Revisione** → al termine (100%) i contenuti restano editabili uno ad uno
   (scheda, ogni tab di ogni dettaglio, presentazione); le modifiche digitate
   vengono **conservate** dal Salva finale.
7. **💾 Salva nel database** → approva ogni contenuto con le correzioni
   dell'utente, renderizza l'**immagine annotata** (`annotate.py`), marca
   l'opera `ready` e torna alla home con feedback positivo.
8. Dalla home, **Vedi** apre il viewer elegante (overview, hotspot cliccabili,
   le due tab per dettaglio) con il **pannello immagine a fasce**: l'opera
   occupa le fasce 1–4 e la fascia 5 a destra elenca le didascalie dei
   dettagli. Premendo una didascalia quel dettaglio resta a colori (contorno
   evidenziato) mentre il resto dell'immagine passa in scala di grigi; la
   stessa didascalia attiva, premuta di nuovo, ripristina l'immagine
   completa.

Se una fase fallisce (es. rete/rate limit) il pannello offre **⟳ Riprova da
dove si è fermato** (ricomincia solo dai contenuti mancanti, senza duplicare
chiamate) e **✕ Annulla — continua a mano** (i bottoni manuali rimangono
disponibili come fallback).

## API principali

| Metodo | Percorso | Scopo |
|---|---|---|
| POST | `/api/artworks` | crea opera (upload `imageDataUrl` base64) |
| GET | `/api/artworks` · `/api/artworks/:id` | elenco / scheda completa |
| POST | `/api/artworks/:id/generate/meta` | riconoscimento opera (visione) |
| POST | `/api/artworks/:id/generate/details` | proposta dettagli (visione) |
| POST | `/api/details/:id/generate/:tab` | contenuto di una tab (crop + visione + testo) |
| POST | `/api/details/:id/generate/both` | **entrambe le tab in parallelo, UNA visione condivisa** |
| POST | `/api/artworks/:id/generate/overview` | testo presentazione |
| POST | `/api/artworks/:id/generate/similar` | **10 opere con lo stesso soggetto + immagini (Commons/MET → BLOB)** |
| PATCH | `/api/artworks/:id/similar/:sid` | revisione opera simile (campi + URL immagine con re-download) |
| GET | `/api/artworks/:id/similar` · `/similar/:sid/image` | elenco / BLOB immagine opera simile |
| PATCH | `/api/artworks/:id` · `/api/details/:id/content/:tab` | correzioni utente |
| POST | `/api/artworks/:id/annotate` | (ri)genera l'immagine annotata da sola |
| POST | `/api/artworks/:id/approve` · `/publish` | approva (`ready`, annota) / esporta JSON |
| GET | `/api/artworks/:id/image` · `/image-annotated` | BLOB binari dal DB |
| GET | `/api/artworks/:id/pdf` · `/api/subjects/:id/pdf` · `/api/comparisons/:id/pdf` | **PDF "libro d'arte" della scheda** (vedi sotto) |
| DELETE | `/api/artworks/:id` | elimina opera + contenuti (cascade) |

## API generiche — schede-lezione (nucleo Fase 2)

Stesso server, namespace `/api/cards` + `/api/materie` (le legacy restano
intatte). Editor guidato dallo schema: `GET /api/models?subject=…` dà lo
schema, `PATCH …/sections/:sez` salva una sezione validata per tipo,
`POST …/generate/:sez` la genera via LLM, `POST …/approve` applica il gate
required, `GET …/pdf` esporta il PDF con `make_pdf.py` invariato.

| Metodo | Percorso | Scopo |
|---|---|---|
| GET | `/api/materie` | materie disponibili (arte, filosofia) |
| GET | `/api/models?subject=…` | modelli di una materia (schemi completi) |
| GET/POST | `/api/cards[?modello=&stato=]` | elenco / nuova scheda `{modelloId, titolo}` |
| GET/PATCH/DELETE | `/api/cards/:id` | dettaglio completo / titolo / elimina |
| PATCH | `/api/cards/:id/sections/:sez` | revisione sezione `{corpo}`, validata per tipo |
| POST | `/api/cards/:id/generate/:sez` | generazione LLM della sezione |
| POST | `/api/cards/:id/approve` | `ready` (400 con `missing` se required vuote) |
| POST/GET/DELETE | `/api/cards/:id/images[/:imgId]` | upload BLOB `{ruolo, imageDataUrl}` / binario / elimina |
| GET | `/api/cards/:id/pdf` | PDF "libro d'arte" della scheda generica |

`POST /publish` restituisce il JSON pronto da consumare nel viewer, con
`imageUrl` e `annotatedImageUrl`, e l'array `similarWorks` (ogni voce con
`imageUrl` al BLOB locale, `sourceUrl` alla pagina d'origine e `caption`).

## Parallelizzazione LLM (limite contributor: 30 richieste/min)

Per ogni dettaglio le due tab condividono **una sola** chiamata di visione (il
prompt visivo non dipende dal livello) e poi generano i **due testi in
parallelo**: 5 dettagli passano da 20 chiamate a **15** (5 visione + 10 testo).
I dettagli vengono elaborati a ondate di **3 alla volta** (client) e tutte le
chiamate passano da un **rate limiter globale a finestra scorrevole di
26/min** dentro `../server.mjs` (`callModel`), con retry su HTTP 429:
sotto la soglia dei 30/min del piano contributor, mai 429.

Misurato sull'Annunciazione (10 tab): **~2,5 minuti** totali via UI, contro
~10 minuti con la vecchia generazione sequenziale (una tab alla volta).

### Opere simili (carousel "Opere simili" · Passo 4)

La tab **Opere simili** affianca la presentazione: `POST /generate/similar`
fa **una** chiamata al modello (che propone 10 opere reali e celebri con lo
stesso soggetto, `caption` didattica e parole chiave di ricerca) e poi un
**resolver senza chiavi** cerca l'immagine di ogni opera:

1. **Wikimedia Commons** — `action=query&generator=search&gsrnamespace=6`
   (solo file) con `iiurlwidth=640` → thumbnail `image/jpeg`;
2. **MET Open Access** — `search?hasImages=true` → primo `objectID` →
   `primaryImageSmall` (fallback).

Le thumbnail vengono **scaricate e salvate come BLOB** nella colonna
`similar_works.image_data` (immagini locali, offline-safe; `image_status` =
`ok | failed | missing`). Se un'opera non ha immagine, il viewer mostra una
card segnaposto e nella revisione si può incollare un **URL manuale**
(PATCH con re-download). Attribuzione: `image_page`/`sourceUrl` rimandano alla
pagina d'origine (Commons/MET, immagini in pubblico dominio). Il viewer
noesis-roads genera le opere simili a runtime via `POST /api/similar` (stesso
resolver, hotlink).

### Dipendenza di sistema per l'immagine annotata

`annotate.py` richiede **Python 3 con Pillow** (e un font DejaVu su Linux;
fallback automatico al font di default di PIL). Se assente, il salvataggio
funziona comunque ma segnala `annotatedWarning`; si può rigenerare l'immagine
annotata in seguito con `POST /api/artworks/:id/annotate`.

## Esportazione PDF "libro d'arte" (`make_pdf.py`)

Ogni tipo di scheda si esporta come PDF impaginato stile libro d'arte
(pagina A4, carta avorio, doppio filetto oro in copertina, corpo in
DejaVu Serif giustificato, capitoli numerati in romano con etichetta
occhiello), scaricabile dal bottone **⬇ PDF** nella topbar dei tre viewer
(opera, soggetto, faccia a faccia):

| Endpoint | Contenuto del PDF |
|---|---|
| `GET /api/artworks/:id/pdf` | copertina → Presentazione (Il dipinto / L'artista) → tavola dell'opera a pagina intera → un capitolo per dettaglio (crop + Cosa vedi / Cosa significa / In relazione all'opera / Guarda ancora + Una curiosità / Confronti / Questioni aperte / Tecnica e materia) → galleria Opere simili → Fonti |
| `GET /api/subjects/:id/pdf` | copertina → Introduzione → Origini e fonti iconografiche → L'evoluzione per epoche → Opere rappresentative → Attributi e simboli → Interpretazioni e varianti → Curiosità e questioni aperte |
| `GET /api/comparisons/:id/pdf` | copertina (miniatura composita) → Le due opere affiancate → Introduzione → Punti in comune → Differenze → Tecnica a confronto → Contesto storico-artistico → Interpretazione critica → Curiosità |

Dettagli tecnici:

- **Dipendenza**: `make_pdf.py` richiede **Python 3 con reportlab**
  (`pip install reportlab`) oltre a Pillow; se manca, l'endpoint risponde
  `503` con il rimedio, mai una response appesa.
- **Pipeline**: i builder puri `buildArtworkPdfPayload` /
  `buildSubjectPdfPayload` / `buildComparisonPdfPayload` (in `server.mjs`,
  con parametro `io` per iniettare le letture immagini nei test) producono il
  payload tipografico con immagini in base64; `make_pdf.py` decodifica,
  ritaglia (crop dei dettagli, thumbnail max 1800 px) e impagina via
  reportlab. La response è `application/pdf` come attachment
  (`Content-Disposition` con slug del titolo).
- **Gate di prontezza**: `404` se l'id non esiste, `400` con
  "Genera e salva prima i contenuti" se la scheda è vuota (stessi gate dei
  viewer).
- **Robustezza**: BLOB corrotti, formati non riconosciuti o crop degeneri
  (es. box a 0 px) non fanno fallire il PDF — la tavola viene omessa con un
  `AVVISO_PDF` su stderr e il testo resta completo.

## Verifica end-to-end effettuata (settembre 2026)

Flusso completo reale con l'immagine `annunciazione-beato-angelico.jpg`
(Annunciazione di Beato Angelico, San Marco): upload, riconoscimento metadati,
5 dettagli proposti, **tutte le 10 tab generate in parallelo (~2,5 min) con
chiamate reali e zero 429**, salvataggio con feedback positivo, generazione
automatica dell'**immagine annotata** verificata (BLOB serviti dal DB) e il
pannello immagine a fasce con spotlight (dettaglio selezionato a colori su
sfondo in scala di grigi). La scheda demo è nel DB locale in stato
`ready` con entrambe le immagini memorizzate.
