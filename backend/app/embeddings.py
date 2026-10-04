import hashlib
import re

import numpy as np

_model = None
_model_name = None
_backend = "unloaded"

FALLBACK_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def is_gemma_model(name: str):
    return "embeddinggemma" in (name or "").lower()


def format_query(text: str):
    return "task: search result | query: %s" % (text or "")


def format_doc(title: str, text: str):
    t = (title or "").strip() or "none"
    return "title: %s | text: %s" % (t, text or "")


def truncate_mrl(vec, dim: int):
    v = np.asarray(vec, dtype=np.float32).flatten()
    if v.shape[0] == dim:
        out = v
    elif v.shape[0] > dim:
        out = v[:dim].copy()
    else:
        out = np.zeros((dim,), dtype=np.float32)
        out[: v.shape[0]] = v
    n = np.linalg.norm(out)
    if n > 0:
        out = out / n
    return out.astype(np.float32)


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


def _load_model(name: str):
    global _model, _model_name
    if _model is None or _model_name != name:
        from sentence_transformers import SentenceTransformer

        try:
            _model = SentenceTransformer(name, trust_remote_code=False, local_files_only=True)
        except Exception:
            _model = SentenceTransformer(name, trust_remote_code=False)
        _model_name = name
    return _model


def _encode_with(model, name: str, texts: list, is_query: bool, dim: int):
    use_prompts = is_gemma_model(name)
    if is_query and use_prompts and hasattr(model, "encode_query"):
        vecs = model.encode_query(list(texts), normalize_embeddings=True,
                                  show_progress_bar=False)
    elif not is_query and use_prompts and hasattr(model, "encode_document"):
        vecs = model.encode_document(list(texts), normalize_embeddings=True,
                                     show_progress_bar=False)
    else:
        vecs = model.encode(list(texts), normalize_embeddings=True,
                            show_progress_bar=False)
    vecs = np.asarray(vecs, dtype=np.float32)
    if vecs.ndim == 1:
        vecs = vecs.reshape(1, -1)
    if vecs.shape[1] != dim:
        vecs = np.asarray([truncate_mrl(v, dim) for v in vecs], dtype=np.float32)
    return vecs


def _try_backend(name: str, texts: list, titles, is_query: bool, dim: int):
    global _backend
    model = _load_model(name)
    if is_query:
        inputs = [format_query(t) for t in texts] if is_gemma_model(name) else list(texts)
    else:
        if is_gemma_model(name):
            titles = titles or [""] * len(texts)
            inputs = [format_doc(ti, tx) for ti, tx in zip(titles, texts)]
        else:
            inputs = list(texts)
    vecs = _encode_with(model, name, inputs, is_query, dim)
    _backend = "embeddinggemma" if is_gemma_model(name) else "minilm"
    return vecs


def embed_texts(texts: list, dim: int = 768, titles=None):
    from . import config

    if not texts:
        return np.zeros((0, dim), dtype=np.float32)
    dim = dim or config.EMBED_DIM
    try:
        return _try_backend(config.EMBED_MODEL, list(texts), titles, False, dim)
    except Exception:
        pass
    if config.EMBED_MODEL != FALLBACK_MODEL:
        try:
            return _try_backend(FALLBACK_MODEL, list(texts), titles, False, dim)
        except Exception:
            pass
    global _backend
    _backend = "hash-fallback"
    return _hash_embed(list(texts), dim)


def embed_query(text: str, dim: int = 768):
    from . import config

    dim = dim or config.EMBED_DIM
    try:
        return _try_backend(config.EMBED_MODEL, [text], None, True, dim)[0]
    except Exception:
        pass
    if config.EMBED_MODEL != FALLBACK_MODEL:
        try:
            return _try_backend(FALLBACK_MODEL, [text], None, True, dim)[0]
        except Exception:
            pass
    global _backend
    _backend = "hash-fallback"
    return _hash_embed([text], dim)[0]


def backend_status():
    return _backend


def reset_model():
    global _model, _model_name, _backend
    _model = None
    _model_name = None
    _backend = "unloaded"


def to_blob(vec):
    import numpy as np

    return np.asarray(vec, dtype=np.float32).tobytes()


def from_blob(blob, dim: int = 768):
    import numpy as np

    if blob is None:
        return None
    v = np.frombuffer(blob, dtype=np.float32)
    if v.shape[0] != dim:
        return None
    return v
