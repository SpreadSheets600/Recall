import os
import tempfile

import pytest

from backend.app import config, db
from backend.app import ingestion as ing
from backend.app import search as searchsvc
from backend.app import vectors


@pytest.fixture()
def tmpdb(tmp_path):
    p = str(tmp_path / "t.db")
    db.init_db(p)
    vectors.reset_index(config.EMBED_DIM)
    yield p


def add(tmpdb, **kw):
    mem, created = ing.create_memory_record(tmpdb, **kw)
    return mem, created


def test_memory_creation_and_dedup(tmpdb):
    m1, c1 = add(tmpdb, mem_type="text", title="A", content="hello world")
    assert c1 is True
    m2, c2 = add(tmpdb, mem_type="text", title="A", content="hello world")
    assert c2 is False
    assert m1["id"] == m2["id"]


def test_memory_deletion(tmpdb):
    from fastapi.testclient import TestClient

    os.environ["RECALL_DB_PATH"] = tmpdb
    config.DB_PATH = tmpdb
    from backend.app.main import app

    c = TestClient(app)
    r = c.post("/api/memories", json={"title": "t", "content": "bye"})
    assert r.status_code == 200
    mid = r.json()["id"]
    assert c.delete(f"/api/memories/{mid}").status_code == 200
    assert c.get(f"/api/memories/{mid}").status_code == 404


def test_bm25_exact_match(tmpdb):
    add(tmpdb, mem_type="text", title="err", content="Could not resolve host github.com")
    add(tmpdb, mem_type="text", title="other", content="pasta recipe with basil")
    res = searchsvc.search_memories(tmpdb, "Could not resolve host github.com")
    assert res[0]["title"] == "err"
    assert "keyword" in res[0]["match"]


def test_semantic_search(tmpdb):
    add(tmpdb, mem_type="text", title="dns", content="failed GitHub connection caused by DNS resolution error")
    add(tmpdb, mem_type="text", title="recipe", content="chocolate cake recipe")
    res = searchsvc.search_memories(tmpdb, "GitHub DNS error")
    titles = [r["title"] for r in res]
    assert "dns" in titles


def test_ranking_prefers_exact(tmpdb):
    add(tmpdb, mem_type="text", title="exact", content="vector database FAISS")
    add(tmpdb, mem_type="text", title="vague", content="cooking and gardening")
    res = searchsvc.search_memories(tmpdb, "vector database FAISS")
    assert res[0]["title"] == "exact"


def test_source_filter(tmpdb):
    add(tmpdb, mem_type="webpage", title="gh", content="code here", source="https://github.com/x")
    add(tmpdb, mem_type="webpage", title="other", content="code here", source="https://example.com/y")
    res = searchsvc.search_memories(tmpdb, "code from github.com")
    assert res and res[0]["title"] == "gh"


def test_date_filter(tmpdb):
    import time

    mem, _ = add(tmpdb, mem_type="text", title="old", content="ancient note")
    conn = db.connect(tmpdb)
    try:
        conn.execute("UPDATE memories SET created_at=?, captured_at=? WHERE id=?",
                     (int(time.time()) - 40 * 86400, int(time.time()) - 40 * 86400, mem["id"]))
        conn.commit()
    finally:
        conn.close()
    add(tmpdb, mem_type="text", title="new", content="ancient note fresh")
    res = searchsvc.search_memories(tmpdb, "ancient note last week")
    assert res and res[0]["title"] == "new"


def test_failed_ingestion_does_not_destroy(tmpdb):
    out = ing.ingest_file(tmpdb, "/nonexistent/file.txt")
    assert out["status"] == "failed"
    m, _ = add(tmpdb, mem_type="text", title="ok", content="still here")
    res = searchsvc.search_memories(tmpdb, "still here")
    assert res[0]["id"] == m["id"]


def test_index_rebuild(tmpdb):
    m1, _ = add(tmpdb, mem_type="text", title="one", content="rebuild me")
    n = ing.rebuild_index(tmpdb)
    assert n >= 1
    res = searchsvc.search_memories(tmpdb, "rebuild me")
    assert res[0]["id"] == m1["id"]


def test_image_ingestion_and_metadata(tmp_path, tmpdb):
    from PIL import Image

    p = str(tmp_path / "shot.png")
    Image.new("RGB", (64, 32), color="red").save(p)
    out = ing.ingest_file(tmpdb, p, source="https://github.com/x", run_ai=False)
    assert out["status"] in ("indexed", "skipped")
    conn = db.connect(tmpdb)
    try:
        row = conn.execute("SELECT * FROM memories WHERE id=?", (out["id"],)).fetchone()
    finally:
        conn.close()
    assert row["width"] == 64 and row["height"] == 32
    res = searchsvc.search_memories(tmpdb, "shot.png")
    assert res


def test_ocr_handling_empty(tmp_path):
    from backend.app.ocr import extract_ocr
    from PIL import Image

    p = str(tmp_path / "blank.png")
    Image.new("RGB", (32, 32), color="white").save(p)
    out = extract_ocr(p)
    assert isinstance(out, str)


def test_bare_source_filter(tmpdb):
    add(tmpdb, mem_type="webpage", title="gh", content="code here", source="https://github.com/x")
    add(tmpdb, mem_type="webpage", title="other", content="code here", source="https://example.com/y")
    res = searchsvc.search_memories(tmpdb, "things saved from github")
    assert res and res[0]["title"] == "gh"


def test_article_query_does_not_hard_filter_type(tmpdb):
    add(tmpdb, mem_type="text", title="faiss", content="vector index for dense retrieval")
    res = searchsvc.search_memories(tmpdb, "article about vector databases")
    assert res and res[0]["title"] == "faiss"


def test_api_search_no_llm(tmpdb):
    from fastapi.testclient import TestClient

    os.environ["RECALL_DB_PATH"] = tmpdb
    config.DB_PATH = tmpdb
    vectors.reset_index(config.EMBED_DIM)
    add(tmpdb, mem_type="text", title="linux", content="Linux terminal showing failed GitHub connection")
    from backend.app.main import app

    c = TestClient(app)
    r = c.post("/api/search", json={"query": "Linux terminal"})
    assert r.status_code == 200
    assert r.json()["count"] >= 1


def test_auto_tags_extracted(tmpdb):
    m, _ = add(tmpdb, mem_type="text", title="FAISS notes",
               content="vector index for dense retrieval with FlatIP quantization")
    assert m["tags"], "tags should be auto-generated"
    assert "vector" in m["tags"] or "retrieval" in m["tags"]


def test_explicit_tags_preserved(tmpdb):
    m, _ = add(tmpdb, mem_type="text", title="t", content="blah blah",
               tags="custom, mine")
    assert m["tags"] == "custom, mine"


def test_upload_endpoint(tmpdb, tmp_path):
    from fastapi.testclient import TestClient

    old_db, old_up = config.DB_PATH, config.UPLOAD_DIR
    up = str(tmp_path / "uploads")
    os.makedirs(up, exist_ok=True)
    config.DB_PATH = tmpdb
    config.UPLOAD_DIR = up
    try:
        from backend.app.main import app

        c = TestClient(app)
        src = tmp_path / "note.txt"
        src.write_text("upload pipeline test content uniqueword123")
        with open(src, "rb") as f:
            r = c.post("/api/upload", files={"files": ("note.txt", f, "text/plain")})
        assert r.status_code == 200
        body = r.json()
        assert body["indexed"] == 1
        mid = body["results"][0]["id"]
        assert c.get(f"/api/memories/{mid}/file").status_code == 200
    finally:
        config.DB_PATH = old_db
        config.UPLOAD_DIR = old_up


def test_models_endpoint(tmpdb):
    from fastapi.testclient import TestClient

    old_db = config.DB_PATH
    config.DB_PATH = tmpdb
    try:
        from backend.app.main import app

        c = TestClient(app)
        r = c.get("/api/models")
        assert r.status_code == 200
        body = r.json()
        assert {"embed", "caption", "ocr", "vector_index", "lexical"} <= set(body)
    finally:
        config.DB_PATH = old_db


def test_gemma_prompts():
    from backend.app.embeddings import format_doc, format_query

    assert format_query("hello") == "task: search result | query: hello"
    assert format_doc("My title", "body") == "title: My title | text: body"
    assert format_doc("", "body") == "title: none | text: body"


def test_mrl_truncation_renormalizes():
    import numpy as np

    from backend.app.embeddings import truncate_mrl

    v = np.random.RandomState(0).randn(768).astype(np.float32)
    for dim in (512, 256, 128):
        out = truncate_mrl(v, dim)
        assert out.shape == (dim,)
        assert abs(float(np.linalg.norm(out)) - 1.0) < 1e-5


def test_rebuild_reembeds_on_dim_change(tmpdb):
    from backend.app import embeddings as emb

    old_dim = config.EMBED_DIM
    config.EMBED_DIM = 384
    try:
        m, _ = add(tmpdb, mem_type="text", title="dim", content="dimension migration probe")
        conn = db.connect(tmpdb)
        try:
            blob = conn.execute("SELECT embedding FROM memories WHERE id=?",
                                (m["id"],)).fetchone()["embedding"]
        finally:
            conn.close()
        import numpy as np

        assert np.frombuffer(blob, dtype=np.float32).shape[0] == 384
        # Same blob under a new dim must NOT be silently padded.
        assert emb.from_blob(blob, dim=768) is None
        config.EMBED_DIM = 768
        vectors.reset_index(768)
        n = ing.rebuild_index(tmpdb)
        assert n == 1
        conn = db.connect(tmpdb)
        try:
            blob2 = conn.execute("SELECT embedding FROM memories WHERE id=?",
                                 (m["id"],)).fetchone()["embedding"]
        finally:
            conn.close()
        assert np.frombuffer(blob2, dtype=np.float32).shape[0] == 768
    finally:
        config.EMBED_DIM = old_dim
        vectors.reset_index(old_dim)

def test_settings_api(tmpdb):
    from fastapi.testclient import TestClient

    old_db = config.DB_PATH
    config.DB_PATH = tmpdb
    try:
        from backend.app.main import app

        c = TestClient(app)
        r = c.get("/api/settings")
        assert r.status_code == 200
        settings = r.json()
        assert "w_dense" in settings
        assert "w_bm25" in settings

        update_resp = c.post("/api/settings", json={"w_dense": 0.8, "ocr_enabled": False})
        assert update_resp.status_code == 200
        assert update_resp.json()["w_dense"] == 0.8
        assert update_resp.json()["ocr_enabled"] is False
    finally:
        config.DB_PATH = old_db


def test_tools_optimize_and_benchmark(tmpdb):
    from fastapi.testclient import TestClient

    old_db = config.DB_PATH
    config.DB_PATH = tmpdb
    try:
        from backend.app.main import app

        c = TestClient(app)
        add(tmpdb, mem_type="text", title="sample", content="benchmark sample test")

        r_opt = c.post("/api/tools/optimize")
        assert r_opt.status_code == 200
        assert r_opt.json()["status"] == "success"

        r_bench = c.post("/api/tools/benchmark")
        assert r_bench.status_code == 200
        assert r_bench.json()["status"] == "healthy"
        assert "db_read_ms" in r_bench.json()
    finally:
        config.DB_PATH = old_db


def test_patch_and_batch_delete(tmpdb):
    from fastapi.testclient import TestClient

    old_db = config.DB_PATH
    config.DB_PATH = tmpdb
    try:
        from backend.app.main import app

        c = TestClient(app)
        m1, _ = add(tmpdb, mem_type="text", title="original title", content="original content")
        m2, _ = add(tmpdb, mem_type="text", title="second note", content="second content")

        patch_resp = c.patch(f"/api/memories/{m1['id']}", json={"title": "updated title", "tags": "customtag"})
        assert patch_resp.status_code == 200
        assert patch_resp.json()["title"] == "updated title"
        assert patch_resp.json()["tags"] == "customtag"

        # Search should find the updated title
        search_resp = c.post("/api/search", json={"query": "updated title"})
        assert search_resp.status_code == 200
        assert search_resp.json()["count"] >= 1

        # Batch delete
        del_resp = c.post("/api/memories/batch-delete", json={"ids": [m1["id"], m2["id"]]})
        assert del_resp.status_code == 200
        assert del_resp.json()["deleted"] == 2
        assert c.get(f"/api/memories/{m1['id']}").status_code == 404
    finally:
        config.DB_PATH = old_db


def test_export_and_import(tmpdb):
    from fastapi.testclient import TestClient

    old_db = config.DB_PATH
    config.DB_PATH = tmpdb
    try:
        from backend.app.main import app

        c = TestClient(app)
        add(tmpdb, mem_type="text", title="exp1", content="exportable memory content")

        exp_resp = c.post("/api/tools/export")
        assert exp_resp.status_code == 200
        data = exp_resp.json()
        assert data["count"] >= 1

        # Import test
        imp_resp = c.post("/api/tools/import", json={"memories": [
            {"type": "text", "title": "imported note", "content": "freshly imported content", "tags": "imported"}
        ]})
        assert imp_resp.status_code == 200
        assert imp_resp.json()["imported"] == 1
    finally:
        config.DB_PATH = old_db



def test_extension_ingest_dwell_and_search_filter(tmpdb):
    from fastapi.testclient import TestClient

    old_db = config.DB_PATH
    config.DB_PATH = tmpdb
    try:
        from backend.app.main import app

        c = TestClient(app)
        # 1. Ingest via extension endpoint
        payload = {
            "url": "https://docs.python.org/3/library/sqlite3.html",
            "title": "sqlite3 — DB-API 2.0 interface for SQLite databases",
            "content": "SQLite is a C library that provides a lightweight disk-based database",
            "markdown": "# SQLite 3 documentation and examples",
            "description": "Official documentation for Python sqlite3 module",
            "domain": "docs.python.org",
            "website_type": "docs",
            "dwell_time": 45,
            "tags": "python, sqlite, database",
        }
        resp = c.post("/api/extension/ingest", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"] is True
        mid = data["id"]

        # 2. Update dwell time via heartbeat
        dwell_resp = c.post("/api/extension/dwell", json={
            "url": "https://docs.python.org/3/library/sqlite3.html",
            "dwell_time": 180,
        })
        assert dwell_resp.status_code == 200
        assert dwell_resp.json()["dwell_time"] == 180

        # Verify stored memory
        mem_resp = c.get(f"/api/memories/{mid}")
        assert mem_resp.status_code == 200
        mem = mem_resp.json()
        assert mem["website_type"] == "docs"
        assert mem["dwell_time"] == 180

        # 3. Search with website_type and min_dwell filter
        s_resp = c.post("/api/search", json={
            "query": "sqlite lightweight",
            "website_type": "docs",
            "min_dwell": 60,
        })
        assert s_resp.status_code == 200
        results = s_resp.json()["results"]
        assert len(results) >= 1
        assert results[0]["id"] == mid
        assert "website-type" in results[0]["match"] or "docs" in results[0]["match"]
    finally:
        config.DB_PATH = old_db


def test_stats_includes_recent(tmpdb):
    from fastapi.testclient import TestClient

    old_db = config.DB_PATH
    config.DB_PATH = tmpdb
    try:
        from backend.app.main import app

        c = TestClient(app)
        add(tmpdb, mem_type="text", title="first", content="first note")
        add(tmpdb, mem_type="text", title="second", content="second note")
        r = c.get("/api/stats")
        assert r.status_code == 200
        body = r.json()
        assert "recent" in body
        assert [m["title"] for m in body["recent"]] == ["second", "first"]
        assert body["total"] == 2
    finally:
        config.DB_PATH = old_db


def test_knowledge_graph_endpoint(tmpdb):
    from fastapi.testclient import TestClient

    old_db = config.DB_PATH
    config.DB_PATH = tmpdb
    try:
        from backend.app.main import app

        c = TestClient(app)
        add(tmpdb, mem_type="text", title="Machine Learning with PyTorch",
            content="Deep neural networks trained with backpropagation", tags="ai, pytorch, ml")
        add(tmpdb, mem_type="text", title="FastAPI REST Microservice",
            content="Building high performance APIs with Python and Pydantic", tags="python, api, fastapi")

        resp = c.get("/api/graph")
        assert resp.status_code == 200
        data = resp.json()
        assert "nodes" in data
        assert "links" in data
        assert "stats" in data
        assert len(data["nodes"]) >= 2
        assert any(n["type"] == "term" for n in data["nodes"])
        assert any(n["type"] == "memory" for n in data["nodes"])
    finally:
        config.DB_PATH = old_db
