import json
import sqlite3
import time

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS memories(
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT,
  path TEXT,
  source TEXT,
  domain TEXT,
  content TEXT NOT NULL,
  description TEXT,
  ocr_text TEXT,
  tags TEXT,
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  exif_json TEXT,
  phash TEXT,
  content_hash TEXT NOT NULL UNIQUE,
  embedding BLOB,
  created_at INTEGER NOT NULL,
  modified_at INTEGER,
  captured_at INTEGER,
  status TEXT NOT NULL DEFAULT 'indexed'
);
CREATE INDEX IF NOT EXISTS idx_mem_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_mem_source ON memories(source);
CREATE INDEX IF NOT EXISTS idx_mem_created ON memories(created_at);
CREATE INDEX IF NOT EXISTS idx_mem_hash ON memories(content_hash);
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content, content='memories', content_rowid='id',
  tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.id, old.content);
END;
CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.id, old.content);
  INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
END;
"""


def connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path):
    import os

    os.makedirs(os.path.dirname(os.path.abspath(db_path)) or ".", exist_ok=True)
    conn = connect(db_path)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def row_to_memory(row):
    if row is None:
        return None
    m = dict(row)
    for k in ("width", "height", "file_size", "created_at", "modified_at", "captured_at"):
        if m.get(k) is not None:
            try:
                m[k] = int(m[k])
            except (ValueError, TypeError):
                pass
    return m


def public_memory(m):
    if m is None:
        return None
    out = dict(m)
    out.pop("embedding", None)
    return out


def now_ts():
    return int(time.time())
