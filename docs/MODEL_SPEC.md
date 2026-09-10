# Noesis Roads — Specifica dei modelli di scheda (MODEL_SPEC)

Un *modello di scheda* è un documento JSON versionato che dichiara le sezioni
di un tipo di scheda-lezione per una materia. Stesso formato per i modelli
fissi iniziali e (in futuro) per quelli creati dall'utente.

## Formato

```json
{
  "key": "autore-pensiero",
  "subject": "filosofia",
  "name": "L'autore e il suo pensiero",
  "version": 1,
  "cover": { "eyebrow": "Scheda didattica · filosofia", "heroRole": "ritratto" },
  "sections": [
    {
      "key": "vita",
      "title": "Vita e contesto",
      "type": "text",
      "required": true,
      "maxWords": 180,
      "prompt": "Istruzioni LLM specifiche della sezione…"
    },
    { "key": "nuclei", "title": "I nuclei del pensiero", "type": "points", "groups": ["nuclei"], "required": true },
    { "key": "opere", "title": "Opere chiave", "type": "works", "withImages": true },
    { "key": "concetti", "title": "Concetti e glossario", "type": "kv", "required": false },
    { "key": "questioni", "title": "Questioni aperte", "type": "text", "required": false }
  ]
}
```

## Regole

- `key` univoca per materia; `version` incrementale (mai modificare uno schema
  con schede già `ready`: si crea una nuova versione).
- `type` ∈ `text | epochs | works | points | kv | pair | image` (vedi
  `ARCHITECTURE.md`); ogni tipo definisce forma di `corpo_json`, widget
  editor, blocco viewer e blocco PDF.
- `prompt` è il frammento LLM della sezione; il prompt finale =
  intestazione materia/modello + frammento + vincoli (lingua, lunghezza,
  "solo fatti ragionevolmente certi", niente invenzioni).
- `required: true` blocca l'approvazione se la sezione è vuota (stesso gate
  "Genera e salva prima i contenuti" del creator).
- Validazione: tipi noti, chiavi uniche, almeno una sezione, cover con ruoli
  immagine esistenti.

## Mappatura dei modelli arte (riferimento per lo snapshot)

- `opera` → sezioni: presentazione (`text`×2), tavola (`image` fullpage),
  N dettagli (crop + `text`×3 + `kv` + `text`×3 + tecnica), galleria simili
  (`works`), fonti (`kv`).
- `soggetto` → introduzione/origini (`text`), evoluzione (`epochs`), opere
  (`works`), simboli (`kv`), interpretazioni/curiosità (`text`).
- `confronto` → coppia (`pair`), introduzione (`text`), comuni/differenze
  (`points`×2), tecnica/contesto/critica/curiosità (`text`).
