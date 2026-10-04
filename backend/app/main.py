import os
import shutil

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, db
from . import ingestion as ing
from . import models_info
from . import search as searchsvc
from . import vectors

from contextlib import asynccontextmanager


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


def ensure_started():
    global _started
    db.init_db(config.DB_PATH)
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
    conn = db.connect(config.DB_PATH)
    try:
        sql = "SELECT * FROM memories"
        args: list = []
        clauses = []
        if type:
            clauses.append("type=?")
            args.append(type)
        if q:
            clauses.append("(title LIKE ? OR content LIKE ? OR source LIKE ?)")
            args += ["%" + q + "%"] * 3
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        args += [min(limit, 200), offset]
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


class SearchIn(BaseModel):
    query: str = ""
    limit: int = 20
    type: str = ""
    source: str = ""
    date_from: int = 0
    date_to: int = 0


@app.post("/api/search")
def do_search(body: SearchIn):
    ensure_started()
    results = searchsvc.search_memories(
        config.DB_PATH, body.query, limit=min(body.limit or 20, 100),
        type_filter=body.type or None,
        domain_filter=body.source or None,
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
        return {
            "total": total,
            "by_type": by_type,
            "vectors": int(nvec),
            "db_bytes": size,
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
    if not os.path.exists(path):
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
            # Never cache the shell: bundle filenames are content-hashed,
            # so a stale index.html is the only way the UI goes stale.
            return FileResponse(candidate, headers={"Cache-Control": "no-store"})
    return {"name": "Recall", "docs": "/docs"}


if os.path.isdir(os.path.join(DIST, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")),
              name="assets")
if os.path.isdir(BASE):
    app.mount("/static", StaticFiles(directory=BASE), name="static")
