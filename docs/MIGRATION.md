# Noesis Roads — Migrazione arte → nucleo generico (MIGRATION)

Strategia decisa: **snapshot importato** (copia one-shot verificata, poi vita
autonoma). Le 13 tabelle legacy restano intatte nel DB come sorgente e rete di
sicurezza; il rollback è la loro semplice rilettura.

## Prerequisiti

- Checkout `artest` al tag `artest-stable`, suite 40/40 verde.
- Stesse dipendenze di artest (Node ≥ 22.5, Python + Pillow + reportlab).

## Script `migrate-art.mjs` (in `noesis-roads-creator/`)

1. Legge dal DB legacy solo schede arte in stato `ready`.
2. Mappa sui modelli generici `art:opera`, `art:soggetto`, `art:confronto`
   (dichiarati secondo `MODEL_SPEC.md`, vedi mappatura lì):
   - id stabile `art:<tipo>:<id-originale>`;
   - sezioni nell'ordine del PDF attuale; immagini copiate con ruolo
     (`hero`, `crop-<dettaglio>`, `sim-<id>`, `lato-a/b`, `thumb`, …).
3. Scrive nel nucleo con stato `ready` preservato.

## Verifica (bloccante)

- Conteggi per tipo: N legacy `ready` == N schede-lezione `ready` importate.
- Spot-check PDF: per almeno 1 scheda per tipo, il PDF generico deve avere
  stesso numero di pagine e stesse immagini del PDF legacy.
- Suite estesa verde (vedi `TESTING.md`).

## Non migrare

- Schede in `draft` o vuote (gate 400 esistente: niente contenuti → niente PDF).
- `uploads/` (scratch PIL) e log; solo BLOB dal DB.
