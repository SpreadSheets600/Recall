import hashlib
import json
import os
import re
import time
import urllib.parse

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".tif"}
PDF_EXTS = {".pdf"}
TEXT_EXTS = {".txt", ".md", ".markdown", ".html", ".htm"}

STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
    "about", "is", "are", "was", "were", "i", "my", "me", "that", "this",
    "it", "from", "last", "week", "month", "be", "as", "at", "by", "an",
    "you", "your", "we", "they", "he", "she", "has", "have", "had", "will",
    "would", "can", "could", "should", "there", "their", "what", "when",
    "where", "which", "how", "all", "also", "into", "more", "than", "then",
    "them", "these", "those", "such", "only", "over", "under", "between",
    "image", "screenshot", "photo", "picture", "file",
}

TOPIC_STOP = STOPWORDS | {
    "using", "used", "one", "two", "new", "like", "just", "get", "got",
    "much", "many", "well", "even", "every", "without", "within",
}


def extract_topics(text: str, limit: int = 8):
    from collections import Counter

    toks = [t for t in tokenize(text or "") if t not in TOPIC_STOP and len(t) >= 3]
    if not toks:
        return []
    counts = Counter(toks)
    # Prefer longer, content-bearing tokens; break ties alphabetically.
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], -len(kv[0]), kv[0]))
    return [w for w, _ in ranked[:limit]]


def tags_for(title="", content="", description="", ocr_text="", existing=""):
    if existing and existing.strip():
        return existing.strip()
    joined = " ".join(x for x in (title, description, content, ocr_text) if x)
    topics = extract_topics(joined)
    return ", ".join(topics)


def sha256_bytes(data: bytes):
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str):
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


def detect_type(path: str, explicit: str = ""):
    if explicit:
        return explicit
    ext = os.path.splitext(path or "")[1].lower()
    if ext in IMAGE_EXTS:
        return "image"
    if ext in PDF_EXTS:
        return "pdf"
    if ext in TEXT_EXTS:
        name = os.path.basename(path or "").lower()
        if ext in (".html", ".htm"):
            return "webpage"
        return "markdown" if ext in (".md", ".markdown") else "text"
    return "file"


def domain_of(source: str):
    if not source:
        return ""
    s = source.strip()
    if "://" not in s and "." in s and " " not in s:
        s = "http://" + s
    try:
        netloc = urllib.parse.urlparse(s).netloc or ""
        return netloc.lower().replace("www.", "")
    except Exception:
        return ""


def tokenize(text: str):
    return re.findall(r"[a-z0-9]+", (text or "").lower())


def content_tokens(text: str):
    return [t for t in tokenize(text) if t not in STOPWORDS]


def escape_fts(text: str):
    toks = content_tokens(text)
    if not toks:
        return None
    quoted = ['"%s"' % t for t in toks]
    return " OR ".join(quoted)


def build_searchable_text(title="", content="", description="", ocr_text="",
                           tags="", filename="", source=""):
    parts = []
    for p in (title, description, content, ocr_text, tags, filename, source):
        if p:
            parts.append(str(p))
    seen = set()
    out = []
    for part in parts:
        for tok in part.split():
            key = tok.lower()
            if key not in seen:
                seen.add(key)
            out.append(tok)
    return " ".join(out)


def parse_query_filters(query: str):
    q = query or ""
    ql = q.lower()
    filters = {"type": None, "domain": None, "date_from": None, "date_to": None}
    cleaned = q

    m = re.search(r"from\s+([a-z0-9.\-]+\.[a-z]{2,})", ql)
    if m:
        filters["domain"] = m.group(1)
        cleaned = re.sub(r"from\s+[a-z0-9.\-]+\.[a-z]{2,}", " ", cleaned,
                         flags=re.IGNORECASE)
    else:
        m2 = re.search(r"from\s+([a-z0-9][a-z0-9\-]+)", ql)
        if m2:
            filters["domain"] = m2.group(1)
            cleaned = re.sub(r"from\s+[a-z0-9][a-z0-9\-]+", " ", cleaned,
                             flags=re.IGNORECASE, count=1)

    if re.search(r"\b(images?|photos?|screenshots?|pictures?)\b", ql):
        filters["type"] = "image"
    elif re.search(r"\bpdfs?\b", ql):
        filters["type"] = "pdf"
    elif re.search(r"\b(articles?|webpages?|web|posts?)\b", ql):
        filters["type"] = "webpage"

    now = int(time.time())
    day = 86400
    if "last week" in ql:
        filters["date_from"] = now - 7 * day
        cleaned = cleaned.lower().replace("last week", " ")
    elif "this week" in ql:
        filters["date_from"] = now - 7 * day
        cleaned = cleaned.lower().replace("this week", " ")
    elif "last month" in ql:
        filters["date_from"] = now - 30 * day
        cleaned = cleaned.lower().replace("last month", " ")
    elif "this month" in ql:
        import datetime
        today = datetime.date.today()
        start = datetime.date(today.year, today.month, 1)
        filters["date_from"] = int(time.mktime(start.timetuple()))
        cleaned = cleaned.lower().replace("this month", " ")

    m = re.search(r"\b(19|20)\d{2}\b", ql)
    if m and filters["date_from"] is None:
        import datetime
        year = int(m.group(0))
        start = datetime.date(year, 1, 1)
        end = datetime.date(year + 1, 1, 1)
        filters["date_from"] = int(time.mktime(start.timetuple()))
        filters["date_to"] = int(time.mktime(end.timetuple()))

    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.")
    return cleaned, filters
