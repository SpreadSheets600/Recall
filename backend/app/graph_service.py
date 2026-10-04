import collections
import re
from . import db

# Common stopwords to exclude from term nodes
STOPWORDS = {
    "about", "above", "after", "again", "against", "all", "and", "any", "are",
    "because", "been", "before", "being", "below", "between", "both", "but", "by",
    "can", "could", "did", "does", "doing", "down", "during", "each", "few", "for",
    "from", "further", "had", "has", "have", "having", "her", "here", "hers",
    "herself", "him", "himself", "his", "how", "into", "its", "itself", "just",
    "more", "most", "myself", "nor", "not", "now", "off", "once", "only", "other",
    "our", "ours", "ourselves", "out", "over", "own", "same", "she", "should",
    "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves",
    "then", "there", "these", "they", "this", "those", "through", "too", "under",
    "until", "very", "was", "were", "what", "when", "where", "which", "while",
    "who", "whom", "why", "will", "with", "would", "you", "your", "yours",
    "yourself", "yourselves", "http", "https", "com", "www", "html", "file",
    "page", "text", "like", "using", "also", "well", "make", "made",
}


def split_tags(raw: str) -> list[str]:
    if not raw:
        return []
    parts = re.split(r"[,;\s]+", raw)
    return [p.strip().lstrip("#").lower() for p in parts if len(p.strip().lstrip("#")) >= 2]


def extract_key_terms(text: str, max_terms: int = 8) -> list[str]:
    """Extract salient keywords/phrases from text."""
    if not text:
        return []
    words = re.findall(r"\b[a-zA-Z]{3,20}\b", text.lower())
    filtered = [w for w in words if w not in STOPWORDS and not w.isdigit()]
    counts = collections.Counter(filtered)
    return [word for word, _ in counts.most_common(max_terms)]


def build_knowledge_graph(db_path: str, min_term_count: int = 1, max_nodes: int = 150):
    """
    Builds a spider-web style knowledge graph connecting:
    - Extracted keywords & topics (central web hubs)
    - Source domains and website types
    - Memories (anchored around relevant terms)
    - Co-occurrence links between terms that appear together
    """
    conn = db.connect(db_path)
    try:
        rows = conn.execute(
            """SELECT id, type, title, domain, tags, content, description,
                      ocr_text, website_type, dwell_time, created_at
               FROM memories ORDER BY created_at DESC LIMIT 100"""
        ).fetchall()
    finally:
        conn.close()

    memories = [dict(r) for r in rows]
    if not memories:
        return {"nodes": [], "links": [], "stats": {"nodes": 0, "links": 0, "terms": 0}}

    term_freq = collections.Counter()
    memory_terms = {}
    co_occurrences = collections.Counter()

    for m in memories:
        mid = m["id"]
        # Explicit tags from memory
        tags = split_tags(m.get("tags") or "")
        # Extra extracted keywords from title and content
        extracted = extract_key_terms(
            f"{m.get('title') or ''} {m.get('description') or ''} {m.get('ocr_text') or ''} {(m.get('content') or '')[:1000]}",
            max_terms=6,
        )
        combined_terms = list(dict.fromkeys([t.lower().strip() for t in (tags + extracted) if len(t.strip()) >= 3]))
        # Limit to top terms per memory
        combined_terms = combined_terms[:8]
        memory_terms[mid] = combined_terms

        for t in combined_terms:
            term_freq[t] += 1

        # Track co-occurrence between terms for spider web mesh
        for i in range(len(combined_terms)):
            for j in range(i + 1, len(combined_terms)):
                pair = tuple(sorted([combined_terms[i], combined_terms[j]]))
                co_occurrences[pair] += 1

    # Filter terms to most frequent
    valid_terms = {t for t, count in term_freq.most_common(50) if count >= min_term_count}

    nodes = []
    node_ids = set()

    # 1. Term nodes (central spider web anchors)
    for term in valid_terms:
        count = term_freq[term]
        node_id = f"term_{term}"
        nodes.append({
            "id": node_id,
            "label": term,
            "type": "term",
            "group": "term",
            "count": count,
            "size": min(24, 8 + count * 3),
        })
        node_ids.add(node_id)

    # 2. Memory nodes
    for m in memories:
        mid = m["id"]
        # Only add memory if it connects to at least one valid term or domain
        m_terms = [t for t in memory_terms.get(mid, []) if t in valid_terms]
        if not m_terms and len(nodes) > 40:
            continue

        node_id = f"mem_{mid}"
        title = m.get("title") or f"Memory #{mid}"
        short_title = title if len(title) <= 28 else title[:25] + "…"
        nodes.append({
            "id": node_id,
            "label": short_title,
            "full_title": title,
            "memory_id": mid,
            "type": "memory",
            "group": m.get("type") or "text",
            "website_type": m.get("website_type") or "",
            "domain": m.get("domain") or "",
            "dwell_time": m.get("dwell_time") or 0,
            "size": 7,
        })
        node_ids.add(node_id)

    links = []
    link_set = set()

    # 3. Links between memories and terms
    for m in memories:
        mem_id = f"mem_{m['id']}"
        if mem_id not in node_ids:
            continue
        for t in memory_terms.get(m["id"], []):
            term_id = f"term_{t}"
            if term_id in node_ids:
                link_key = (mem_id, term_id)
                if link_key not in link_set:
                    link_set.add(link_key)
                    links.append({
                        "source": mem_id,
                        "target": term_id,
                        "value": 1,
                        "type": "tag",
                    })

    # 4. Spider web cross-links: term-to-term co-occurrence
    for (t1, t2), count in co_occurrences.most_common(60):
        id1 = f"term_{t1}"
        id2 = f"term_{t2}"
        if id1 in node_ids and id2 in node_ids:
            link_key = tuple(sorted([id1, id2]))
            if link_key not in link_set:
                link_set.add(link_key)
                links.append({
                    "source": id1,
                    "target": id2,
                    "value": min(5, 1 + count),
                    "type": "cooccurrence",
                })

    return {
        "nodes": nodes,
        "links": links,
        "stats": {
            "total_nodes": len(nodes),
            "total_links": len(links),
            "terms_count": len(valid_terms),
            "memories_count": sum(1 for n in nodes if n["type"] == "memory"),
        },
    }
