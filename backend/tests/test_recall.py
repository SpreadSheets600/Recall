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
