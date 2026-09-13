# Noesis Roads — Valutazione affidabilità accademica (EVAL)

Baseline per misurare se Muse Spark 1.3 (e futuri modelli) regge la ricerca
approfondita di livello universitario. Rilanciare a ogni cambio di modello,
prompt o regole di generazione.

## Protocollo

- Livelli fissi: `approfondita` + `universita`, `temperature` di produzione (0.2).
- Stessi prompt dell'app (via `POST /api/cards/:id/generate/:sez` o `assembleSectionPrompts`).
- Modelli a confronto: Muse Spark 1.3 + 2 concorrenti via OpenRouter, stessi input.
- Giudizio cieco (giudice non sa quale modello ha generato cosa).

## Griglia di giudizio (per risposta)

| Criterio | Punteggio |
|---|---|
| Esattezza fattuale (date, nomi, attribuzioni) | 0 errate / 1 imprecisione / 2+ errori |
| Citazioni (vera / non verificabile / inventata) | conta per categoria |
| Gestione del dibattito (dichiarato / appiattito / fazioso) | ok / parziale / no |
| Fonti (pertinenti e raggiungibili) | n. ok / n. tot |

## Domande-trappola (12 per materia: 4 date/attribuzioni, 4 citazioni, 4 interpretative)

Formato riga (`eval-set.json`, da compilare con docenti delle materie):

```json
{ "id": "fil-01", "materia": "filosofia", "tipo": "data",
  "domanda": "...", "rispostaAttesa": "...", "fonti": ["..."],
  "trappola": "cosa sbaglia tipicamente un LLM qui" }
```

Stato: ⬜ da compilare (servono argomenti-trappola per filosofia, arte, letteratura).

## Script

- `/tmp/e2e/eval-accademico.mjs` (da creare): genera le risposte per ogni modello,
  salva JSON grezzo in `/tmp/e2e/eval-risultati/`, stampa tabella comparativa.
- Mai committare chiavi o risposte con dati sensibili; i risultati grezzi restano locali.

## Baseline

| Data | Modello | Fattuale | Citazioni inv. | Dibattito | Note |
|---|---|---|---|---|---|
| 2026-09-12 | muse-spark-1.3 (A) | 26/26 | 0 | sempre dichiarato | run 1, slug base |
| 2026-09-12 | llama-3.3-70b (B) | 17/26 | 0 certe, 2 dubbie | dichiarato ma con errori | run 1: errori di attribuzione (terzo uomo, In Ioannem) |
| 2026-09-12 | gpt-4o-mini (C) | 9/26 | ~5 dubbie/fantasma | spesso appiattito | run 1: Lettera 211, §5 Kant, Meaning 1955, normanni |
| 2026-09-12 | muse-spark-1.3-contributor (A) | 26/26 | 0 | sempre dichiarato | run 2: pari punteggio, apparato ancora più ricco (titoli tedeschi, Stephanus 1578, Slings, Chipp) |
| 2026-09-12 | llama-3.3-70b (B) | 18/26 | 0 certe | ok | run 2: una risposta troncata a metà frase |
| 2026-09-12 | gpt-4o-mini (C) | 10/26 | ~4 dubbie/fantasma | ok | run 2: stessi errori strutturali del run 1 |

Dettagli: `/tmp/e2e/eval-set.json` (13 domande-trappola), `/tmp/e2e/eval-risposte.json`
(risposte grezze A/B/C), `/tmp/e2e/eval-run.mjs` (protocollo: stessi prompt,
`approfondita/universita`, max_tokens 8000).

Nota tecnica emersa: con budget token basso (1200) Muse Spark esaurisce i token
nel ragionamento (`finish_reason:length`, contenuto nullo) senza rispondere.
In produzione (8000) il fenomeno non si è mai presentato; il generate segnala
comunque "sezione vuota" con warning senza bloccare.

## Mitigazioni attive (verificate nei test)

- `COMMON_RULES`: divieto invenzioni + obbligo di dichiarare il dibattito (`TYPE_CONTRACT_VERSION 2`).
- Approve: `linkWarnings` con HEAD-check URL non bloccante.
- Viewer: disclaimer onesto ("può contenere errori: verifica su fonti indipendenti").
- Web search OpenRouter: opzionale (`OPENROUTER_WEB_SEARCH=true`), citazioni raccolte ma non ancora mostrate.
