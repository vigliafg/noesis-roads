# Wizard materia/schede — screenshot (Chrome 1440×900, DB di test)

Percorso illustrato: home creator → wizard nuova materia → studio scheda → viewer.

| File | Cosa mostra |
|---|---|
| `01-home-materie.png` | Blocco "Nuova scheda per materia": 3 materie con modelli (`+`) e modifica prompt (`✎`) |
| `02-wizard-step1-materia.png` | Step 1: nome, descrizione, tono/system prompt di materia |
| `03-wizard-step2-modelli.png` | Step 2: modelli vuoti o clonati da archetipo |
| `04-wizard-step3-anteprima.png` | Step 3: editor sezione con prompt task + system override e anteprima system/user assemblata |
| `05-wizard-step4-revisione.png` | Step 4: revisione con validazione MODEL_SPEC |
| `06-scheda-passo1-checkbox.png` | Passo 1 scheda: required bloccate, opzionali spuntabili (= prompt accesi) |
| `07-studio-sezioni.png` | Studio generico con sezioni generate dall'AI |
| `08-viewer-catalogo.png` | Viewer: catalogo filtrato per materia |
| `09-viewer-scheda.png` | Viewer: scheda generica con ⬇ PDF |

Rigenerabili con gli script in `/tmp/e2e/` (`tour-a.mjs`, `tour-b.mjs`) contro uno stack isolato.
