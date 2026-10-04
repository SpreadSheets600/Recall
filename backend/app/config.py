import os

DATA_DIR = os.environ.get("RECALL_DATA_DIR", "data")
DB_PATH = os.environ.get("RECALL_DB_PATH", os.path.join(DATA_DIR, "recall.db"))
FAISS_PATH = os.environ.get("RECALL_FAISS_PATH", os.path.join(DATA_DIR, "recall.faiss"))
UPLOAD_DIR = os.environ.get("RECALL_UPLOAD_DIR", os.path.join(DATA_DIR, "uploads"))

EMBED_MODEL = os.environ.get(
    "RECALL_EMBED_MODEL", "google/embeddinggemma-300m"
)
EMBED_DIM = int(os.environ.get("RECALL_EMBED_DIM", "768"))
CAPTION_MODEL = os.environ.get(
    "RECALL_CAPTION_MODEL", "Salesforce/blip-image-captioning-base"
)

RRF_K = int(os.environ.get("RECALL_RRF_K", "60"))
W_DENSE = float(os.environ.get("RECALL_W_DENSE", "0.6"))
W_BM25 = float(os.environ.get("RECALL_W_BM25", "0.4"))
RECENCY_HALF_LIFE_DAYS = float(os.environ.get("RECALL_RECENCY_HALF_LIFE", "30"))

CANDIDATE_K = int(os.environ.get("RECALL_CANDIDATE_K", "50"))

OCR_ENABLED = os.environ.get("RECALL_OCR_ENABLED", "true").lower() in ("true", "1", "yes")
CAPTION_ENABLED = os.environ.get("RECALL_CAPTION_ENABLED", "true").lower() in ("true", "1", "yes")
AUTOTAG_ENABLED = os.environ.get("RECALL_AUTOTAG_ENABLED", "true").lower() in ("true", "1", "yes")


def as_dict():
    return {
        "w_dense": W_DENSE,
        "w_bm25": W_BM25,
        "rrf_k": RRF_K,
        "recency_half_life_days": RECENCY_HALF_LIFE_DAYS,
        "candidate_k": CANDIDATE_K,
        "ocr_enabled": OCR_ENABLED,
        "caption_enabled": CAPTION_ENABLED,
        "autotag_enabled": AUTOTAG_ENABLED,
        "embed_model": EMBED_MODEL,
        "embed_dim": EMBED_DIM,
        "caption_model": CAPTION_MODEL,
        "data_dir": DATA_DIR,
        "upload_dir": UPLOAD_DIR,
    }


def load_from_db(db_path):
    from . import db

    saved = db.get_all_settings(db_path)
    apply_settings(saved)
    return as_dict()


def apply_settings(settings_dict):
    global W_DENSE, W_BM25, RRF_K, RECENCY_HALF_LIFE_DAYS, CANDIDATE_K
    global OCR_ENABLED, CAPTION_ENABLED, AUTOTAG_ENABLED

    if "w_dense" in settings_dict:
        try:
            W_DENSE = float(settings_dict["w_dense"])
        except (ValueError, TypeError):
            pass
    if "w_bm25" in settings_dict:
        try:
            W_BM25 = float(settings_dict["w_bm25"])
        except (ValueError, TypeError):
            pass
    if "rrf_k" in settings_dict:
        try:
            RRF_K = int(settings_dict["rrf_k"])
        except (ValueError, TypeError):
            pass
    if "recency_half_life_days" in settings_dict:
        try:
            RECENCY_HALF_LIFE_DAYS = float(settings_dict["recency_half_life_days"])
        except (ValueError, TypeError):
            pass
    if "candidate_k" in settings_dict:
        try:
            CANDIDATE_K = int(settings_dict["candidate_k"])
        except (ValueError, TypeError):
            pass
    if "ocr_enabled" in settings_dict:
        OCR_ENABLED = bool(settings_dict["ocr_enabled"])
    if "caption_enabled" in settings_dict:
        CAPTION_ENABLED = bool(settings_dict["caption_enabled"])
    if "autotag_enabled" in settings_dict:
        AUTOTAG_ENABLED = bool(settings_dict["autotag_enabled"])


def save_to_db(db_path, new_settings):
    from . import db

    apply_settings(new_settings)
    db.save_all_settings(db_path, as_dict())
    return as_dict()
