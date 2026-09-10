# Noesis Roads — Testing (TESTING)

## Suite esistente (eredità noesis-roads, da mantenere verde)

`node --test test_server.mjs` — 40 test: normalizzatori, prompt, accessor DB,
PDF dei 3 tipi, endpoint `/pdf`, hub+config launcher. È la rete di sicurezza
del fork: deve restare verde a ogni fase.

## Matrice di collaudo per il nucleo generico

Per ogni coppia (materia × modello) — 2 materie × 3 modelli = 6 casi:

| Check | Come |
|---|---|
| Editor salva sezione per ogni tipo | POST `/api/cards/:id/generate/:sez` + PATCH, poi rilettura |
| Gate prontezza | scheda vuota → 400 con messaggio; `ready` solo a sezioni required piene |
| Viewer renderizza ogni tipo-sezione | GET scheda completa, assert blocchi presenti |
| PDF valido | `%PDF-`, pagine ≥ attese, immagini presenti, zero pagine bianche |
| Snapshot arte | conteggi legacy == generico; PDF legacy vs generico a parità |

## Soglie

- Nuovo codice solo con test che lo copre (builder puri con `io` iniettabile,
  come i `build*PdfPayload` del creator).
- Verifica live su DB reale prima di ogni merge: 1 scheda per modello con
  ispezione visiva delle pagine (cover, capitoli, gallerie).
- Mai snapshot di `.env.local` o chiavi nei test (file temporanei isolati,
  come nei test config del launcher).
