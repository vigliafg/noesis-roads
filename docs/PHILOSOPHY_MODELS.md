# Noesis Roads — Modelli della storia della filosofia (PHILOSOPHY_MODELS)

Tre modelli fissi, specchio strutturale dei tre dell'arte (stessi tipi-sezione,
prompt LLM diversi). Immagini: **gallerie semplici** (ritratti, luoghi,
manoscritti, prime edizioni) — niente riquadri annotati né crop.

## 1. `autore-pensiero` — L'autore e il suo pensiero

| Sezione | Tipo | Note prompt |
|---|---|---|
| Vita e contesto | `text` 120–180 parole | date, luoghi, formazione, contesto storico |
| I nuclei del pensiero | `points` 3–5 voci | una tesi per voce, 40–70 parole, solo dottrine attestate |
| Opere chiave | `works` 4–8 + galleria | titolo, data, perché conta (max 25 parole) |
| Concetti e glossario | `kv` 5–7 | termine → significato nell'autore |
| Citazioni | `points` 2–4 | solo citazioni verificabili, con opera di provenienza |
| Questioni aperte | `text` | dibattiti interpretativi reali |

Cover: ritratto (`heroRole: ritratto`), eyebrow "Scheda didattica · filosofia".

## 2. `tematica` — La tematica filosofica

Specchio del modello "soggetto": introduzione (`text`), origini della questione
(`text`), evoluzione per epoche (`epochs`, 5–6 capitoli con 1–2 autori reali
ciascuno), testi/autori rappresentativi (`works` + galleria), interpretazioni
(`text`), curiosità e questioni (`text`).

## 3. `confronto-filosofico` — Il confronto fra due filosofi

Specchio del "faccia a faccia": coppia A/B (`pair`, ritratti), introduzione
(`text` 120–180 parole), punti in comune (`points` 3–5), differenze (`points`
4–6), metodo e stile a confronto (`text`), contesto storico (`text`), sintesi
critica (`text`), curiosità (`text`).

## Esempi di collaudo

- Autore: Kant, *Critica della ragion pura* tra le opere.
- Tematica: il tempo (Agostino → Kant → Bergson → Heidegger).
- Confronto: Platone vs Aristotele (stesso problema, due ontologie).

## Linee guida prompt (comuni, ereditate dal creator arte)

Italiano chiaro e didattico; solo fatti ragionevolmente certi, mai inventare
opere/date/citazioni; lunghezze vincolanti per sezione; risposta SOLO JSON
valido nella forma dello schema.
