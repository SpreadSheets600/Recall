_engine = None


def extract_ocr(path: str):
    global _engine
    try:
        if _engine is None:
            from rapidocr_onnxruntime import RapidOCR

            _engine = RapidOCR()
        result, _ = _engine(path)
        if not result:
            return ""
        texts = []
        for item in result:
            try:
                texts.append(str(item[1]))
            except Exception:
                continue
        return "\n".join(texts).strip()
    except Exception:
        pass
    try:
        import pytesseract
        from PIL import Image

        with Image.open(path) as img:
            return pytesseract.image_to_string(img).strip()
    except Exception:
        return ""
