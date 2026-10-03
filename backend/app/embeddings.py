import hashlib
import re

import numpy as np

_model = None
_model_name = None


def _hash_embed(texts: list, dim: int):
    vecs = np.zeros((len(texts), dim), dtype=np.float32)
    for i, t in enumerate(texts):
        toks = re.findall(r"[a-z0-9]+", (t or "").lower())
        if not toks:
            toks = ["empty"]
        for tok in toks:
            h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
            vecs[i, h % dim] += 1.0
        n = np.linalg.norm(vecs[i])
        if n > 0:
            vecs[i] /= n
    return vecs


def embed_texts(texts: list, dim: int = 384):
    global _model, _model_name
    if not texts:
        return np.zeros((0, dim), dtype=np.float32)
    try:
        from sentence_transformers import SentenceTransformer
        from . import config
        name = config.EMBED_MODEL
        if _model is None or _model_name != name:
            _model = SentenceTransformer(name)
            _model_name = name
        vecs = _model.encode(list(texts), normalize_embeddings=True,
                             show_progress_bar=False)
        return np.asarray(vecs, dtype=np.float32)
    except Exception:
        return _hash_embed(texts, dim)


def embed_query(text: str, dim: int = 384):
    return embed_texts([text], dim=dim)[0]


def to_blob(vec):
    import numpy as np

    return np.asarray(vec, dtype=np.float32).tobytes()


def from_blob(blob, dim: int = 384):
    import numpy as np

    if blob is None:
        return None
    v = np.frombuffer(blob, dtype=np.float32)
    if v.shape[0] != dim:
        out = np.zeros((dim,), dtype=np.float32)
        n = min(dim, v.shape[0])
        out[:n] = v[:n]
        nn = np.linalg.norm(out)
        if nn > 0:
            out /= nn
        return out
    return v
