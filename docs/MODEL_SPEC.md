# Noesis Roads — Specifica dei modelli di scheda (MODEL_SPEC)

Un *modello di scheda* è un documento JSON che dichiara le sezioni
di un tipo di scheda-lezione per una materia. Stesso formato per i modelli
fissi iniziali e per quelli creati dall'utente (wizard "+ Nuova materia",
API `/api/models`). Un solo modello per chiave (`materia:chiave`, niente
versioning): le modifiche si applicano subito, le schede esistenti conservano
i contenuti salvati.

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
    { "key": "nuclei", "title": "I nuclei del pensiero", "type": "points", "required": true },
    { "key": "opere", "title": "Opere chiave", "type": "works", "withImages": true },
    { "key": "concetti", "title": "Concetti e glossario", "type": "kv", "required": false },
    { "key": "questioni", "title": "Questioni aperte", "type": "text", "required": false }
  ]
}
```

## Regole

- `key` univoca per materia (id stabile `materia:chiave`); le modifiche allo
  schema sono dirette e immediate, anche con schede esistenti (conservano i
  corpi salvati; le sezioni rimosse non si renderizzano più).
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

## Livelli di generazione (verbosità × istruzione)

Ogni scheda sceglie in testata `verbosita` (`essenziale|standard|approfondita`,
default `standard`) e `istruzione` (`primaria|secondaria|universita`, default
`secondaria`); valori fuori whitelist → 400. La verbosità scala i vincoli
(`maxWords` ×0,6/×1/×1,6; voci 2–3/3–5/5–8 per `points`/`kv`, 3–4/4–8/6–10 per
`works`, 3–4/5–6/6–8 per `epochs`) con riga vincolante che prevale sui numeri
del frammento; l'istruzione aggiunge il registro (lessico/profondità) nel
system. `image` non genera testo e ignora i livelli nel contenuto.
`prompt_version` include entrambi i livelli; ogni sezione generata timbra
`verbosita`/`istruzione` (il salvataggio manuale preserva i timbri, `''` =
contenuto umano, sempre valido). Cambio livelli consentito ma **invalidante**:
le required generate con altri livelli risultano `stale` e bloccano l'approve
(`rigenera: <chiavi>`) finché rigenerate; `✨ Genera mancanti` le include.

## Mappatura dei modelli arte (riferimento per lo snapshot)

- `opera` → sezioni: presentazione (`text`×2), tavola (`image` fullpage),
  N dettagli (crop + `text`×3 + `kv` + `text`×3 + tecnica), galleria simili
  (`works`), fonti (`kv`).
- `soggetto` → introduzione/origini (`text`), evoluzione (`epochs`), opere
  (`works`), simboli (`kv`), interpretazioni/curiosità (`text`).
- `confronto` → coppia (`pair`), introduzione (`text`), comuni/differenze
  (`points`×2), tecnica/contesto/critica/curiosità (`text`).
