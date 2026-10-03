# Recall

Local-first multimodal personal memory and retrieval.

> Think at ingest. Retrieve deterministically. No LLM required for search.

## Quickstart

```bash
uv sync --extra test
uv run pytest -q
RECALL_DATA_DIR=./data uv run uvicorn backend.app.main:app --port 8000
```

Open `http://localhost:8000`.

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
GET  /api/memories  GET /api/memories/{id}
POST /api/memories  DELETE /api/memories/{id}
POST /api/search
POST /api/ingest   GET /api/ingest/{id}
GET  /api/stats    POST /api/rebuild
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
