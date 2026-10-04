# Recall

![Recall — local-first multimodal personal memory](docs/banner.png)

Local-first multimodal personal memory and retrieval. Save webpages, images,
screenshots, PDFs, and notes — find them later with hybrid lexical + semantic
search. No cloud, no accounts, no LLM at query time.

> Think at ingest. Retrieve deterministically.

[![Watch the demo](https://img.youtube.com/vi/1NzE_2FwT_U/maxresdefault.jpg)](https://youtu.be/1NzE_2FwT_U)

*Click for the video walkthrough.*

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

AI runs once at ingest; search is deterministic (SQLite + BM25 + FAISS).
The database is authoritative — FAISS is an in-RAM cache rebuilt from SQLite.

```mermaid
flowchart TB
    subgraph capture["Capture"]
        UP["File upload\nPOST /api/upload"]
        QN["Quick note\nPOST /api/memories"]
        SP["Server path\nPOST /api/ingest"]
        EX["Browser extension\nweb clip + dwell time"]
    end
    subgraph ingest["Ingest — AI runs here, once per memory"]
        DT["Detect type + metadata\nEXIF, pHash, file size"]
        XC["Extract content\ntext, PDF, HTML"]
        EN["Enrich\nBLIP caption · RapidOCR · autotags"]
        ST["Searchable text\ntitle + body + OCR + tags + filename"]
        EB["Embed\nEmbeddingGemma 768d → MiniLM → hash fallback"]
        DT --> XC --> EN --> ST --> EB
    end
    subgraph store["Store — SQLite is authoritative"]
        DB[("memories table\n+ embedding BLOBs")]
        FTS[("FTS5 index\nporter tokenizer, BM25")]
        VX[("FAISS index\nIndexFlatIP cosine\nrebuilt from SQLite")]
        EB --> DB
        DB --> FTS
        DB --> VX
    end
    subgraph query["Query — no LLM, stored artifacts only"]
        QP["Parse query\ntype / domain / date hints"]
        BM["BM25 top-N\nlexical leg"]
        DV["FAISS top-N\nsemantic leg"]
        FU["Score fusion\n0.7 weighted + 0.3 RRF"]
        RB["Relevance bonuses\ncoverage, title, file, phrase"]
        QP --> BM --> FU
        QP --> DV --> FU
        FU --> RB
    end
    subgraph serve["Serve"]
        API["FastAPI\nJSON API + static UI"]
        UI["React + BoardUI dashboard\nsearch, library, graph, models"]
        API --> UI
    end
    capture --> ingest
    store --> query
    query --> serve
```

### How ranking works

Both retrieval legs contribute calibrated *scores* (min-max normalized per
query), weighted by the `w_bm25` / `w_dense` settings, mixed with an RRF term
for rank robustness. Large bonuses are relevance-only; engagement signals are
tiny tie-breakers so they can never outvote a better match.

```mermaid
flowchart LR
    Q["Query + hard filters"] --> BM25["FTS5 BM25\ntop-N + raw scores"]
    Q --> DENSE["FAISS cosine\ntop-N + raw scores"]
    BM25 --> N["Per-leg min-max\nnormalize to 0..1"]
    DENSE --> N
    N --> F["relevance = 0.7 * (w_bm25 * n_bm25 + w_dense * n_dense)\n+ 0.3 * n_rrf"]
    F --> B["Relevance bonuses\nterm coverage · title · filename/tag · phrase"]
    B --> T["Tie-breakers\ntype/domain match · dwell ≤ 0.03 · recency ≤ 0.02"]
    T --> R["Ranked results\nscore + match reasons"]
```

- Database is authoritative; FAISS rebuilds from SQLite (`POST /api/rebuild`).
- AI runs at ingest only; search uses stored artifacts.
- See `docs/KNOWLEDGE.md` for decisions, tradeoffs, and licenses.

## Features

- **Dashboard** — stats, quick capture, recent memories.
- **Search Studio** — hybrid search with type, website-category, dwell-time,
  and date filters, plus match-reason chips per result.
- **Memory Library** — filter, inspect, batch-delete, JSON export/import.
- **Knowledge graph** — term/memory/domain web of your collection.
- **Models & AI** — backend status, live benchmark, embedding playground.
- **Browser extension** (`extension/`) — explicit per-click web clips with
  dwell-time tracking; re-captures update instead of duplicating.

## API

```text
GET  /api/health
GET  /api/memories  GET /api/memories/{id}  GET /api/memories/{id}/file
POST /api/memories  PATCH /api/memories/{id}  DELETE /api/memories/{id}
POST /api/memories/batch-delete
POST /api/upload                       (multipart files + optional source)
POST /api/search
POST /api/ingest   GET /api/ingest/{id}
GET  /api/stats    GET /api/models    POST /api/rebuild
GET  /api/settings  POST /api/settings
POST /api/tools/optimize  POST /api/tools/benchmark  POST /api/tools/embed-test
GET  /api/tools/export     POST /api/tools/import
POST /api/extension/ingest  POST /api/extension/dwell
GET  /api/graph
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
