import os
import shutil
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, db, embeddings
from . import graph_service
from . import ingestion as ing
from . import models_info
from . import search as searchsvc
from . import tools_service
from . import vectors


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_started()
    yield


app = FastAPI(title="Recall", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_started = False

# Matches the "up to 50 MB each" claim in the upload UI.
MAX_UPLOAD_BYTES = int(os.environ.get("RECALL_MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))


def ensure_started():
    global _started
    db.init_db(config.DB_PATH)
    config.load_from_db(config.DB_PATH)
    try:
        os.makedirs(config.UPLOAD_DIR, exist_ok=True)
    except Exception:
        pass
    if not _started:
        try:
            ing.rebuild_index(config.DB_PATH)
        except Exception:
            pass
        _started = True


@app.get("/api/health")
def health():
    ensure_started()
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/memories")
def list_memories(type: str = "", q: str = "", limit: int = 50, offset: int = 0):
    ensure_started()
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    conn = db.connect(config.DB_PATH)
    try:
        sql = "SELECT * FROM memories"
        args: list = []
        clauses = []
        if type:
            clauses.append("type=?")
            args.append(type)
        if q:
            clauses.append("(title LIKE ? OR content LIKE ? OR source LIKE ? OR tags LIKE ?)")
            args += ["%" + q + "%"] * 4
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        args += [limit, offset]
        rows = conn.execute(sql, args).fetchall()
        return [db.public_memory(db.row_to_memory(r)) for r in rows]
    finally:
        conn.close()


@app.get("/api/memories/{mid}")
def get_memory(mid: int):
    ensure_started()
    conn = db.connect(config.DB_PATH)
    try:
        row = conn.execute("SELECT * FROM memories WHERE id=?", (mid,)).fetchone()
    finally:
        conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="memory not found")
    mem = db.public_memory(db.row_to_memory(row))
    related = searchsvc.search_memories(
        config.DB_PATH, (mem.get("title") or "") + " " + (mem.get("content") or "")[:500],
        limit=5)
    mem["related"] = [r for r in related if r["id"] != mid][:4]
    return mem


class MemoryIn(BaseModel):
    type: str = ""
    title: str = ""
    path: str = ""
    source: str = ""
    content: str = ""
    description: str = ""
    ocr_text: str = ""
    tags: str = ""


@app.post("/api/memories")
def create_memory(body: MemoryIn):
    ensure_started()
    if not body.content and not body.title and not body.path:
        raise HTTPException(status_code=400, detail="title, content, or path required")
    mem, created = ing.create_memory_record(
        config.DB_PATH, body.type or "text", body.title, body.path,
        body.source, body.content, body.description, body.ocr_text, body.tags, {})
    return {"id": mem["id"], "created": created, "memory": db.public_memory(mem)}


class MemoryPatchIn(BaseModel):
    title: str | None = None
    content: str | None = None
    tags: str | None = None
    description: str | None = None


@app.patch("/api/memories/{mid}")
def patch_memory(mid: int, body: MemoryPatchIn):
    ensure_started()
    conn = db.connect(config.DB_PATH)
    try:
        row = conn.execute("SELECT * FROM memories WHERE id=?", (mid,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="memory not found")
        updates = []
        args = []
        if body.title is not None:
            updates.append("title=?")
            args.append(body.title)
        if body.content is not None:
            updates.append("content=?")
            args.append(body.content)
        if body.tags is not None:
            updates.append("tags=?")
            args.append(body.tags)
        if body.description is not None:
            updates.append("description=?")
            args.append(body.description)
        if updates:
            args.append(mid)
            conn.execute(f"UPDATE memories SET {', '.join(updates)} WHERE id=?", args)
            conn.commit()
            updated_row = conn.execute("SELECT * FROM memories WHERE id=?", (mid,)).fetchone()
            mem = db.row_to_memory(updated_row)
            # Content/title changed -> the stored vector is stale. Rebuild the
            # searchable text and re-embed so both FTS (via trigger) and the
            # dense index reflect the edit.
            try:
                from . import textutil as tu

                searchable = tu.build_searchable_text(
                    mem.get("title") or "", mem.get("content") or "",
                    mem.get("description") or "", mem.get("ocr_text") or "",
                    mem.get("tags") or "",
                    os.path.basename(mem.get("path") or ""),
                    mem.get("source") or "",
                )
                vec = embeddings.embed_texts(
                    [searchable], dim=config.EMBED_DIM,
                    titles=[mem.get("title") or ""])[0]
                conn.execute(
                    "UPDATE memories SET embedding=?, modified_at=? WHERE id=?",
                    (embeddings.to_blob(vec), db.now_ts(), mid))
                conn.commit()
                updated_row = conn.execute("SELECT * FROM memories WHERE id=?", (mid,)).fetchone()
            except Exception:
                pass
            try:
                ing.rebuild_index(config.DB_PATH)
            except Exception:
                pass
            return db.public_memory(db.row_to_memory(updated_row))
        return db.public_memory(db.row_to_memory(row))
    finally:
        conn.close()


@app.delete("/api/memories/{mid}")
def delete_memory(mid: int):
    ensure_started()
    conn = db.connect(config.DB_PATH)
    try:
        cur = conn.execute("DELETE FROM memories WHERE id=?", (mid,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="memory not found")
    finally:
        conn.close()
    try:
        ing.rebuild_index(config.DB_PATH)
    except Exception:
        pass
    return {"deleted": mid}


class BatchDeleteIn(BaseModel):
    ids: list[int]


@app.post("/api/memories/batch-delete")
def batch_delete_memories(body: BatchDeleteIn):
    ensure_started()
    if not body.ids:
        return {"deleted": 0}
    conn = db.connect(config.DB_PATH)
    try:
        placeholders = ",".join("?" for _ in body.ids)
        cur = conn.execute(f"DELETE FROM memories WHERE id IN ({placeholders})", body.ids)
        conn.commit()
        deleted_count = cur.rowcount
    finally:
        conn.close()
    try:
        ing.rebuild_index(config.DB_PATH)
    except Exception:
        pass
    return {"deleted": deleted_count}


class SearchIn(BaseModel):
    query: str = ""
    limit: int = 20
    type: str = ""
    source: str = ""
    website_type: str = ""
    min_dwell: int | None = None
    date_from: int = 0
    date_to: int = 0


@app.post("/api/search")
def do_search(body: SearchIn):
    ensure_started()
    results = searchsvc.search_memories(
        config.DB_PATH, body.query, limit=max(1, min(body.limit or 20, 100)),
        type_filter=body.type or None,
        domain_filter=body.source or None,
        website_type_filter=body.website_type or None,
        min_dwell=body.min_dwell,
        date_from=body.date_from or None,
        date_to=body.date_to or None)
    return {"query": body.query, "count": len(results), "results": results}


class IngestIn(BaseModel):
    path: str = ""
    source: str = ""
    title: str = ""


@app.post("/api/ingest")
def do_ingest(body: IngestIn):
    ensure_started()
    if not body.path:
        raise HTTPException(status_code=400, detail="path required")
    result = ing.ingest_file(config.DB_PATH, body.path, body.source, body.title)
    if result.get("status") == "failed":
        raise HTTPException(status_code=400, detail=result.get("error", "ingest failed"))
    return result


@app.get("/api/ingest/{mid}")
def ingest_status(mid: int):
    ensure_started()
    conn = db.connect(config.DB_PATH)
    try:
        row = conn.execute("SELECT id, status, title FROM memories WHERE id=?",
                           (mid,)).fetchone()
    finally:
        conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="not found")
    return dict(row)


@app.get("/api/stats")
def stats():
    ensure_started()
    conn = db.connect(config.DB_PATH)
    try:
        total = conn.execute("SELECT COUNT(*) c FROM memories").fetchone()["c"]
        by_type = {r["type"]: r["c"] for r in conn.execute(
            "SELECT type, COUNT(*) c FROM memories GROUP BY type").fetchall()}
        idx = vectors.get_index(config.EMBED_DIM)
        nvec = idx._index.ntotal if idx.using_faiss() else len(idx._ids)
        size = 0
        try:
            size = os.path.getsize(config.DB_PATH)
        except OSError:
            pass
        recent_rows = conn.execute(
            "SELECT * FROM memories ORDER BY created_at DESC, id DESC LIMIT 6"
        ).fetchall()
        recent = []
        for r in recent_rows:
            m = db.public_memory(db.row_to_memory(r))
            # Card previews only render a snippet; keep the stats payload light.
            # Full text loads on demand via GET /api/memories/{id}.
            for k in ("content", "description", "ocr_text"):
                if m.get(k) and len(m[k]) > 2000:
                    m[k] = m[k][:2000]
            recent.append(m)
        return {
            "total": total,
            "by_type": by_type,
            "vectors": int(nvec),
            "db_bytes": size,
            "recent": recent,
            "settings": config.as_dict(),
            "uploads": len([f for f in os.listdir(config.UPLOAD_DIR)])
            if os.path.isdir(config.UPLOAD_DIR) else 0,
            "models": {"embed": config.EMBED_MODEL, "caption": config.CAPTION_MODEL},
            "models_detail": models_info.models_status(),
        }
    finally:
        conn.close()


@app.post("/api/rebuild")
def rebuild():
    ensure_started()
    n = ing.rebuild_index(config.DB_PATH)
    return {"rebuilt": n}


@app.get("/api/models")
def models():
    ensure_started()
    return models_info.models_status()


@app.get("/api/settings")
def get_settings():
    ensure_started()
    return config.as_dict()


class SettingsUpdateIn(BaseModel):
    w_dense: float | None = None
    w_bm25: float | None = None
    rrf_k: int | None = None
    recency_half_life_days: float | None = None
    candidate_k: int | None = None
    ocr_enabled: bool | None = None
    caption_enabled: bool | None = None
    autotag_enabled: bool | None = None


@app.post("/api/settings")
def update_settings(body: SettingsUpdateIn):
    ensure_started()
    updates = body.model_dump(exclude_unset=True)
    saved = config.save_to_db(config.DB_PATH, updates)
    return saved


@app.post("/api/tools/optimize")
def tool_optimize():
    ensure_started()
    return tools_service.optimize_database(config.DB_PATH)


@app.post("/api/tools/benchmark")
def tool_benchmark():
    ensure_started()
    return tools_service.run_benchmark(config.DB_PATH)


class EmbedTestIn(BaseModel):
    text: str = ""


@app.post("/api/tools/embed-test")
def tool_embed_test(body: EmbedTestIn):
    ensure_started()
    text = (body.text or "").strip()
    if not text:
        text = "Recall local vector memory test"
    t0 = time.perf_counter()
    vec = embeddings.embed_query(text, dim=config.EMBED_DIM)
    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    norm = round(float(sum(float(x) * float(x) for x in vec) ** 0.5), 4)
    preview = [round(float(x), 4) for x in vec[:12]]
    return {
        "text": text,
        "dim": len(vec),
        "latency_ms": latency_ms,
        "norm": norm,
        "vector_preview": preview,
        "backend": embeddings.backend_status(),
        "model_name": config.EMBED_MODEL,
    }


@app.get("/api/tools/export")
@app.post("/api/tools/export")
def tool_export():
    ensure_started()
    return tools_service.export_memories(config.DB_PATH)


class ImportIn(BaseModel):
    memories: list[dict]


@app.post("/api/tools/import")
def tool_import(body: ImportIn):
    ensure_started()
    return tools_service.import_memories(config.DB_PATH, body.memories)


class ExtensionIngestIn(BaseModel):
    url: str
    title: str = ""
    content: str = ""
    markdown: str = ""
    description: str = ""
    domain: str = ""
    website_type: str = "webpage"
    dwell_time: int = 0
    tags: str = ""


@app.post("/api/extension/ingest")
def extension_ingest(body: ExtensionIngestIn):
    ensure_started()
    body.url = (body.url or "").strip()
    if not body.url:
        raise HTTPException(status_code=400, detail="url required")
    dwell = max(0, int(body.dwell_time or 0))
    new_content = body.content or body.markdown or body.description or ""
    # Re-captures of the same URL update the existing memory instead of
    # stacking duplicates (content hash alone would treat every edit as new).
    conn = db.connect(config.DB_PATH)
    try:
        row = conn.execute(
            "SELECT * FROM memories WHERE source=? ORDER BY created_at DESC LIMIT 1",
            (body.url,)).fetchone()
        existing = db.row_to_memory(row) if row else None
    finally:
        conn.close()
    if existing is not None:
        from . import textutil as tu

        title = body.title or existing.get("title") or ""
        content = new_content or existing.get("content") or ""
        description = body.description or existing.get("description") or ""
        tags = body.tags or existing.get("tags") or ""
        domain = body.domain or existing.get("domain") or ""
        wtype = body.website_type or existing.get("website_type")
        dwell = max(dwell, int(existing.get("dwell_time") or 0))
        searchable = tu.build_searchable_text(
            title, content, description, existing.get("ocr_text") or "",
            tags, "", body.url)
        try:
            vec = embeddings.embed_texts(
                [searchable], dim=config.EMBED_DIM, titles=[title])[0]
            blob = embeddings.to_blob(vec)
        except Exception:
            blob = existing.get("embedding")
        conn = db.connect(config.DB_PATH)
        try:
            conn.execute(
                """UPDATE memories SET title=?, content=?, description=?, tags=?,
                   domain=?, website_type=?, dwell_time=?, embedding=?,
                   modified_at=? WHERE id=?""",
                (title, searchable, description, tags, domain, wtype, dwell,
                 blob, db.now_ts(), existing["id"]))
            conn.commit()
        finally:
            conn.close()
        try:
            ing.rebuild_index(config.DB_PATH)
        except Exception:
            pass
        return {"status": "updated", "created": False, "id": existing["id"]}
    extra = {
        "domain": body.domain,
        "website_type": body.website_type,
        "dwell_time": dwell,
        "markdown": body.markdown,
    }
    mem, created = ing.create_memory_record(
        db_path=config.DB_PATH,
        mem_type="webpage",
        title=body.title,
        path="",
        source=body.url,
        content=new_content,
        description=body.description,
        ocr_text="",
        tags=body.tags,
        extra=extra,
    )
    return {"status": "indexed" if created else "updated", "created": created, "id": mem["id"]}


class DwellHeartbeatIn(BaseModel):
    url: str
    dwell_time: int


@app.post("/api/extension/dwell")
def extension_dwell(body: DwellHeartbeatIn):
    ensure_started()
    dwell = max(0, int(body.dwell_time or 0))
    conn = db.connect(config.DB_PATH)
    try:
        row = conn.execute("SELECT id FROM memories WHERE source=? ORDER BY created_at DESC LIMIT 1",
                           (body.url,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Memory not found for url")
        conn.execute("UPDATE memories SET dwell_time=? WHERE id=?", (dwell, row["id"]))
        conn.commit()
        return {"id": row["id"], "dwell_time": dwell}
    finally:
        conn.close()


@app.get("/api/graph")
def knowledge_graph(min_terms: int = 1, max_nodes: int = 150):
    ensure_started()
    return graph_service.build_knowledge_graph(
        config.DB_PATH,
        min_term_count=max(1, min_terms),
        max_nodes=min(max(10, max_nodes), 500))


@app.post("/api/upload")
def upload_files(files: list[UploadFile] = File(...), source: str = Form("")):
    ensure_started()
    try:
        os.makedirs(config.UPLOAD_DIR, exist_ok=True)
    except Exception:
        pass
    results = []
    for f in files:
        name = os.path.basename(f.filename or "upload")
        if not name or name in (".", ".."):
            name = "upload"
        dest = os.path.join(config.UPLOAD_DIR, name)
        base, ext = os.path.splitext(dest)
        n = 1
        while os.path.exists(dest):
            dest = "%s-%d%s" % (base, n, ext)
            n += 1
        try:
            with open(dest, "wb") as out:
                shutil.copyfileobj(f.file, out)
        except Exception as e:
            results.append({"filename": f.filename, "status": "failed",
                            "error": str(e)})
            continue
        try:
            if os.path.getsize(dest) > MAX_UPLOAD_BYTES:
                os.remove(dest)
                cap = ("%d MB" % (MAX_UPLOAD_BYTES // (1024 * 1024))
                       if MAX_UPLOAD_BYTES >= 1024 * 1024
                       else "%d KB" % (MAX_UPLOAD_BYTES // 1024))
                results.append({"filename": f.filename, "status": "failed",
                                "error": "file exceeds %s limit" % cap})
                continue
        except OSError:
            pass
        try:
            r = ing.ingest_file(config.DB_PATH, dest, source or "", name)
            r["filename"] = f.filename
            r["stored_as"] = os.path.basename(dest)
            results.append(r)
        except Exception as e:
            results.append({"filename": f.filename, "status": "failed",
                            "error": str(e)})
        finally:
            try:
                f.file.close()
            except Exception:
                pass
    ok = sum(1 for r in results if r.get("status") in ("indexed", "skipped"))
    return {"count": len(results), "indexed": ok, "results": results}


@app.get("/api/memories/{mid}/file")
def memory_file(mid: int):
    ensure_started()
    conn = db.connect(config.DB_PATH)
    try:
        row = conn.execute("SELECT path FROM memories WHERE id=?", (mid,)).fetchone()
    finally:
        conn.close()
    if row is None or not row["path"]:
        raise HTTPException(status_code=404, detail="no file for this memory")
    path = row["path"]
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="file not found on disk")
    return FileResponse(path)


BASE = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
BASE = os.path.abspath(BASE)
DIST = os.path.join(BASE, "dist")


@app.get("/", include_in_schema=False)
def root():
    for candidate in (os.path.join(DIST, "index.html"),
                      os.path.join(BASE, "index.html")):
        if os.path.exists(candidate):
            return FileResponse(candidate, headers={"Cache-Control": "no-store"})
    return {"name": "Recall", "docs": "/docs"}


if os.path.isdir(os.path.join(DIST, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")),
              name="assets")
if os.path.isdir(BASE):
    app.mount("/static", StaticFiles(directory=BASE), name="static")
