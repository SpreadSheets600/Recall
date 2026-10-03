import json
import os
import time

from . import config, db
from . import embeddings, textutil, vectors
from .imagemeta import compute_phash, extract_image_metadata


def _read_text_file(path: str):
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()[:200000]
    except Exception:
        return ""


def _read_pdf(path: str):
    try:
        from pypdf import PdfReader

        reader = PdfReader(path)
        parts = []
        for page in reader.pages[:50]:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                continue
        return "\n".join(parts)[:200000]
    except Exception:
        return ""


def _read_html(path: str):
    import re

    raw = _read_text_file(path)
    text = re.sub(r"<script.*?</script>", " ", raw, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()[:200000]


def extract_content(path: str, mem_type: str):
    if mem_type in ("text", "markdown"):
        return _read_text_file(path)
    if mem_type == "pdf":
        return _read_pdf(path)
    if mem_type == "webpage":
        if path and os.path.exists(path):
            return _read_html(path)
        return ""
    return ""


def create_memory_record(db_path: str, mem_type: str, title: str = "", path: str = "",
                         source: str = "", content: str = "", description: str = "",
                         ocr_text: str = "", tags: str = "", extra: dict = None):
    from .textutil import build_searchable_text, detect_type, domain_of, sha256_text

    extra = extra or {}
    if not mem_type:
        mem_type = detect_type(path or title)
    domain = domain_of(source)
    filename = os.path.basename(path or "")
    searchable = build_searchable_text(title, content, description, ocr_text,
                                       tags, filename, source)
    if not searchable.strip():
        searchable = (title or filename or "untitled").strip() or "untitled"
    base = "|".join([mem_type, title or "", path or "", content[:5000]])
    chash = sha256_text(base)
    now = db.now_ts()
    conn = db.connect(db_path)
    try:
        cur = conn.execute(
            """INSERT OR IGNORE INTO memories
            (type,title,path,source,domain,content,description,ocr_text,tags,
             width,height,file_size,exif_json,phash,content_hash,embedding,
             created_at,modified_at,captured_at,status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?)""",
            (mem_type, title, path, source, domain, searchable, description,
             ocr_text, tags, extra.get("width"), extra.get("height"),
             extra.get("file_size"),
             json.dumps(extra.get("exif", {})) if extra.get("exif") else None,
             extra.get("phash"), chash, None, now, now,
             extra.get("captured_at") or now, "queued"),
        )
        conn.commit()
        rowid = cur.lastrowid
        if rowid == 0 or cur.rowcount == 0:
            row = conn.execute(
                "SELECT * FROM memories WHERE content_hash=?", (chash,)).fetchone()
            mem = db.row_to_memory(row)
            return mem, False
        vec = embeddings.embed_texts([searchable], dim=config.EMBED_DIM)[0]
        conn.execute("UPDATE memories SET embedding=?, status='indexed' WHERE id=?",
                     (embeddings.to_blob(vec), rowid))
        conn.commit()
        row = conn.execute("SELECT * FROM memories WHERE id=?", (rowid,)).fetchone()
        mem = db.row_to_memory(row)
        try:
            vectors.get_index(config.EMBED_DIM).add([rowid], [vec])
        except Exception:
            pass
        return mem, True
    finally:
        conn.close()


def ingest_file(db_path: str, path: str, source: str = "", title: str = "",
                run_ai: bool = True):
    from .textutil import detect_type, domain_of, sha256_text

    if not path or not os.path.exists(path):
        return {"status": "failed", "error": "file not found: %s" % path}
    mem_type = detect_type(path)
    meta = {}
    ocr_text = ""
    description = ""
    content = ""
    try:
        st = os.stat(path)
        meta["file_size"] = st.st_size
        meta["captured_at"] = int(st.st_mtime)
        if mem_type == "image":
            info = extract_image_metadata(path)
            meta["width"] = info.get("width")
            meta["height"] = info.get("height")
            if info.get("file_size"):
                meta["file_size"] = info["file_size"]
            if info.get("exif"):
                meta["exif"] = info["exif"]
            meta["phash"] = compute_phash(path)
            if run_ai:
                try:
                    from .vision import caption_image_blip

                    description = caption_image_blip(path) or ""
                except Exception:
                    description = ""
                try:
                    from .ocr import extract_ocr

                    ocr_text = extract_ocr(path) or ""
                except Exception:
                    ocr_text = ""
        else:
            content = extract_content(path, mem_type)
    except Exception as e:
        conn = db.connect(db_path)
        try:
            now = db.now_ts()
            conn.execute(
                """INSERT INTO memories(type,title,path,source,content,status,created_at,content_hash)
                VALUES (?,?,?,?,?,?,?,?)""",
                (mem_type, title or os.path.basename(path), path, source,
                 title or os.path.basename(path), "failed", now,
                 sha256_text(path + str(now))),
            )
            conn.commit()
        finally:
            conn.close()
        return {"status": "failed", "error": str(e)}
    mem, created = create_memory_record(
        db_path, mem_type, title or os.path.basename(path), path, source,
        content, description, ocr_text, "", meta)
    if not created and mem_type == "image" and meta.get("phash"):
        pass
    return {"status": "indexed" if created else "skipped",
            "id": mem["id"] if mem else None}


def rebuild_index(db_path: str):
    import numpy as np

    from . import embeddings as emb

    conn = db.connect(db_path)
    try:
        rows = conn.execute("SELECT id, content, embedding FROM memories").fetchall()
    finally:
        conn.close()
    ids = []
    vecs = []
    for r in rows:
        d = dict(r)
        blob = d.get("embedding")
        v = emb.from_blob(blob, dim=config.EMBED_DIM) if blob else None
        if v is None:
            v = emb.embed_texts([d.get("content", "")], dim=config.EMBED_DIM)[0]
            conn2 = db.connect(db_path)
            try:
                conn2.execute("UPDATE memories SET embedding=? WHERE id=?",
                              (emb.to_blob(v), d["id"]))
                conn2.commit()
            finally:
                conn2.close()
        ids.append(d["id"])
        vecs.append(v)
    idx = vectors.get_index(config.EMBED_DIM)
    import numpy as np

    idx.rebuild(ids, np.asarray(vecs, dtype=np.float32) if vecs else np.zeros((0, config.EMBED_DIM)))
    return len(ids)
