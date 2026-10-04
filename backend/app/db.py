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
  status TEXT NOT NULL DEFAULT 'indexed',
  website_type TEXT,
  dwell_time INTEGER DEFAULT 0
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
CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
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
        # Migrate existing DBs if columns are missing
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(memories)").fetchall()}
        if "website_type" not in cols:
            conn.execute("ALTER TABLE memories ADD COLUMN website_type TEXT")
        if "dwell_time" not in cols:
            conn.execute("ALTER TABLE memories ADD COLUMN dwell_time INTEGER DEFAULT 0")
        conn.commit()
    finally:
        conn.close()


def row_to_memory(row):
    if row is None:
        return None
    m = dict(row)
    for k in ("width", "height", "file_size", "created_at", "modified_at", "captured_at", "dwell_time"):
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


def get_all_settings(db_path):
    conn = connect(db_path)
    try:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
        return {r["key"]: r["value"] for r in rows}
    finally:
        conn.close()


def save_setting(db_path, key: str, value: str):
    conn = connect(db_path)
    try:
        now = now_ts()
        conn.execute(
            """INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at""",
            (key, str(value), now),
        )
        conn.commit()
    finally:
        conn.close()


def save_all_settings(db_path, settings_dict: dict):
    conn = connect(db_path)
    try:
        now = now_ts()
        for k, v in settings_dict.items():
            conn.execute(
                """INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
                   ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at""",
                (k, str(v), now),
            )
        conn.commit()
    finally:
        conn.close()
