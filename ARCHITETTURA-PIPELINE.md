# Architettura delle pipeline — documento di riferimento

> Documento di memoria del progetto: descrive in modo stabile le pipeline dei tre
> componenti (hub, noesis-roads, noesis-roads-creator). Da leggere prima di intervenire sul
> codice; da aggiornare quando una pipeline cambia. Complemento a `README.md`
> (installazione/uso) e ai file `HANDOFF-*.md` (lavoro per data).

## Quadro generale: sistema a tre componenti

| Componente | File | Porta default | Ruolo |
|---|---|---|---|
| **hub** | `launcher.mjs` | 18080 | pagina iniziale + supervisore dei due server (fork, health check, riavvio automatico) |
| **noesis-roads** (viewer) | `server.mjs` + `src/` | 18000 (`APP_PORT`) | **lettura**: espone le schede pubblicate dal DB del creator, read-only |
| **noesis-roads-creator** (authoring) | `noesis-roads-creator/server.mjs` | 18100 (`NOESIS_CREATOR_PORT`) | **produzione**: pipeline AI a step → schede SQLite `ready` |

Flusso di valore: `noesis-roads-creator` crea le schede → DB SQLite condiviso
(`noesis-roads-creator/data/noesis-roads-creator.db`) → `noesis-roads` le legge **in sola lettura** e
le presenta; l'hub tiene accesi e configurati i due programmi.

**Decisioni architetturali da rispettare** (valgono per tutte le pipeline):

- **Zero dipendenze npm**: solo moduli nativi Node ≥ 22.5 (`node:http`,
  `node:sqlite`) + Python 3 con Pillow (`annotate.py`, `compose_thumb.py`) e
  reportlab (`make_pdf.py`). Nessun `package.json`, nessun build.
- **Immagini come BLOB binari nel DB** (non base64, non file su disco): ogni
  immagine servita dagli endpoint `*/image` come binario. `uploads/` è solo scratch.
- **Un solo motore AI condiviso**: `server.mjs` alla radice esporta `callModel`,
  i prompt builder, i normalizer, il **rate limiter globale 26/min + retry su 429**
  e `getOpenRouterApiKey`. Entrambi i server lo importano. Chiave OpenRouter solo
  in `.env.local`/`.env` alla radice (mai nel client, mai committata).
- **Politica anti-allucinazione**: la *curiosità* è opzionale — se il modello non
  ha un fatto verificato specifico la lascia vuota. Non forzarla mai.
- **Separazione write/read**: il creator possiede il DB e scrive; il viewer apre la
  **stessa funzione di accesso in `readOnly: true`** (accessor `RO` in
  `noesis-roads-creator/db.mjs`, pattern `openReadonly`) e non tocca mai lo schema.

---

## 1. Pipeline dell'hub (`launcher.mjs`)

L'hub non genera contenuti: è **orchestratore di processi**.

1. **Avvio** — `loadLocalEnv()` carica `.env.local` poi `.env` (prima occorrenza
   vince); `createHubServer()` fa `fork` di `server.mjs` (viewer) e
   `noesis-roads-creator/server.mjs` (creator) come processi figli `silent` (stdout/stderr
   riversati nel launcher) e serve la pagina hub su `NOESIS_HUB_PORT` (18080).
2. **Supervisione** — se un figlio crasha viene riavviato automaticamente dopo
   1,5 s (flag `expectExit` evita respawn sugli stop pianificati);
   `SIGTERM → SIGKILL` dopo 5 s allo shutdown; `Ctrl+C` spegne tutto.
3. **Health check** — `GET /api/health` sonda `/api/status` dei due figli
   (timeout 2 s) ogni 5 s dalla pagina: pallino verde/rosso sui due bottoni.
4. **⚙️ Opzioni** — `GET/POST /api/config`: valida (tre porte distinte 1024–65535,
   endpoint `http(s)`, RPM intero ≥ 1), riscrive `.env.local` con `writeEnvFile`
   (preserva le righe sconosciute; valore vuoto = riga rimossa), aggiorna l'env
   corrente e **riavvia i due figli**. Cambiare la porta hub richiede riavvio manuale.

Config fields (mappa pannello → env): `OPENROUTER_API_KEY`, `OPENROUTER_ENDPOINT`,
`OPENROUTER_VISION_MODEL`, `OPENROUTER_TEXT_MODEL`, `OPENROUTER_WEB_SEARCH`,
`APP_HOST`, `APP_PORT`, `NOESIS_CREATOR_PORT`, `NOESIS_HUB_PORT`,
`NOESIS_CREATOR_DB`, `OPENROUTER_RPM` (nomi `ARTEST_*` precedenti accettati come fallback).

---

## 2. Pipeline di noesis-roads (viewer) — lettura, zero generazione

Consumatore finale: legge solo schede con `status = 'ready'`.

1. **Libreria** — `GET /api/library` unisce i tre tipi (`cardType: 'artwork' |
   'subject' | 'comparison'`) dagli accessor RO (`listArtworksRO`,
   `listSubjectsRO`, `listComparisonsRO`). Immagini: BLOB → endpoint binari.
2. **Scheda completa** — `GET /api/artworks/:id` (o `/api/subjects/:id`,
   `/api/comparisons/:id`): payload assemblato dai `get*RO`; le immagini sono URL
   verso endpoint BLOB (`/image`, `/image-annotated`, `/similar/:sid/image`,
   `/subjects/:id/works/:wid/image`, `/comparisons/:id/thumb` …).
3. **Presentazione UI** — viste React dedicate: catalogo, viewer opera con
   **pannello immagine a fasce** (dettaglio attivo a colori, resto in scala di
   grigi, toggle pulita/annotata), `SubjectView.jsx` (timeline per epoche + galleria
   opere), `ComparisonView.jsx` (due opere affiancate + elenchi). Tab
   Studio/Approfondimento precompilate dalla scheda.
4. **PDF in sola lettura** — `GET /api/artworks/:id/pdf`, `/api/subjects/:id/pdf`,
   `/api/comparisons/:id/pdf`, `/api/cards/:id/pdf`: gli stessi builder puri del
   creator (`noesis-roads-creator/pdf-payloads.mjs`, con accessor RO) + `make_pdf.py`
   invariato. Il viewer non ha bisogno del creator acceso per esportare; bottone
   ⬇ PDF nell'header delle 4 viste (nascosto per la demo offline).
5. **Flusso legacy di ripiego** — solo per opere senza contenuti pubblicati:
   `POST /api/overview` (testo dipinto+artista) e `POST /api/analyze`
   (visione del dettaglio → spiegazione didattica, risposta JSON normalizzata).
   L'immagine non lascia mai il backend; la chiave non è esposta al client.
   Cache per artwork; usato anche dalla demo inclusa (`src/data.js`).

Funziona senza chiave API per le schede già pubblicate.

---

## 3. Pipeline di noesis-roads-creator (authoring + AI)

Tre tipi di scheda, stesso DB, stesso motore AI (`callModel` importato da
`../server.mjs`). Le schede diventano visibili al viewer solo quando `ready`.

### 3a. Scheda «opera» — pipeline automatica a 5 fasi

Unica richiesta all'utente: **l'immagine**. Dopo l'upload la pipeline parte da
sola (pannello con % e fase corrente) e **persiste ogni fase nel DB subito**
(mai solo nello stato UI): riconoscimento → dettagli → contenuti → presentazione →
opere simili. Pesi di avanzamento: meta 15, dettagli 30, tab 15×n, overview 45, simili 60.

| Fase | Endpoint | Effetto |
|---|---|---|
| 1 · Riconoscimento | `POST /api/artworks/:id/generate/meta` | il modello visione compila la scheda (titolo, artista, data, periodo, tecnica, istituzione) → **salvata nel DB** (serve alle fasi successive) |
| 2 · Dettagli notevoli | `POST /api/artworks/:id/generate/details` | 4–6 dettagli come rettangoli normalizzati 0–1 → subito dopo viene generata e salvata l'**immagine annotata** (`annotate.py`: riquadri oro + didascalie numerate collision-free) |
| 3 · Contenuti dettagli | `POST /api/details/:id/generate/both` (in sequenza per dettaglio, ondate lato client) | **una sola visione condivisa** (crop PIL della regione) + le due tab in parallelo: *Studio* (`observation`, `meaning`, `relation`, `lookAgain`) e *Approfondimento* (`curiosity`, `comparisons`, `openQuestions`, `technique`, `lookAgain`). 5 dettagli = 15 chiamate invece di 20 |
| 4 · Presentazione | `POST /api/artworks/:id/generate/overview` | «Il dipinto» + «L'artista» (ha già i metadati riconosciuti) |
| 5 · Opere simili | `POST /api/artworks/:id/generate/similar` | **10 opere reali con lo stesso soggetto** da Wikimedia Commons/MET, immagini scaricate come BLOB; revisione singola via `PATCH …/similar/:sid` (con re-download immagine) |

**Revisione e salvataggio**: al 100% i contenuti restano editabili; **💾 Salva nel
database** approva ogni contenuto con le correzioni (PATCH), renderizza l'annotata,
marca l'opera `ready` (`approveArtwork`/`publishArtwork`). Le modifiche digitate
durante la pipeline sono conservate (`state.fieldEdits`) e non sovrascritte dai
risultati delle fasi.

**Resilienza**: errore di rete/rate limit → **⟳ Riprova da dove si è fermato**
(rigenera solo i contenuti mancanti, senza duplicare chiamate) oppure
**✕ Annulla — continua a mano** (bottoni manuali come fallback).

### 3b. Scheda «soggetto» — pipeline a step espliciti

Per un tema trasversale (es. «Annunciazione nella storia dell'arte»): step
sequenziali `POST /api/subjects/:id/generate/:step`, ognuno salvato e modificabile:

1. **intro** — introduzione al soggetto.
2. **chapters** — timeline per **epoche** (`subject_chapters`, ordinate).
3. **works** — 6–10 **opere rappresentative reali** con lo stesso soggetto
   (Commons/MET → BLOB in `subject_works`, con didascalia ciascuna).
4. **closing** — attributi/simboli ricorrenti (JSON simbolo→significato),
   interpretazioni, curiosità.

Salvataggio: `POST /api/subjects/:id/approve` → `ready`.

### 3c. Scheda «confronto» (faccia a faccia) — pipeline a step espliciti

Due opere affiancate (side A/B: dal DB interno o esterne con immagine BLOB):

1. **intro** — introduzione al confronto (`comparisonType`: stesso soggetto tra
   artisti / stesso artista in due fasi).
2. **points** — **punti in comune e differenze** come elenchi strutturati
   (`comparison_points`).
3. **analysis** — tecnica a confronto, contesto storico-artistico, interpretazione
   critica, curiosità.

Alla pubblicazione viene generata la **miniatura composita** via
`compose_thumb.py` (PIL: metà sinistra di A + metà destra di B → BLOB,
`setComparisonThumb`). Salvataggio: `POST /api/comparisons/:id/approve` → `ready`.

### Uscite comuni ai tre tipi

- **Stato `ready`** → tabelle `artworks` (+ `details`, `detail_content`,
  `overview`, `sources`, `similar_works`), `subjects` (+ `subject_chapters`,
  `subject_works`), `comparisons` (+ `comparison_sides`, `comparison_points`)
  nello stesso SQLite (WAL).
- **Helper Python** invocati con `execFileAsync('python3', …, { cwd: APP_ROOT })`,
  stesso pattern: JSON/temp file in ingresso → file in uscita → pulizia:
  `annotate.py` (immagine annotata), `compose_thumb.py` (miniatura confronto),
  `make_pdf.py` (PDF).
- **⬇ PDF «libro d'arte» on-demand** — `GET /api/{artworks|subjects|comparisons}/:id/pdf`:
  il server costruisce un payload tipografico dal DB (builder puri esportati
  `build*PdfPayload` con `io` iniettabile, testabili senza DB), lo passa a
  `make_pdf.py` (reportlab) e restituisce `application/pdf` in attachment con nome
  slugificato. Layout: A4, carta avorio, doppio filetto oro in copertina, corpo in
  DejaVu Serif giustificato, capitoli su pagina nuova con numerazione romana,
  immagini dai BLOB, ritagli dei dettagli come tavole. Gate di prontezza identici
  ai viewer: 404 inesistente, 400 «Genera e salva prima i contenuti», 503 se
  reportlab manca. Le immagini corrotte degradano in silenzio (pagina senza
  immagine, non crash). Bottone **⬇ PDF** nella topbar dei tre viewer con
  `downloadPdf()` (blob + spinner + toast).

---

## Verifica e operatività

- Test: `node --test test_server.mjs` (backend, accessor RO, rotte, PDF).
- Avvio consigliato: `node launcher.mjs` (hub 18080 → viewer 18000, creator 18100).
  Manuale: `node server.mjs` e `node noesis-roads-creator/server.mjs`.
- DB e `uploads/` si creano da soli, ignorati da git: su un sistema nuovo la
  libreria parte vuota e si riempie dal creator.
- I preview Freebuff non sopravvivono a un restart: rilanciare i server e
  registrare di nuovo il preview.
