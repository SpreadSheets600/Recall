# Recall

Local-first multimodal personal memory and retrieval.

> Think at ingest. Retrieve deterministically. No LLM required for search.

## Quickstart

```bash
./script.sh --seed          # install (test+pdf), test, seed 2 demos, start server
./script.sh --extras all    # also install AI extras (torch/transformers/OCR)
./script.sh --help          # all flags
```

Open `http://localhost:8000` — use the **Upload** tab or:

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
uv sync --extra ai    # torch + transformers + sentence-transformers (CPU)
uv sync --extra ocr   # rapidocr-onnxruntime
uv sync --extra pdf   # pypdf
```

Without extras, embeddings use a deterministic offline fallback and
caption/OCR return empty strings — search (BM25 + fallback vectors +
metadata) still works.
