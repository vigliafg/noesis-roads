# Noesis Roads — Architettura

Evoluzione di `artest`/`artest-creator` (freeze: tag `artest-stable`) da
materia singola (storia dell'arte) a piattaforma multi-materia. Prime due
materie: **storia dell'arte** (modelli e schede ereditati via snapshot) e
**storia della filosofia**; altre in futuro.

## Idea centrale

Nucleo **generico** + materie dichiarative. Ogni materia dichiara i suoi
*modelli di scheda* come JSON-schema (vedi `MODEL_SPEC.md`); editor, viewer,
PDF e API sono guidati dallo schema. Nulla del flusso è più cablato sull'arte.

## Entità del nucleo (nuove tabelle, accanto alle 13 legacy dell'arte)

```
materie            id, nome, descrizione, stato
modelli_scheda     id, materia_id, chiave, nome, versione, schema_json
schede_lezione     id, modello_id, titolo, stato (draft/ready), created_at
sezioni            id, scheda_id, chiave, titolo, corpo_json, ordine
immagini           id, scheda_id, ruolo, dati BLOB, mime
```

- `schema_json` elenca le sezioni del modello con tipo e vincoli.
- `corpo_json` contiene i dati di una sezione già generati/rivisti.
- Le tabelle legacy (`artworks`, `subjects`, `comparisons`, …) **restano intatte**
  come sorgente dello snapshot (vedi `MIGRATION.md`).

## Tipi-sezione (vocabolario condiviso)

| Tipo | Editor | Viewer | PDF (`make_pdf.py` invariato) |
|---|---|---|---|
| `text` | textarea | paragrafo giustificato | `p` / `lead` |
| `epochs` | lista epoca+testo | timeline capitoli | `chapter` + `h2` + `p` |
| `works` | lista opere + immagini | galleria 2 colonne | `gallery` |
| `points` | lista titolo+testo (2 gruppi) | elenchi numerati | `points` |
| `kv` | coppie etichetta/valore | tabella | `kv` |
| `pair` | due lati A/B + immagini | affiancate | `pair` |
| `image` | upload singolo | tavola | `image` (anche `fullpage`) |

## Strati

- **Creator generico**: un solo editor guidato dallo schema (form per
  tipo-sezione → generazione LLM per sezione → revisione → approva/`ready`).
  Le viste custom arte restano come renderer d'esempio, non come strada maestra.
- **Viewer generico**: un solo renderer guidato dallo schema; copre qualunque
  materia/modello senza nuovo codice per materia.
- **PDF generico**: un solo builder payload→sezioni tipizzate; `make_pdf.py`
  resta invariato (è già guidato da tipi-sezione).
- **LLM**: un prompt-builder per tipo-sezione + override per modello
  (tono, vincoli, esempi). Rate limiter e normalizzatori ereditati da artest.
- **Hub/launcher**: esteso con selettore materia; porte 18xxx, opzioni e
  supervisione invariate.

## API generiche (accanto alle legacy)

```
GET/POST  /api/cards                    elenco / nuova scheda-lezione
GET/PATCH /api/cards/:id                dettaglio / revisione sezioni
POST      /api/cards/:id/generate/:sez  genera una sezione via LLM
POST      /api/cards/:id/approve        ready (+ eventuali rese immagini)
GET       /api/cards/:id/pdf            PDF libro d'arte della scheda
GET       /api/subjects                 materie disponibili
GET       /api/models?subject=...       modelli di una materia
```
