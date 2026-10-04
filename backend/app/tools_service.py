import os
import time

from . import config, db, embeddings, vectors
from . import ingestion as ing


def optimize_database(db_path: str):
    t0 = time.time()
    before_size = 0
    try:
        before_size = os.path.getsize(db_path)
    except OSError:
        pass

    conn = db.connect(db_path)
    try:
        conn.execute("PRAGMA optimize")
        try:
            conn.execute("INSERT INTO memories_fts(memories_fts) VALUES('optimize')")
        except Exception:
            pass
        conn.commit()
    finally:
        conn.close()

    # VACUUM needs autocommit connection or separate transaction
    try:
        import sqlite3
        vconn = sqlite3.connect(db_path, isolation_level=None)
        vconn.execute("VACUUM")
        vconn.close()
    except Exception:
        pass

    after_size = 0
    try:
        after_size = os.path.getsize(db_path)
    except OSError:
        pass

    duration_ms = round((time.time() - t0) * 1000, 2)
    return {
        "status": "success",
        "before_bytes": before_size,
        "after_bytes": after_size,
        "reclaimed_bytes": max(0, before_size - after_size),
        "duration_ms": duration_ms,
    }


def export_memories(db_path: str):
    conn = db.connect(db_path)
    try:
        rows = conn.execute("SELECT * FROM memories ORDER BY created_at ASC").fetchall()
        memories = [db.public_memory(db.row_to_memory(r)) for r in rows]
        return {
            "version": "1.0",
            "exported_at": int(time.time()),
            "count": len(memories),
            "memories": memories,
        }
    finally:
        conn.close()


def import_memories(db_path: str, memories: list):
    imported = 0
    skipped = 0
    for m in memories:
        try:
            _, created = ing.create_memory_record(
                db_path=db_path,
                mem_type=m.get("type") or "text",
                title=m.get("title") or "",
                path=m.get("path") or "",
                source=m.get("source") or "",
                content=m.get("content") or "",
                description=m.get("description") or "",
                ocr_text=m.get("ocr_text") or "",
                tags=m.get("tags") or "",
                extra={
                    "width": m.get("width"),
                    "height": m.get("height"),
                    "file_size": m.get("file_size"),
                    "captured_at": m.get("captured_at"),
                },
            )
            if created:
                imported += 1
            else:
                skipped += 1
        except Exception:
            skipped += 1
    if imported > 0:
        try:
            ing.rebuild_index(db_path)
        except Exception:
            pass
    return {"total": len(memories), "imported": imported, "skipped": skipped}


def run_benchmark(db_path: str):
    results = {}
    conn = db.connect(db_path)
    try:
        # 1. SQLite Read
        t0 = time.perf_counter()
        count = conn.execute("SELECT COUNT(*) c FROM memories").fetchone()["c"]
        results["db_read_ms"] = round((time.perf_counter() - t0) * 1000, 2)
        results["total_records"] = count

        # 2. SQLite FTS5 Query
        t0 = time.perf_counter()
        try:
            conn.execute("SELECT COUNT(*) FROM memories_fts WHERE memories_fts MATCH 'test'").fetchone()
            results["fts_search_ms"] = round((time.perf_counter() - t0) * 1000, 2)
            results["fts_status"] = "operational"
        except Exception as e:
            results["fts_search_ms"] = 0.0
            results["fts_status"] = str(e)
    finally:
        conn.close()

    # 3. Query Embedding Latency
    t0 = time.perf_counter()
    try:
        vec = embeddings.embed_query("benchmark query text for recall", dim=config.EMBED_DIM)
        results["embedding_ms"] = round((time.perf_counter() - t0) * 1000, 2)
        results["embedding_backend"] = embeddings.backend_status()
    except Exception as e:
        vec = None
        results["embedding_ms"] = 0.0
        results["embedding_backend"] = f"error: {e}"

    # 4. Vector Search Latency
    t0 = time.perf_counter()
    try:
        if vec is not None:
            idx = vectors.get_index(config.EMBED_DIM)
            idx.search(vec, k=min(10, count or 1))
            results["vector_search_ms"] = round((time.perf_counter() - t0) * 1000, 2)
            results["vector_index_type"] = "faiss" if idx.using_faiss() else "numpy"
        else:
            results["vector_search_ms"] = 0.0
            results["vector_index_type"] = "unavailable"
    except Exception as e:
        results["vector_search_ms"] = 0.0
        results["vector_index_type"] = f"error: {e}"

    results["status"] = "healthy"
    return results
