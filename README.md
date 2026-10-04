# Recall

Local-first multimodal personal memory and retrieval.

> Think at ingest. Retrieve deterministically. No LLM required for search.

## Quickstart

```bash
./script.sh --seed          # install (all extras), test, build UI, seed 2 demos, start
./script.sh --help          # all flags (--extras, --skip-tests, --prefetch-models, --no-frontend)
```

Needs Python ≥3.10, `uv`, and `node` (for the React build).
Open `http://localhost:8000`.

> EmbeddingGemma downloads are gated: accept the Gemma terms at
> `huggingface.co/google/embeddinggemma-300m` and `export HF_TOKEN=…`
> before first run if you want the top-quality embeddings. Without it Recall
> falls back to MiniLM, then to offline hash vectors — search keeps working.

```bash
# single file
curl -F "files=@shot.png" -F "source=https://github.com/…" localhost:8000/api/upload
# text note
curl -X POST localhost:8000/api/memories \
  -H 'Content-Type: application/json' \
  -d '{"title":"FAISS notes","content":"vector index for dense retrieval"}'
# server-side path
curl -X POST localhost:8000/api/ingest \
  -H 'Content-Type: application/json' \
  -d '{"path":"/abs/path/to/file.pdf"}'
```

## Architecture

```text
ingest (metadata → caption/OCR → searchable text → embedding)
  → SQLite (+FTS5 BM25) + FAISS (FlatIP cosine)
  → query (BM25 ∥ vector → RRF k=60 → metadata/recency boosts)
```

- Database is authoritative; FAISS rebuilds from SQLite.
- AI runs at ingest only; search uses stored artifacts.
- See `docs/KNOWLEDGE.md` for decisions, tradeoffs, and licenses.

## API

```text
GET  /api/health
GET  /api/memories  GET /api/memories/{id}  GET /api/memories/{id}/file
POST /api/memories  DELETE /api/memories/{id}
POST /api/upload            (multipart files + optional source)
POST /api/search
POST /api/ingest   GET /api/ingest/{id}
GET  /api/stats    GET /api/models    POST /api/rebuild
```

## Optional extras

```bash
./script.sh --extras test,pdf   # light install (caption/OCR/embeddings fall back gracefully)
```

Without AI extras, embeddings use a deterministic offline fallback and
caption/OCR return empty strings — search (BM25 + fallback vectors +
metadata) still works.

## Frontend dev (React + BoardUI)

```bash
cd frontend && npm install && npm run dev   # Vite on :5173, proxies /api → :8000
```

Free BoardUI components live as source under `frontend/components/`
(`button`, `input`, `textarea`, `file-upload`, `tabs`, `badge`, `chip`,
`sidebar`, `stat-cards`, `table`, `settings-modal`, `theme-toggle`,
`dropdown`, `tooltip`, `divider`, `select`). Pro components require a paid
license — do not add them. Production build (`npm run build` → `frontend/dist/`)
is served by FastAPI.
