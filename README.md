# Noesis Roads — leggi e crea schede didattiche

Viewer didattico React per esplorare opere d’arte **dettaglio per dettaglio**. La collezione e tutti i contenuti (presentazione, sezioni per dettaglio su due livelli, opere simili, immagini) arrivano dalla **scheda didattica pubblicata con noesis-roads-creator**: il viewer legge in sola lettura il database SQLite e presenta i testi già verificati, senza generazione al volo.

## Architettura

> 📘 **Documentazione di riferimento delle pipeline** (hub, noesis-roads, noesis-roads-creator):
> vedi **`ARCHITETTURA-PIPELINE.md`** — descrizione stabile dei flussi, delle
> decisioni architetturali e degli endpoint di ciascun componente.

- `index.html`: entry point browser e UI React compilata in-browser per questa workspace.
- `src/styles.css`: fogli di stile principali (tabs, carosello opere simili, pannelli).
- `src/components/`: componenti React per catalogo, viewer, pannello di lettura e schermata di esplorazione.
- `src/data.js`: opera dimostrativa inclusa, usata solo come ripiego offline quando non ci sono schede pubblicate.
- `src/api/nvidiaAnalysis.js`: client legacy per l’analisi live (usato dal flusso dimostrativo).
- `src/App.jsx`: carica la libreria da `GET /api/library` e la scheda completa da `GET /api/artworks/:id`.
- `noesis-roads-creator/`: app sorella che genera e pubblica le schede dei tre tipi (dipinto, soggetto, confronto) — pipeline AI sequenziale con feedback di avanzamento, editor a sezioni, approvazione con miniatura composita (PIL).
- `server.mjs`: server statico + API. Oltre agli endpoint di analisi live, espone la **libreria pubblicata** leggendo il DB di noesis-roads-creator **in sola lettura** (connessioni `readOnly`, zero scritture).
- `test_server.mjs`: test automatici del backend e degli accessor read-only.

### Da dove vengono i contenuti mostrati

1. **Libreria** — `GET /api/library` elenca le opere con stato `ready` nel DB di noesis-roads-creator (`noesis-roads-creator/data/noesis-roads-creator.db`), con le immagini servite dal BLOB.
2. **Scheda completa** — all’apertura di un’opera il browser chiama `GET /api/artworks/:id`: il server restituisce metadati, immagine pulita + URL dell’immagine annotata, `overview` (dipinto/artista), `details` con i testi `studio`/`approfondimento` per ciascun riquadro, fonti e le 10 `similarWorks` (thumbnail BLOB).
3. **Esplorazione** — la selezione di un dettaglio (dall’immagine o dalle chip) apre le due tab **Studio del dettaglio** e **Approfondimento** con le sezioni corrispondenti già compilate nella scheda; in cima alla pagina le tab **Presentazione | Opere simili** mostrano i testi e il carosello delle opere con lo stesso soggetto.

### Tre tipi di scheda

Oltre al singolo dipinto, la libreria include altri due tipi di scheda pubblicati da noesis-roads-creator (stato `ready`):

- **Soggetto nella storia dell’arte** (`GET /api/subjects/:id`) — come lo stesso soggetto (Annunciazione, Natività, battaglie navali…) è stato rappresentato nei secoli: introduzione, origini iconografiche, **timeline per epoche** (capitoli ordinati), galleria di **opere rappresentative** con immagini BLOB, attributi/simboli ricorrenti, interpretazioni e curiosità. Vista React dedicata: `SubjectView.jsx`.
- **Faccia a faccia** (`GET /api/comparisons/:id`) — confronto critico di due opere (stesso soggetto tra artisti o stesso artista in due fasi): le due opere affiancate (lato dal DB o esterno con immagine BLOB), introduzione, **punti in comune / differenze** (elenchi strutturati), tecnica, contesto, interpretazione critica e curiosità. Miniatura composita (metà sinistra A + metà destra B) generata via PIL alla pubblicazione. Vista React dedicata: `ComparisonView.jsx`.

Le tabelle SQLite corrispondenti (`subjects`, `subject_chapters`, `subject_works`, `comparisons`, `comparison_sides`, `comparison_points`) vivono nello stesso DB di noesis-roads-creator; il viewer le legge esclusivamente in sola lettura.

### Schede generiche per materia (nucleo Fase 2)

Accanto ai tre tipi arte, il **nucleo generico** copre qualunque materia/modello
senza nuovo codice per materia: tabelle `materie`, `modelli_scheda`,
`schede_lezione`, `sezioni`, `immagini`; API `/api/cards` + `/api/materie` su
creator (scrittura) e viewer (sola lettura delle `ready`); renderer unico
`GenericCardView` + `SectionBlock` (un blocco per tipo-sezione) e un solo
builder PDF generico (`make_pdf.py` invariato). Le viste custom arte restano
come renderer d'esempio. Modelli dichiarativi in `core/models.mjs` (arte:
opera/soggetto/confronto; filosofia: autore-pensiero/tematica/
confronto-filosofico).

La chiave OpenRouter **non deve mai essere inserita in `index.html`, in `src/` o in un commit**. Copiare `.env.example` in `.env.local` e impostare `OPENROUTER_API_KEY`; il server carica il file automaticamente all’avvio. La chiave serve solo al flusso legacy di generazione live (analisi/overview/opere simili on-demand) e a noesis-roads-creator: il viewer delle schede pubblicate funziona anche senza.

## Installazione su un altro sistema

### Requisiti

| Cosa | Versione | Perché |
|---|---|---|
| **Node.js ≥ 22.5** | — | `node:sqlite` in `noesis-roads-creator/db.mjs`, importato da entrambi i server |
| **Python 3** + `pip install pillow reportlab` | — | `annotate.py`/`compose_thumb.py` (Pillow), `make_pdf.py` (reportlab) |
| Font **DejaVu** (Linux: pacchetto `fonts-dejavu`) | consigliati | senza, resa tipografica di fallback |

Nessun `npm install`: zero dipendenze, niente `package.json`, niente build.

### Procedura

```bash
git clone https://github.com/vigliafg/noesis-roads.git && cd noesis-roads
pip install pillow reportlab
cp .env.example .env.local  # poi inserisci OPENROUTER_API_KEY nel file
```

La chiave serve solo per **generare** contenuti (pipeline di noesis-roads-creator e flussi
legacy sotto); il viewer delle schede pubblicate funziona anche senza. Entrambi i
server caricano `.env.local`/`.env` dalla radice da soli.

### Avvio (un terminale: launcher)

Il modo più semplice è il **launcher**, che avvia entrambi i programmi e presenta
l'hub con due grossi bottoni (più ⚙️ Opzioni per chiave API, modelli e porte):

```bash
node launcher.mjs                # hub → http://127.0.0.1:18080
```

Dall'hub: **"Vedi le schede"** → viewer su :18000,
**"Crea le schede"** → authoring su :18100. `Ctrl+C` spegne tutto.

I due programmi vivono in maniera **indipendente**: noesis-roads-creator **crea** le
schede (authoring + pipeline AI), noesis-roads le **visualizza** (viewer di lettura).
Avvio manuale senza launcher (un terminale per server):

```bash
node server.mjs                            # viewer noesis-roads → http://127.0.0.1:18000
node noesis-roads-creator/server.mjs   # authoring          → http://127.0.0.1:18100
```

- **Solo noesis-roads-creator**: autonomo, crea il suo DB da solo; generi e pubblichi
  le schede.
- **Solo viewer noesis-roads**: parte da solo, ma mostra le schede pubblicate solo se
  esiste il DB di noesis-roads-creator (`noesis-roads-creator/data/noesis-roads-creator.db`,
  letto in sola lettura); altrimenti vedi solo l'opera dimostrativa di ripiego
  inclusa nel client.

Porte/host sovrascrivibili senza toccare il codice (`APP_PORT`,
`NOESIS_CREATOR_PORT`, `APP_HOST`; il DB con `NOESIS_CREATOR_DB` (fallback ai nomi `ARTEST_*` precedenti):

```bash
OPENROUTER_VISION_MODEL="meta/muse-spark-1.3" OPENROUTER_TEXT_MODEL="meta/muse-spark-1.3" APP_PORT=18000 node server.mjs
```

Su Windows PowerShell la chiave si passa come variabile d'ambiente:

```powershell
$env:OPENROUTER_API_KEY="incolla-la-tua-chiave-openrouter"
node server.mjs
```

### Note

- Il DB SQLite (`noesis-roads-creator/data/`, WAL) e `uploads/` **si creano da soli** al
  primo avvio e sono ignorati da git: sul nuovo sistema la libreria parte
  **vuota**. Per riempirla: apri noesis-roads-creator → Nuova opera → carica
  l'immagine → parte la pipeline automatica (riconoscimento → dettagli → tab →
  presentazione → simili → approva). Solo le schede `ready` compaiono nel viewer.
- `server.py` / `test_server.py` sono il mirror Python legacy del solo viewer:
  il runtime primario è Node, sul nuovo sistema si possono ignorare.

### Verifica

```bash
node --test test_server.mjs                  # 40 test
curl http://127.0.0.1:18100/api/status        # configured:true se la chiave è letta
```

## Guida veloce per l'utente

### L'hub (http://127.0.0.1:18080)

È la pagina iniziale: si apre con `node launcher.mjs` e resta accesa finché
lavori (`Ctrl+C` per spegnere tutto). Contiene:

- **Due grossi bottoni**:
  - **Vedi le schede** → apre il viewer (:18000), dove si leggono le
    schede didattiche già pronte (opere, soggetti, faccia a faccia);
  - **Crea le schede** → apre il creator (:18100), dove si generano
    nuove schede con l'aiuto dell'AI.
- **Il pallino** accanto a ogni bottone dice se quel programma è acceso (verde)
  o spento (rosso): se si spegne, l'hub lo riavvia da solo, basta riprovare.
- **⚙️ Opzioni** (in alto a destra): chiave API, modelli, ricerca web, porte e
  impostazioni avanzate. Dopo **Salva**, i due programmi si riavviano da soli
  per applicare le modifiche (se cambi la porta dell'hub, riavvia invece il
  launcher a mano).

### I due programmi

| | Vedi (viewer) | Crea (creator) |
|---|---|---|
| **Serve a** | leggere ed esplorare le schede | creare nuove schede con l'AI |
| **Funziona senza chiave API?** | sì, per le schede già pubblicate | no, la generazione richiede la chiave |
| **Da solo** | mostra solo l'opera dimostrativa se non ci sono schede pubblicate | autonomo al 100% |

### Flussi tipici

**Leggere una scheda**: hub → *Vedi* → elenco → click sulla scheda → si apre
l'anteprima con presentazione, dettagli cliccabili e opere simili. Il bottone
**⬇ PDF** nella barra in alto scarica la scheda impaginata come libro d'arte.

**Creare una scheda generica**: hub → *Crea* → Nuova scheda → materia + modello + titolo → genera le sezioni (o compilale a mano) → salva ciascuna → approva → la scheda è nel viewer (filtro materia).

**Creare una scheda opera**: hub → *Crea* → Nuova opera → carica l'immagine →
parte da sola la pipeline (riconoscimento → dettagli → testi → presentazione →
opere simili) → rivedi e correggi → **Salva nel database** → la scheda diventa
visibile nel viewer.

**Se qualcosa non va**: pagina che non si apre → controlla che il terminale del
launcher sia acceso e il pallino sia verde; porta occupata → cambia le porte in
⚙️ Opzioni; libreria vuota nel viewer → nessuna scheda ancora pubblicata dal
creator (vedi flusso sopra).

Ogni programma ha un bottone **«← Hub»** nella propria home per tornare alla
pagina iniziale del launcher (viewer: in alto a destra; creator: nella barra in
alto di ogni pagina).

Il modello lavora dalla propria conoscenza di addestramento: osserva il dettaglio e integra nella spiegazione i fatti che già conosce sull’opera. Il grounding web di OpenRouter è **disattivato di default**; per attivarlo impostare `OPENROUTER_WEB_SEARCH=true` (in quel caso il backend aggiunge il plugin di ricerca web alla richiesta e le citazioni restituite vengono mostrate tra le fonti).

## Modello scelto

Il backend usa come default il modello multimodale di Meta:

```text
meta/muse-spark-1.3
```

È il modello multimodale di Meta capace di ricevere testo più immagine e di ragionare. Viene usato per entrambi gli stadi della pipeline: osservazione visiva e spiegazione didattica. La variante `-contributor` è più economica ma richiede di abilitare la policy dati “paid model training” nelle impostazioni di privacy di OpenRouter; il modello standard funziona senza restrizioni. I modelli sono sostituibili tramite `OPENROUTER_VISION_MODEL` e `OPENROUTER_TEXT_MODEL` senza modificare il client React.

L’endpoint predefinito è:

```text
https://openrouter.ai/api/v1/chat/completions
```

Può essere sostituito tramite `OPENROUTER_ENDPOINT` per usare un endpoint compatibile.

## Flusso legacy (generazione live, per la demo inclusa e per prove)

I flussi sotto restano disponibili e vengono usati solo quando un’opera non ha contenuti pubblicati nel DB.

### Presentazione in cima alla pagina (`POST /api/overview`)

1. Aprendo la pagina dell’opera il browser chiede la presentazione storico-artistica di dipinto e artista.
2. Il backend invia al modello testo un prompt con i metadati dell’opera e le fonti editoriali.
3. Il modello risponde con JSON `{painting, artist}` (massimo 500 parole in totale).
4. La presentazione è mostrata sopra il viewer e viene messa in cache per artwork.

### Spiegazione del dettaglio (`POST /api/analyze`)

1. Il browser invia al backend opera, hotspot, coordinate, livello scolastico ed elenco degli altri dettagli notevoli.
2. Il backend legge l’immagine locale e la converte in data URI base64.
3. Il backend invia immagine e prompt strutturato al modello visione tramite OpenRouter.
4. Il backend passa l’osservazione visiva al modello testo per la spiegazione didattica del solo dettaglio selezionato (senza ripetere il contesto generale, già mostrato in cima alla pagina).
5. Il backend normalizza la risposta JSON del modello.
6. Il browser visualizza le tre sezioni **Cosa vedi**, **Cosa significa**, **In relazione all’opera**, oltre a confidenza e fonti.

L’immagine non viene inviata direttamente dal browser a OpenRouter e la chiave non viene esposta al client.

## Configurazione della chiave API

La chiave si configura in due modi, entrambi già documentati nella sezione
Installazione: dal pannello **⚙️ Opzioni dell'hub** (`node launcher.mjs`, scrive
`OPENROUTER_API_KEY` in `.env.local` e riavvia i due server) oppure modificando
direttamente il file `.env.local` alla radice del repo.
## Test

Eseguire i test Node integrati:

```bash
node --test test_server.mjs
```

È inoltre presente `test_server.py` come alternativa per ambienti Python, ma il percorso Node è quello verificato e raccomandato per questa workspace.

Il test live con OpenRouter richiede una chiave impostata nell’ambiente o in `.env.local`. Per sicurezza, la chiave condivisa in chat deve essere revocata e rigenerata prima dell’uso reale.
