# Preview run instructions

## Reproduce artifacts

- No environment files or package dependencies are required.
- Ensure Node.js 22.5+ is available (`node:sqlite`).
- For AI generation, copy `.env.example` to `.env.local` and fill in `OPENROUTER_API_KEY`. The servers load `.env.local` / `.env` automatically. Never commit the key.

## Run the servers

Easiest: the launcher (hub + both apps, ports 18xxx):

```bash
node launcher.mjs
```

- Hub → `http://127.0.0.1:18080` (supervisor + ⚙️ options)
- Viewer (noesis-roads) → `http://127.0.0.1:18000` (`APP_PORT`)
- Creator (noesis-roads-creator) → `http://127.0.0.1:18100` (`NOESIS_CREATOR_PORT`)

Manual (one terminal per server):

```bash
node server.mjs                  # viewer
node noesis-roads-creator/server.mjs   # authoring
```

## noesis-roads-creator (app sorella · authoring contenuti)

Server separato, zero dipendenze, richiede Node ≥ 22.5 (modulo nativo `node:sqlite`).

```bash
cd noesis-roads-creator
node server.mjs            # http://127.0.0.1:18100  (porta: NOESIS_CREATOR_PORT)
```

La chiave `OPENROUTER_API_KEY` arriva da `.env.local`/`.env` alla radice del repo (loader condiviso col viewer). Il DB SQLite si crea da solo in `noesis-roads-creator/data/noesis-roads-creator.db` (riusa il precedente `artest-creator.db` se presente); le immagini caricate finiscono in `noesis-roads-creator/uploads/`.

## Dipendenze Python (export PDF/DOCX/SLIDES)

Python 3.13 è già presente (`C:\Program Files\Python313\python.exe`). Solo i moduli pip vanno installati una tantum:

```bash
python -m pip install pillow reportlab python-docx python-pptx markdown ebooklib
```

Su Windows i server invocano `python` (non `python3`, che è lo stub del Microsoft Store); su macOS/Linux `python3`. Override manuale: variabile `PYTHON_BIN`.

## Viewer (noesis-roads)

```bash
node server.mjs            # http://127.0.0.1:18000  (porta: APP_PORT)
```

Nota: `server.py` è solo un demo minimo legacy — il viewer vero è `server.mjs` (condivide `db.mjs` col creator).

## Tests

```bash
node --test test_server.mjs test_core.mjs test_migrate.mjs   # 53 test
```
