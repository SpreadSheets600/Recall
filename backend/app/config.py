import os

DATA_DIR = os.environ.get("RECALL_DATA_DIR", "data")
DB_PATH = os.environ.get("RECALL_DB_PATH", os.path.join(DATA_DIR, "recall.db"))
FAISS_PATH = os.environ.get("RECALL_FAISS_PATH", os.path.join(DATA_DIR, "recall.faiss"))

EMBED_MODEL = os.environ.get(
    "RECALL_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
)
EMBED_DIM = int(os.environ.get("RECALL_EMBED_DIM", "384"))
CAPTION_MODEL = os.environ.get(
    "RECALL_CAPTION_MODEL", "Salesforce/blip-image-captioning-base"
)

RRF_K = int(os.environ.get("RECALL_RRF_K", "60"))
W_DENSE = float(os.environ.get("RECALL_W_DENSE", "0.6"))
W_BM25 = float(os.environ.get("RECALL_W_BM25", "0.4"))
RECENCY_HALF_LIFE_DAYS = float(os.environ.get("RECALL_RECENCY_HALF_LIFE", "30"))

CANDIDATE_K = int(os.environ.get("RECALL_CANDIDATE_K", "50"))
