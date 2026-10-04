import importlib.util


def _available(module: str):
    return importlib.util.find_spec(module) is not None


def models_status():
    from . import config

    embed_lib = _available("sentence_transformers")
    torch_ok = _available("torch")
    transformers_ok = _available("transformers")
    rapidocr_ok = _available("rapidocr_onnxruntime")
    tesseract_ok = _available("pytesseract")
    faiss_ok = _available("faiss")
    try:
        import PIL

        pillow_ok = True
        pillow_v = getattr(PIL, "__version__", "?")
    except Exception:
        pillow_ok = False
        pillow_v = "?"

    try:
        import sqlite3

        sqlite_v = sqlite3.sqlite_version
    except Exception:
        sqlite_v = "?"

    return {
        "embed": {
            "name": config.EMBED_MODEL,
            "dim": config.EMBED_DIM,
            "library": "sentence-transformers" if embed_lib else "missing (hash fallback active)",
            "ready": bool(embed_lib and torch_ok),
            "size": "~80-90MB",
            "license": "Apache-2.0",
            "note": "Paraphrase/concept match. Works offline after first download; "
                    "hash fallback keeps search working without it.",
        },
        "caption": {
            "name": config.CAPTION_MODEL,
            "library": "transformers+torch" if (transformers_ok and torch_ok) else "missing (captions skipped)",
            "ready": bool(transformers_ok and torch_ok),
            "size": "~0.9-1GB fp32",
            "license": "BSD-3-Clause",
            "note": "Ingest-time only. Never required for search.",
        },
        "ocr": {
            "name": "rapidocr-onnxruntime (+ pytesseract fallback)",
            "library": "rapidocr_onnxruntime" if rapidocr_ok else (
                "pytesseract" if tesseract_ok else "missing (OCR skipped)"),
            "ready": bool(rapidocr_ok or tesseract_ok),
            "size": "~30MB ONNX",
            "license": "Apache-2.0",
            "note": "Screenshot/PDF text extraction at ingest.",
        },
        "vector_index": {
            "name": "faiss-cpu IndexIDMap2(IndexFlatIP)",
            "ready": bool(faiss_ok),
            "fallback": "numpy brute-force" if not faiss_ok else None,
            "size": "~5-19MB wheel",
            "license": "MIT",
        },
        "lexical": {
            "name": "SQLite FTS5 bm25()",
            "ready": True,
            "sqlite_version": sqlite_v,
            "license": "Public domain",
        },
        "imaging": {
            "name": "Pillow",
            "ready": bool(pillow_ok),
            "version": pillow_v,
            "license": "HPND",
        },
    }
