# Recall Knowledge Base

> Single source of truth for technical knowledge, architecture decisions,
> research findings, implementation decisions, and lessons learned.
> Status labels used throughout: `Planned` / `Experimental` / `Implemented` / `Verified`.
> Anything not yet measured in this repo is marked as reported/estimated, not claimed.

## Current System

```text
Backend:      FastAPI + Python, React 19 + BoardUI (Vite build served from frontend/dist)
Database:     SQLite + FTS5, WAL mode (Implemented)
Lexical:      SQLite FTS5 bm25(), k1=1.2 b=0.75 (Implemented)
Vector:       faiss-cpu IndexIDMap2(IndexFlatIP) + L2-normalized vectors = cosine (Implemented, Verified)
Uploads:      POST /api/upload (multipart, multi-file + source) → data/uploads/ → ingest_file
               (Implemented, Verified — serves back via GET /api/memories/{id}/file)
Tags/topics:  TF keyword extraction, auto-filled at ingest unless explicit (Implemented, Verified)
Models info:  GET /api/models reports per-model ready/fallback, size, license (Implemented, Verified)
Image caption: BLIP-base default, Florence-2 opt-in — ON by default (script installs ai extras);
               every uploaded image gets caption + OCR at ingest (Implemented)
OCR:          rapidocr-onnxruntime default, pytesseract fallback — ON by default (Implemented)
Text embed:   google/embeddinggemma-300m default (768d, Gemma terms, gated download);
               → all-MiniLM-L6-v2 → hash fallback chain (Implemented)
Image-text:   Deferred; images embed via their caption+OCR text (EmbeddingGemma is text-only)
Frontend:     React + BoardUI free components (button/input/file-upload/tabs/badge/chip/
               sidebar/stat-cards/data-table/settings-modal/theme-toggle), Vite build (Implemented)
Inference:    CPU-first; GPU used opportunistically if present, never required
Search:       No generative LLM/VLM at query time (Implemented, Verified)
```

## 1. Project Overview

Recall is a local-first, multimodal personal-memory and retrieval system.
Turn saved content (webpages, images, screenshots, text, markdown, PDFs, files)
into searchable memories, retrieved with hybrid lexical + semantic + metadata
ranking — without running a large generative model during search.

V1 capability: given a mixed personal collection, retrieve the right memory
with natural language ("screenshot about the GitHub DNS error", "article about
FAISS", "images containing a terminal", "things from GitHub last week").

## 2. Problem Definition

Personal content is messy: screenshots with error text, saved articles, PDFs,
photos with no text. Keyword search misses paraphrases; pure vector search
misses exact strings (error codes, filenames); cloud tools violate privacy;
GPU-dependent VLMs don't run on a normal laptop.

Recall splits the problem:

```text
hard at ingest (vision, OCR, embeddings — async, cached) →
fast + deterministic at query (SQLite + BM25 + FAISS + ranking — no LLM)
```

Search must work with all generative models shut down after ingestion.

## 3. Core Design Principles

1. **Enrich at ingest, retrieve deterministically.** AI produces stored text
   (caption, OCR, tags, embedding). Search uses stored artifacts only.
2. **Smallest reasonable component.** Prefer the smallest model that gives
   useful results on CPU; justify every MB and every second.
3. **Database is authoritative.** SQLite holds memories + embedding BLOBs.
   FAISS is an ephemeral in-RAM cache rebuildable from SQLite.
4. **Idempotent ingestion.** Content hash dedup; never re-run vision on
   unchanged content; one failure never blocks the rest.
5. **Explainable ranking.** Few normalized components + configurable weights
   + per-leg match reasons in API responses. No mystery score.
6. **Local-first, private by default.** No cloud APIs, no telemetry, no
   accounts, explicit browser capture only, works offline after install.
7. **One-developer understandable.** Flat code, short functions, no
   manager/factory abstractions unless they solve a real problem.

## 4. Architecture

```text
CONTENT → discover → identify type → extract metadata → extract content
  → AI enrichment (async) → searchable text → embedding
  → update FTS5 + FAISS → persist SQLite

QUERY → preprocess (lowercase, punctuation, quoted terms, date/source/type hints)
  → candidate retrieval (FTS5 BM25 top-N ∥ FAISS top-N ∥ metadata filter)
  → score normalization → fusion (RRF default) → metadata/recency adjust
  → ranked results + match reasons
```

Conceptual backend layout (adapt if simpler wins):

```text
backend/app/{api,core,db,models,schemas,services/{ingestion,extraction,vision,embeddings,search,ranking,metadata},main.py}
backend/tests/
frontend/ (index.html, styles.css, app.js, vendor/shadcn-html components)
extension/ (optional MV3, explicit capture only)
```

Status: `Planned`. No code written yet; this file is the first artifact.

## 5. Data Model

Single `memories` table + FTS5 external-content table. `Planned` DDL sketch
(from sqlite.org FTS5 §4.4.3 pattern):

```sql
PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;
CREATE TABLE memories(
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,            -- image|webpage|pdf|text|markdown|file
  title TEXT,
  path TEXT, source TEXT, domain TEXT,
  content TEXT NOT NULL,         -- searchable text: body + caption + OCR + tags + filename
  description TEXT, ocr_text TEXT, tags TEXT,
  width INTEGER, height INTEGER, file_size INTEGER,
  exif_json TEXT, phash TEXT, content_hash TEXT NOT NULL UNIQUE,
  embedding BLOB,                -- float32, source of truth; FAISS rebuilt from this
  created_at INTEGER NOT NULL, modified_at INTEGER, captured_at INTEGER,
  status TEXT NOT NULL DEFAULT 'indexed'  -- queued|processing|indexed|failed|skipped
);
CREATE INDEX idx_mem_type ON memories(type);
CREATE INDEX idx_mem_source ON memories(source);
CREATE INDEX idx_mem_created ON memories(created_at);
CREATE VIRTUAL TABLE memories_fts USING fts5(
  content, content='memories', content_rowid='id',
  tokenize='porter unicode61');
-- + ai/ad/au triggers per FTS5 docs; 'rebuild' for backfill
```

Why one table: one FTS index, one fusion path, type/source/date as indexed
columns instead of separate tables. Type-specific fields live in
`exif_json`/nullable columns. WAL gives concurrent reader + background writer
on a laptop; keep `-wal/-shm` with the DB on backup.

## 6. Ingestion Pipeline

Stages: `discover → identify → metadata → content → AI enrichment (async) →
searchable representation → embed → update FTS5/FAISS → persist`.
Statuses surfaced in UI: `Queued|Processing|Indexed|Failed|Skipped`.

Rules (`Planned`):

- Compute `content_hash = sha256(normalized bytes)` first; `UNIQUE`
  constraint → `INSERT OR IGNORE` semantics; unchanged hash reuses cached
  caption/OCR/embedding.
- Images additionally store perceptual hash (`phash`); Hamming distance
  ≤ ~6 flags resized/recompressed near-duplicates (see §7).
- AI steps run in background worker (not request thread); per-file try/except
  at the boundary only; failures recorded with message, rest of batch continues.
- FTS5 triggers keep the lexical index in sync transactionally; FAISS
  `add_with_ids(sqlite_rowid)` in the same commit path; full rebuild =
  `SELECT id, embedding FROM memories`.

## 7. Image Understanding

### Image Captioning

**What it is.** An image-to-text model run once at ingest; its output string
becomes indexed text. Search never runs the vision model.

**Why relevant.** Turns "photo of terminal with DNS error" into tokens BM25
and embeddings can match.

**How it works (BLIP-base).** ViT image encoder + causal text decoder,
COCO-finetuned; `BlipProcessor + BlipForConditionalGeneration`, standard
`generate()`, no `trust_remote_code`. Prompt-free conditional captioning.

**Candidates researched** (all values from HF cards/official repos; CPU times
are community-reported estimates, **not yet Verified** in this repo):

| Model | Params / dl | License | Transformers | CPU (reported) | Verdict |
|---|---|---|---|---|---|
| `Salesforce/blip-image-captioning-base` | ~223–247M, ~0.9–1GB fp32 | BSD-3-Clause | native, no remote code | ~1–3 s/img | **Default** |
| `microsoft/git-base-coco` | ~0.2B, ~0.8–1GB | MIT | native | ~1–3 s/img, literal/short | Co-default / A-B |
| `microsoft/Florence-2-base-ft` | 0.23B, ~0.9–1.1GB | MIT (code header says Apache-2.0 — review remote code) | `trust_remote_code=True`, `<DETAILED_CAPTION>` | ~3–8 s/img | Opt-in detailed mode |
| `nlpconnect/vit-gpt2-image-captioning` | ~200M, ~800MB | Apache-2.0 | `VisionEncoderDecoderModel`, oldest-compat | ~1–2 s/img, weakest quality | Last-resort fallback |
| `Salesforce/blip-image-captioning-large` | 0.5B, ~1.9GB | BSD-3-Clause | native | ~2–5 s/img, +2–3 CIDEr only | Rejected (2× cost, marginal gain) |
| `Salesforce/blip2-opt-2.7b` | 4B total, 7–14GB | MIT (+OPT inherit) | needs bitsandbytes/accelerate | 10 s+ CPU | Rejected (GPU-oriented) |
| `Qwen2-VL-2B` / 2.5-VL-3B | 2–3.8B, 4–7GB | Apache-2.0 | needs new transformers, flash-attn | 15–40 s/img CPU | Rejected |
| `google/paligemma-3b-mix-224` | 3B, 6–11GB | Gemma (gated) | recent transformers | 20 s+ CPU | Rejected (heavy + gated) |
| `moondream2` / `MiniCPM-V` | ~2–8B | Apache-2.0 | custom `trust_remote_code`, llama.cpp-oriented | 10 s+ via transformers | Rejected for v1 runtime |

**Decision (`Planned`).** Default `blip-image-captioning-base`;
A-B against `git-base-coco`; env flag `RECALL_CAPTION_MODEL=florence-2-base-ft`
for detailed mode. Rationale: smallest reasonable quality, permissive license,
native Transformers, no remote code, ~1GB resident only during ingest.

**References.** HF cards: `Salesforce/blip-image-captioning-base`,
`microsoft/git-base-coco`, `microsoft/Florence-2-base`,
`nlpconnect/vit-gpt2-image-captioning`; BLIP repo `salesforce/BLIP`.

### OCR

**What it is.** End-to-end text detection + recognition on images/screenshots/
PDF pages at ingest; output appended to `ocr_text` and `content`.

**Options researched:**

| Engine | Size / deps | CPU (reported) | Accuracy note | License |
|---|---|---|---|---|
| `rapidocr-onnxruntime` + `onnxruntime` | ~30MB total, no torch | fastest DL-OCR on CPU (ONNXRuntime) | PaddleOCR weights; best on rotated/UI fonts | Apache-2.0 |
| Tesseract + `pytesseract` | ~10MB bin + 15–50MB/lang, needs system binary | ~150–400 ms clean page, fastest overall | great on clean print, weak on rotation/curved/UI | Apache-2.0 |
| EasyOCR | torch (~2GB) + ~100MB models | 2–3× slower than Tesseract on CPU | better on stylized/rotated, worse $/ms | Apache-2.0 |
| PaddleOCR full | Paddle wheels + 100s MB | heavy init | most accurate pipeline, heavy env | Apache-2.0 |
| doctr | torch + 100s MB | 1.6–10 s/page CPU (reported) | good layout/KIE, overkill | Apache-2.0 |
| Florence-2 `<OCR>` / TrOCR | 0.06–0.77B | seconds/img; TrOCR line-only, needs detector | not better $/ms than dedicated OCR | MIT |

**Decision (`Planned`).** Default `rapidocr-onnxruntime`; `pytesseract` as
optional fallback for clean PDFs / hosts where the binary already exists.
Do not default to EasyOCR/Paddle/doctr/Florence-OCR (torch/Paddle tax or
seconds-per-page on CPU). API: `RapidOCR()(img_path)`.

**References.** `tesseract-ocr/tesseract`, `madmaze/pytesseract`,
`JaidedAI/EasyOCR`, `PaddlePaddle/PaddleOCR`, `RapidAI/RapidOCR`,
`mindee/doctr`, `microsoft/trocr-small-printed`.

### Image Metadata

**What it is.** Ordinary file + EXIF extraction with Pillow before any AI:
filename, extension, dimensions (`Image.size` — don't trust EXIF width alone),
file size, mtime, EXIF `DateTimeOriginal` (tag 36867 in Exif IFD via
`get_ifd`), camera Make/Model, exposure/ISO, GPS IFD → decimal degrees.

**GPS caution.** DMS rationals → `D+M/60+S/3600`, sign from `...Ref`
(N+/S−, E+/W−); guard missing IFD, zero denominators, assume WGS-84, round
~5 dp. Never hallucinate location from pixels if EXIF absent. GPS is PII —
display only, never export.

**Alternatives.** `piexif` (read+write), `exifread` (tolerant reader).
Pillow alone suffices for read-only v1. License: Pillow HPND (permissive).

**References.** `pillow.readthedocs.io/.../ExifTags.html`,
`python-pillow/Pillow#5863` (`get_ifd` pattern).

### Duplicate Detection

**What it is.** Two-level dedup at ingest.

1. **Exact:** `sha256(normalized content bytes)` via stdlib `hashlib`,
   `UNIQUE` column → idempotent `INSERT OR IGNORE`. No practical collisions.
2. **Near (images):** perceptual hash via `ImageHash` (BSD-2-Clause):
   pHash (DCT, robust to brightness/compression) or dHash (gradient, fastest);
   compare Hamming distance, threshold ~≤6 to flag resized/recompressed
   screenshots. Not rotation-invariant — documented limitation.

xxHash (BSD-2) reserved only if hashing ever profiles as a bottleneck; never
for integrity claims. Avoid `phash.org` C++ lib (GPLv3).

**References.** `Cyan4973/xxHash`, `JohannesBuchner/imagehash`.

## 8. Search System

Design goal: works with generative models shut down; every signal precomputed
and cached.

### BM25

**What it is.** Probabilistic lexical ranker: TF saturation (`k1`) × length
normalization (`b`) × IDF. Formula: `Σ IDF·[f·(k1+1)]/[f+k1·(1−b+b·|D|/avgdl)]`.

**Why Recall uses it.** Embeddings average away rare exact strings. BM25 makes
`"Could not resolve host github.com"`, `EADDRINUSE`, `IMG_2024.jpg` match
exactly. Standard hybrid pattern (Elastic/OpenSearch/Weaviate all do BM25+vector).

**Decision (`Planned`).** SQLite FTS5 built-in `bm25()`, defaults `k1=1.2,
b=0.75` (near-optimal per Trotman et al.; Lucene/Tantivy hardcode same).
Zero new deps, transactional, C-speed, `ORDER BY rank`, `highlight()`.
`rank-bm25` (Apache-2.0 — corrects earlier "MIT" guess) / `bm25s` (Apache-2.0)
only if FTS5 control ever proves insufficient.

**References.** Robertson & Zaragoza 2009
(`staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf`); FTS5
`sqlite.org/fts5.html`; `dorianbrown/rank_bm25`; `xhluca/bm25s`;
Elastic k1/b guide.

### Embeddings

**What it is.** Dense vectors for paraphrase/concept match
("DNS error" ↔ "failed to resolve host"). L2-normalized at encode and query
time; cosine = dot product.

**Candidates researched** (MTEB-56 avg from BGE/GTE cards; sizes approx):

| Model | Dims / size | License | MTEB | Notes |
|---|---|---|---|---|
| `all-MiniLM-L6-v2` | 384 / ~80–90MB, 22.7M, seq 256 | Apache-2.0 | ~56–59 | fastest (~14k sent/s SBERT table), no prefix, ONNX-able |
| `bge-small-en-v1.5` | 384 / ~130MB, 33.4M, seq 512, CLS | MIT | ~62.2 | +6 pts same dims; query instruction prefix optional; ships ONNX |
| `gte-small` | 384 / ~70MB, 33.4M, seq 512 | MIT | ~61.4 | near-tie with BGE, no prefix |
| `e5-small-v2` | 384 / ~130MB | MIT | ~59.9 | mandatory `query:/passage:` prefixes — friction |
| `all-mpnet-base-v2` | 768 / ~420MB | Apache-2.0 | ~57.8 | 5× larger/slower, 2× vector DB |
| `nomic-embed-text-v1` | 768 / ~500MB+, seq 8192 | Apache-2.0 | ~62.4 | 8k context unneeded; `trust_remote_code`, prefixes |

**Decision (`Planned`).** Default `all-MiniLM-L6-v2`
(`normalize_embeddings=True`); documented upgrade `bge-small-en-v1.5` if
+50MB is acceptable (+6 MTEB at same 384d / same FAISS RAM). `gte-small` is an
approved substitute. Reject e5 (prefix bugs), mpnet (420MB/768d marginal
gain), nomic (500MB+ overkill).

**References.** HF cards `sentence-transformers/all-MiniLM-L6-v2`,
`BAAI/bge-small-en-v1.5`, `thenlper/gte-small`, `intfloat/e5-small-v2`;
SBERT pretrained-models table.

### EmbeddingGemma (researched Oct 2026, Implemented as default with fallback chain)

**What it is.** Google's 300M-parameter open embedding model (Gemma 3 backbone),
sentence-transformers compatible. **Text in → 768d vector out (text-only).**
It cannot embed images — there is no image input. For images Recall embeds the
caption + OCR + tags text, which is exactly the searchable representation.

**Key facts (from the official HF model card, verified Oct 2026).**

- Params/size: 0.3B, safetensors F32. Small enough for laptop CPU/RAM.
- Dims: 768 native, truncatable to 512/256/128 via Matryoshka (MRL) + renormalize.
  Recall uses `RECALL_EMBED_DIM` (default 768) and truncates when smaller.
- Context: 2048 tokens (vs 256 for MiniLM) — whole documents fit.
- Quality: MTEB English v2 mean 69.67 @768d (multilingual 61.15) — far above
  MiniLM-L6 (~56–59) and BGE-small (~62). Best quality per MB in its class.
- Prompts are mandatory and asymmetric: queries
  `task: search result | query: {text}`, documents
  `title: {title | "none"} | text: {content}`. ST exposes
  `encode_query/encode_document`; Recall formats prompts manually and falls
  back to plain `encode()` on old ST versions.
- Precision: fp32 or bf16 (NOT float16). CPU runs fp32 — fine.
- CPU: on-device-focused design (phones/laptops); 300M fp32 runs on CPU in
  ~100s of ms per batch. GPU, if present, is used opportunistically by
  sentence-transformers — never required.
- License: **Gemma Terms of Use (gated)** — must accept on HF and download
  with an `HF_TOKEN`. NOT Apache/MIT. This is the one non-permissive piece in
  the stack; everything else stays permissive.

**Fallback chain (all automatic, reported in `/api/models`).**

```text
EmbeddingGemma (if installed + downloadable)
  → all-MiniLM-L6-v2 (Apache-2.0, unattended download)
    → deterministic hash vectors (no download, keeps search working)
```

**Dim migration.** Changing `RECALL_EMBED_DIM` (e.g. 384→768) invalidates
stored blobs. `rebuild_index` now re-embeds any row whose blob dim differs
from config instead of zero-padding. Old-padding behavior was a silent
corruption bug — fixed with a regression test.

**References.** `huggingface.co/google/embeddinggemma-300m`,
paper `arxiv.org/abs/2509.20354`.

### FAISS

**What it is.** In-process approximate/exact nearest-neighbor index. For
single-user scale (<100k vectors) exact search is trivial.

**Decision (`Planned`).** `faiss-cpu` (MIT, one ~5–19MB wheel) +
`IndexIDMap2(IndexFlatIP(d))` + `normalize_L2` on ingest and query → cosine
in `[-1,1]`, directly fusable. `add_with_ids(sqlite_rowid)`. No training,
no IVF/HNSW/PQ until >100k–1M vectors (official guideline: only Flat
guarantees exact results). RAM math: `4·d` bytes/vec → d=384: 10k≈15MB,
100k≈154MB. Persist optionally via `write_index`; always rebuildable from
SQLite BLOBs — never the sole source of truth.

**References.** `facebookresearch/faiss` (repo, index-choice + indexes wikis),
Douze et al. 2024 `arXiv:2401.08281`, PyPI `faiss-cpu`.

### Hybrid Retrieval

Per-leg top-N≈50 from FTS5 and FAISS (+ metadata candidates), then fusion.

- **Default: Reciprocal Rank Fusion** (Cormack/Clarke/Buettcher, SIGIR 2009):
  `RRF(d) = Σ 1/(k + rank_r(d))`, `k=60`, ranks 1-indexed, missing=0. Needs
  no score calibration (BM25 unbounded vs cosine `[-1,1]`), no training.
- **Alternative: weighted linear** `w_dense·norm(dense)+w_bm25·norm(bm25)+…`
  with per-query min-max normalization. Supported via config for tuning, with
  per-leg contributions logged for explainability.

**References.** `cormack.uwaterloo.ca/cormacksigir09-rrf.pdf`; Elastic/OpenSearch
RRF docs; `blog.serghei.pl/posts/reciprocal-rank-fusion-explained`.

### Ranking

```text
final = 0.7·(w_bm25·norm(bm25) + w_dense·norm(dense)) + 0.3·norm(RRF)
      + relevance_bonuses (coverage/title/filename/tag/phrase)
      + tiny tie-breakers (dwell ≤0.03, recency ≤0.02)
```

Keep every query-independent term tiny so text/semantic signal dominates. Weights in config; API returns per-leg rank/score + match reasons
(`keyword|semantic|source|date|type`). Tests will pin known examples
("GitHub DNS error" → seeded screenshot first). Status: `Planned`.

### Metadata Scoring

Hard filters + soft boosts: `type`, extension, `domain`, directory,
filename/tag match, OCR/caption presence. Query hints parsed lightly
(`from github`, `images`, `pdfs`) — broad retrieval on ambiguity, never
invented precision. EXIF GPS enables "photos taken in Kolkata" only when
present.

### Recency

Additive or multiplicative decay, e.g. `exp(-λ·age_days)` with half-life
~30 days, configurable and bounded. "Last week / this month" become date-range
filters on `created_at/captured_at`, not just boosts. Status: `Planned`.

## 9. Model Selection

### Models Considered

See tables in §7–8 (captioning ×9 families, OCR ×7, text embeddings ×6,
image-text ×4: CLIP-B/32 ~600MB MIT, OpenCLIP LAION, SigLIP-B ~800MB
Apache-2.0, JinaCLIP-v1/v2 — v2 license caution).

### Benchmarks

No in-repo benchmarks yet. All latency/RAM figures above are
**reported/estimated from cards, docs, and community reports** — explicitly
not claimed as measured. First real measurements to take: caption s/img,
OCR s/img, embed s/batch, RSS per resident model, FTS5 + FAISS p50/p95,
DB size per 1k memories.

### Final Choices (`Planned`, pending CPU verification)

| Role | Choice | Why (one line) |
|---|---|---|
| Vision | `blip-image-captioning-base` (fallback `git-base-coco`, opt-in `florence-2-base-ft`) | smallest good captions, native Transformers, BSD/MIT, ~1–3 s CPU |
| OCR | `rapidocr-onnxruntime` (+ `pytesseract` fallback) | ~30MB, ONNX CPU-first, Paddle accuracy, Apache-2.0 |
| Embedding | `all-MiniLM-L6-v2` (upgrade `bge-small-en-v1.5`) | 80MB/384d fastest baseline; +6 MTEB upgrade same dims |
| Vector index | `faiss-cpu` FlatIP IDMap | exact, no training, MIT, trivial RAM |
| Lexical | FTS5 `bm25()` | zero dep, public domain SQLite |
| Image-text | deferred (`siglip-base-patch16-224` opt-in) | caption+OCR suffices first; must justify 400–800MB + 2nd index |

### Reasons for Rejected Models

Large VLMs (BLIP-2 4B, Qwen-VL 2–4B, PaliGemma 3B gated, Moondream/MiniCPM-V
custom runtimes) give stronger conversational reasoning Recall never needs at
query time — the model only converts pixels to stored text at ingest. Larger
text encoders (mpnet 420MB, nomic 500MB+) add RAM/DB cost for marginal or
prefix-friction gains. CLIP/SigLIP double per-image CPU + a second index for
marginal wins on text-heavy screenshots; gate behind evaluation.

## 10. CPU Performance

Strategy: correctness → measure → fix slowest meaningful component. Planned
tactics (PyTorch tuning guide / Serve checklist / Intel x86 notes):

- `model.eval()` + `torch.no_grad()` (or `inference_mode()`); batch=1; fixed
  padding; 1–2 dummy warmup forwards; measure 3rd+ run.
- Stay fp32 on CPU (fp16 rarely faster without tensor cores); `safetensors`
  for load speed; `torch.set_num_threads(physical cores)`, don't oversubscribe
  with Uvicorn workers; `OMP/MKL_NUM_THREADS` pinned.
- Dynamic int8 quantization only if benchmarked per model — helps
  Linear/RNN-heavy text encoders (~1.4–2.5× reported on Xeon), often
  neutral/slower on ViT/CNN caption paths and can hurt quality.
- One resident model at a time where possible (caption vs embedding lazy-load);
  `IndexFlatIP` needs no training copy; `del + gc.collect()` on model swap;
  build FAISS with reduced threads then restore (MKL RSS growth caveat).
- Cache everything: captions, OCR, tags, hashes, embeddings. Never re-infer
  unchanged content.

Status: `Planned`. No torch/FAISS RAM claim is `Verified` until `psutil`-based
measurements land in `backend/tests/`.

## 11. API Design

Minimal REST (`Planned`):

```text
GET  /api/health
GET  /api/memories  GET /api/memories/{id}
POST /api/memories   DELETE /api/memories/{id}
POST /api/search     (query + filters → ranked memories + score + match reasons)
POST /api/ingest    GET /api/ingest/{id}
GET  /api/stats      (counts, index status, storage, models)
```

Search response includes `memory, score, match {keyword|semantic|source|date|type,
per-leg ranks}`. Errors are useful API errors; unexpected bugs surface, not
swallowed; no blanket `except Exception`.

## 12. Frontend Architecture

Vanilla `index.html + styles.css + app.js`, no React/Vue, no build step.
Sidebar (All/Images/Web/Files/PDFs/Settings) secondary; search box is the
visual center with filters + results (thumbnail/title/caption/source/date/type/
tags/match reason). Image grid for image-heavy queries; detail view answers
what/where/when/what-Recall-knows/related. Light/dark theme, keyboard nav,
`focus-visible`, `prefers-reduced-motion`, labeled empty states. Status: `Planned`.

## 13. shadcn-html Components

**What it is.** Portable UI kit: semantic HTML + CSS custom-property tokens +
tiny vanilla JS; each component is a folder (`component-skill.md + .css [+ .js]`),
no npm/build; tweakcn-compatible `default-semantic-tokens.css`; MIT.
Fits FastAPI-served static files: copy only needed `dist/components/*`.

Minimal set for Recall (`Planned`): `button, input, card, badge, dialog,
dropdown, skeleton, tabs, tooltip, avatar, separator`. CSS-only: button, badge,
card, separator, skeleton. With JS: dialog, dropdown, tabs, tooltip. Read the
component skill before implementing each; never recreate the kit's components.

**References.** `shadcn-html.com/documentation(+/installation)`,
`github.com/codylindley/shadcn-html`.

## 14. Security and Privacy

Local-only: no cloud AI, no telemetry/analytics/accounts; offline after install.
Browser capture (if built) is explicit per-click MV3 (`activeTab`+`scripting`
only, no `<all_urls>`, no background scraping; service worker POSTs to
`http://localhost:<port>` with `X-Recall-Token`; CORS allowlist =
`chrome-extension://<id>`). GPS shown only from real EXIF, never inferred.
State clearly in UI that data stays on device.

## 15. Testing

Behavioral tests first (`Planned`): dedup (exact + phash), metadata/EXIF
extraction, CRUD, BM25 exact-match, semantic paraphrase, RRF fusion, date/source/
type filters, image ingest + OCR path, failed-ingest isolation, index rebuild
from SQLite. Ranking fixtures with known expected order. No vanity count tests.

## 16. Important Engineering Decisions

### ADR-001 — Use SQLite (+FTS5, WAL) as primary store

Status: Accepted. Local single-user needs persistence without a server.
Alternatives: PostgreSQL, MongoDB — rejected (operational complexity, no
current requirement). Embedding BLOBs in SQLite make rebuild trivial.

### ADR-002 — FAISS FlatIP IDMap, cosine via normalization

Status: Accepted (`Planned`). Exact, training-free, MIT, tiny RAM at this
scale. Alternatives: IVF/HNSW/PQ, cloud vector DBs, Elasticsearch — rejected
(no scale requirement; keep local + small).

### ADR-003 — Default fusion is RRF(k=60)

Status: Accepted (`Planned`). No calibration, 2–5 lines, explainable.
Weighted-linear supported as config alternative with normalization.

### ADR-004 — Small caption model at ingest, no VLM at query

Status: Accepted (`Planned`). BLIP-base default; Florence-2 only as opt-in
detailed mode. Larger VLMs rejected (see §9): reasoning unneeded at search.

### ADR-005 — rapidocr-onnxruntime default OCR

Status: Accepted (`Planned`). CPU-first ONNX, ~30MB, Paddle-grade accuracy.
Tesseract fallback; torch-heavy OCR rejected for v1.

### ADR-006 — EmbeddingGemma default, MiniLM/hash fallback chain

Status: Accepted (Implemented, Oct 2026 — supersedes the MiniLM-default part
of the earlier decision). `RECALL_EMBED_MODEL=google/embeddinggemma-300m`,
`RECALL_EMBED_DIM=768`. Rationale: +10 MTEB points over MiniLM at 300M params,
MRL truncation, 2048-token context, CPU-runnable fp32. MiniLM stays as the
unattended fallback; hash vectors as the offline fallback. Gemma gated-license
cost is contained: it only affects the first download, never search or
redistribution of code.

### ADR-007 — Defer image-text embeddings

Status: Accepted (`Planned`). Caption+OCR through text pipeline first; SigLIP
opt-in only if evaluation shows visual-similarity wins justify cost.

### ADR-008 — Vanilla JS + shadcn-html, no framework

Status: Accepted (`Planned`). No React/Vue/build; copy kit components directly.

### ADR-009 — Multipart upload endpoint beside JSON/path ingest

Status: Accepted (Implemented, Verified). Browsers cannot easily POST raw
server paths, so `POST /api/upload` (multipart `files` + `source` form field)
saves into `data/uploads/` (collision-suffixed) and reuses `ingest_file`.
JSON `/api/memories` (quick notes) and `/api/ingest` (server paths, scripting)
stay — one ingestion core, three doors. Files served back read-only via
`GET /api/memories/{id}/file` for thumbnails/previews.

### ADR-010 — Deterministic TF auto-tags at ingest

Status: Accepted (Implemented, Verified). No model download may exist, so
`textutil.extract_topics/tags_for` (frequency over non-stopword len≥3 tokens)
fills `tags` when the caller passes none; explicit tags always win. Keeps the
topics/tags UI truthful offline; replaceable with a keyphrase model later.

### ADR-011 — React + BoardUI frontend (user override, Oct 2026)

Status: Accepted (Implemented). Supersedes ADR-008 (vanilla, no framework).
User explicitly approved React. BoardUI (React 19 + Tailwind v4, free
components as owned source via `npx boardui add`, React Aria behavior) fits
the dashboard shape: stat-cards, data-table, file-upload, tabs, sidebar,
settings-modal, theme-toggle. Only free components are used — every Pro
component/chart/template requires a paid Pro license and is rejected for this
open-source repo. Frontend is a Vite build served by FastAPI (`frontend/dist`);
`script.sh` runs `npm ci && npm run build` and fails loudly if node is missing.

### ADR-012 — Caption + OCR ON by default for images; GPU opportunistic

Status: Accepted (Implemented). `script.sh` defaults to `--extras all`
(torch CPU + transformers + sentence-transformers + rapidocr + pypdf) so a
fresh `./script.sh --seed` gives captioned, OCR'd, embedded memories with zero
extra steps. If the user trims extras, ingestion degrades gracefully (empty
caption/OCR, fallback vectors) and `/api/models` says exactly what is missing.
GPU is never required: torch/ST use it only when present; CPU remains the
supported baseline and all tests run CPU-only.

## 17. Known Limitations

- Caption/OCR quality bounds text-first image search; non-textual visuals
  ("red sunset", "button top-right") weak until SigLIP opt-in lands.
- pHash/dHash not rotation-invariant; heavy edits escape near-dup detection.
- FTS5 needs query-syntax escaping; tokenizer `porter unicode61` is
  English-leaning.
- All CPU/latency figures still reported, not measured here.
- EXIF GPS sparse; no location inference when absent (by design).

## 18. Problems Encountered

1. **`article about X` hard-filtered to `type=webpage`, returning zero rows.**
   Cause: NL type parser treated content words ("article") as hard `WHERE`
   filters. Fix: NL type hints are now soft boosts (+0.10) only; hard filtering
   applies solely to explicit API/sidebar `type_filter`. Regression tests:
   `test_article_query_does_not_hard_filter_type`. Status: Fixed, Verified.
2. **`from github` (bare name, no TLD) was not recognized as a source filter.**
   Cause: regex required `name.tld`. Fix: fallback captures bare `from <word>`
   as domain substring (`LIKE %github%`). Regression test:
   `test_bare_source_filter`. Status: Fixed, Verified.
3. **FastAPI `on_event` deprecation warning.** Fixed by moving to `lifespan`
   handler. Status: Fixed.
4. **No in-repo GPU/CPU model benchmarks yet.** Caption/OCR/ST paths are
   lazy and untested with real weights; all latency figures remain
   reported/estimated. Next: measure caption s/img, OCR s/img, RSS, p50/p95.
5. **pkill -f with the server's own command string kills the invoking shell
   too** (pattern matches own cmdline). Use a bracket trick
   (`pkill -f "port 876[7]"`) so the pattern doesn't match the invoker.
6. **Vite/plugin version pairing.** `@vitejs/plugin-react@6` requires Vite 8;
   with Vite 6 the resolver fails. Pinned `@vitejs/plugin-react@^4` for
   Vite 6. Keep the pair in sync on upgrades.
7. **BoardUI `data-table` is a hardcoded customers demo, not a generic table.**
   Library page uses the base `table` primitives instead. Only free BoardUI
   items are vendored; every Pro item needs a paid license key.
8. **React UI is browser-verified via headless Chromium** (Playwright smoke:
   sidebar, search, Select popover, Upload/Library/Models tabs, light + dark
   mode, zero console errors). One flaky React #520 recovery seen once,
   unreproduced since. Rerun the smoke on real UI changes.
9. **BoardUI `DashboardSidebar` rendered blank in production** (user
   screenshot: empty black gutter where the nav should be, header cramped).
   Root cause never confirmed — no browser in this environment to inspect;
   suspects are its collapse/search/team-menu machinery and the
   anchor-interception hack it forced on the app. Fix: replaced with
   `src/components/RecallSidebar.jsx` built from verified BoardUI primitives
   (`Button` ghost/secondary rows, `Badge` counts, `Divider`, `ThemeToggle`).
   Notably this also caught a real API lesson: BoardUI `Button`
   `leadingIcon/trailingIcon` take **components**, not elements. Bundle shrank
   921KB → 619KB as a side effect. Status: Fixed, build-verified; needs one
   visual click-through.
10. **"Entirely broken, no sidebar" report was a stale `dist/` build.**
    Verified with headless Chromium (Playwright) against the real backend:
    current code renders sidebar, search, results, dialogs, Upload/Library/
    Models tabs with zero console errors in light and dark mode. `dist/` is
    gitignored, so `git pull` alone never updates the UI — the reporter was
    still serving the pre-fix bundle. Fix on the process side:
    `script.sh` rebuilds the frontend every run, `/` now sends
    `Cache-Control: no-store` so browsers can't pin an old `index.html`
    (bundle files are content-hashed). Lesson: keep a headless-browser
    smoke script (`/tmp/opencode/flow*.js` pattern) for UI claims; never
    diagnose layout from a screenshot alone.
11. **Websites systematically outranked files despite weaker matches.**
    Causes (all in `backend/app/search.py`): (a) unconditional
    `website_type` boosts (+0.08 docs/code/academic, +0.06 article/blog)
    applied to every website regardless of the query, while files
    (`website_type=NULL`) got nothing; (b) dwell boost up to +0.18 —
    websites-only signal — while RRF deltas between adjacent ranks are
    ~0.002 (k=60), so boosts decided ranking, not relevance; (c) the
    configured `W_DENSE`/`W_BM25` knobs were dead code, fusion was
    rank-only RRF with score magnitudes discarded. Fix: score fusion
    `0.7·(w_bm25·n_bm25 + w_dense·n_dense) + 0.3·n_rrf` (min-max normalized
    per query, knobs live); large bonuses are query-dependent only (term
    coverage ×0.25, title ×0.20, filename/tag ×0.08, phrase ×0.12/0.05);
    website_type boosts only on explicit filter match; dwell capped at
    +0.03 and recency at +0.02 as pure tie-breakers. Verified: file matching
    3/3 terms now beats a docs website matching 1/3 (was reversed), all
    27 pytest tests green. Status: Fixed.
12. **Full endpoint audit (Oct 2026): 8 contract failures found, all fixed.**
    Backend (`backend/app/main.py` unless noted): (a) `GET /api/stats`
    lacked `recent` (dashboard "Recent Memories" always empty) and `settings`
    (UI `embed_dim` always fell back to 768) — both added; (b) settings
    `False` didn't survive restart — `bool("False") is True` in
    `config.apply_settings`, now parses properly (`backend/app/config.py`);
    (c) `PATCH /api/memories/{id}` left the embedding stale (only FTS
    trigger updated) — now rebuilds searchable text + re-embeds;
    (d) extension re-capture of a URL stacked duplicate rows — now upserts
    by `source` URL; (e) `POST /api/benchmark` lacked `memories_count`
    the Models page reads (`tools_service.py`); (f) `GET /api/graph`
    ignored the `min_terms`/`max_nodes` params the UI sends — now honored;
    (g) negative `limit`/`offset` on list/search misbehaved — clamped;
    (h) upload had no size cap despite the UI's "50 MB" claim — now
    enforced via `RECALL_MAX_UPLOAD_BYTES`; oversize files are removed
    with a clear error. Frontend: Library "Export JSON" button fetched
    but never downloaded (now Blob download); Library filter had no
    debounce (now 250 ms like Search); Models pipeline rows read
    `v.model`/`v.details` but the API sends `name`/`note` (fixed, plus
    `ready`-derived status); `fmtKB` had no MB/GB; "Files" type was
    unfilterable (added to both filter lists). OCR engine is now cached
    across ingests instead of re-initialized per image. Verified with a
    50-check endpoint audit (all green), 28 pytest tests, and a clean
    Vite build. Status: Fixed, Verified.
13. **Uploads never reached the backend (UI silently faked success).**
    `UploadPage` passed `onDropFiles`/`title`/`hint` to `FileUpload`, which
    only accepts `onUploadComplete` — so dropping a file played the
    simulated progress animation to "Uploaded successfully!" without ever
    calling `/api/upload`. Fix: new `onFileAccepted` prop on `FileUpload`
    (fired right after validation) wired to the real uploader, plus an
    honest `Uploading…` queue state updated in place on completion.
    Also fixed the allow-list mismatch: the component defaulted to
    pdf/jpg/jpeg/png/xlsx + 8 MB, rejecting the txt/md the UI advertises —
    now allows exactly what the ingest pipeline handles
    (images/pdf/txt/md/html, 50 MB, matching the new server-side cap).
    Backend itself verified for txt/png/pdf/md/multi-file/oversize.
    Status: Fixed, Verified (28 pytest green, Vite build clean).

## 19. Solutions

- Broad-retrieval-first query parsing: ambiguous NL hints boost, explicit
  UI/API params filter. Documented in `backend/app/search.py`.
- Offline-first degradation: embeddings fall back to deterministic hashed
  vectors; FAISS falls back to numpy brute force; caption/OCR return "".
  Core search (BM25 + fallback vectors + metadata) verified without any model
  download — 14 pytest tests, plus smoke checks for "GitHub DNS error",
  "article about vector databases", "images containing a terminal",
  "things from github last week".

## 20. Things Learned

- Cosine in FAISS = normalized `IndexFlatIP`; L2 and IP rank identically on
  normalized vectors but IP scores are directly interpretable for fusion.
- RRF removes the need to reconcile BM25's unbounded scores with cosine's
  `[-1,1]` — the key reason it is the v1 default.
- FTS5 external-content tables avoid text duplication and stay consistent via
  documented triggers — the smallest durable lexical index.
- Generative OCR (Florence/TrOCR) loses on $/ms to dedicated OCR for Recall's
  screenshot-heavy input; ONNX Paddle weights are the CPU sweet spot.
- `trust_remote_code` (Florence-2, Moondream, some embedders) is a supply-chain
  decision, not just an install flag — pin revisions and prefer native models.
- License metadata vs LICENSE files can disagree (Florence-2 MIT vs Apache
  header; BGE/E5 MIT via metadata only) — verify exact revisions before release.

## 21. Future Improvements
- Measured benchmark table (caption/OCR/embed s, RSS, p50/p95, DB size).
- `bge-small-en-v1.5` A-B; SigLIP opt-in behind evaluation + per-folder gating.
- EXIF GPS map filter; "similar images" via phash + optional SigLIP.
- Dynamic int8 only where benchmarked; ONNX text-encoder path.
- MV3 explicit-capture extension after core search is solid.

## 22. Useful References

Official / primary sources only (no blog-post trust):

- FAISS: `github.com/facebookresearch/faiss` (index-choice + indexes wikis);
  `arxiv.org/abs/2401.08281`; `pypi.org/project/faiss-cpu`
- BM25: Robertson & Zaragoza 2009
  (`staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf`);
  `sqlite.org/fts5.html`; `github.com/dorianbrown/rank_bm25`;
  `github.com/xhluca/bm25s`
- RRF: `cormack.uwaterloo.ca/cormacksigir09-rrf.pdf`;
  Elastic/OpenSearch RRF docs
- SQLite: `sqlite.org/wal.html`, `sqlite.org/pragma.html`
- Transformers/CPU: `pytorch.org/tutorials/recipes/recipes/tuning_guide.html`;
  `docs.pytorch.org/serve/performance_checklist.html`;
  `huggingface.co/docs/transformers/main/optimization_overview`;
  `huggingface.co/docs/safetensors/index`
- Models: HF cards `Salesforce/blip-image-captioning-base`,
  `microsoft/git-base-coco`, `microsoft/Florence-2-base`,
  `nlpconnect/vit-gpt2-image-captioning`,
  `sentence-transformers/all-MiniLM-L6-v2`, `BAAI/bge-small-en-v1.5`,
  `thenlper/gte-small`, `intfloat/e5-small-v2`,
  `openai/clip-vit-base-patch32`, `google/siglip-base-patch16-224`
- OCR: `github.com/tesseract-ocr/tesseract`,
  `github.com/madmaze/pytesseract`, `github.com/JaidedAI/EasyOCR`,
  `github.com/PaddlePaddle/PaddleOCR`, `github.com/RapidAI/RapidOCR`,
  `github.com/mindee/doctr`
- Hashing: `github.com/Cyan4973/xxHash`,
  `github.com/JohannesBuchner/imagehash`
- Pillow: `pillow.readthedocs.io/.../ExifTags.html`
- shadcn-html: `shadcn-html.com/documentation`, `github.com/codylindley/shadcn-html`
- Extensions: `developer.chrome.com/docs/extensions/.../content-scripts`,
  `.../reference/api/scripting`

---

## License notes (verify exact pinned revisions before release)

| Component | License | Notes |
|---|---|---|
| Python deps: FastAPI MIT; Uvicorn BSD-3 (verify at pin); Transformers Apache-2.0; sentence-transformers Apache-2.0; PyTorch BSD-3-Clause; Pillow HPND; faiss-cpu MIT; SQLite public domain | permissive | preserve notices |
| **EmbeddingGemma (`google/embeddinggemma-300m`)** | **Gemma Terms of Use — GATED** | Requires HF account + terms acceptance + `HF_TOKEN` for download. Only affects weights download, never code. Fallback chain keeps the app working without it. |
| **BoardUI free components (vendored source)** | source-you-own per BoardUI free tier | Only free items used. **Pro components/templates require a paid Pro license — never add them.** |
| React, Vite, Tailwind, React Aria | MIT | standard permissive frontend stack |
| Caption: BLIP BSD-3-Clause; GIT MIT; ViT-GPT2 Apache-2.0; Florence-2 MIT (model) but code header Apache-2.0 + remote code — pin + review | permissive w/ caution | re-check revision |
| Embeddings: MiniLM Apache-2.0; BGE-small MIT (metadata only); GTE-small MIT; E5 MIT | permissive | keep card record |
| OCR: Tesseract/EasyOCR/PaddleOCR/RapidOCR Apache-2.0 (RapidOCR weights per `MODEL_LICENSES.md`) | permissive | — |
| CLIP MIT; SigLIP Apache-2.0; JinaCLIP-v2 non-Apache — check before any use | caution on Jina-v2 | avoid NC/Gemma-gated weights |
| `rank-bm25`/`bm25s` Apache-2.0 (not MIT) | permissive | only if adopted |

No GPL/NC components in the planned stack. Avoid `CC-BY-NC`, LLaMA/Gemma-gated,
and `openrail++` checkpoints.
