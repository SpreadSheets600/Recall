import math
import time

import numpy as np

from . import config, db
from . import embeddings, textutil, vectors


def normalize_scores(scores: list):
    if not scores:
        return []
    lo = min(s for _, s in scores)
    hi = max(s for _, s in scores)
    if hi - lo < 1e-9:
        return [(i, 1.0) for i, _ in scores]
    return [(i, (s - lo) / (hi - lo)) for i, s in scores]


def rrf_fuse(rank_lists: list, k: int = 60):
    fused = {}
    for ranks in rank_lists:
        for rank, mid in enumerate(ranks, start=1):
            fused[mid] = fused.get(mid, 0.0) + 1.0 / (k + rank)
    return sorted(fused.items(), key=lambda x: -x[1])


def search_memories(
    db_path,
    query,
    limit=20,
    type_filter=None,
    domain_filter=None,
    date_from=None,
    date_to=None,
    website_type_filter=None,
    min_dwell=None,
):
    cleaned, parsed = textutil.parse_query_filters(query or "")
    type_hint = parsed.get("type")
    explicit_type = type_filter or None
    if domain_filter:
        parsed["domain"] = domain_filter
    if date_from:
        parsed["date_from"] = date_from
    if date_to:
        parsed["date_to"] = date_to

    conn = db.connect(db_path)
    try:
        where = []
        args = []
        if explicit_type:
            where.append("m.type=?")
            args.append(explicit_type)
        if parsed.get("domain"):
            where.append("m.domain LIKE ?")
            args.append("%" + parsed["domain"] + "%")
        if website_type_filter:
            where.append("m.website_type=?")
            args.append(website_type_filter)
        if min_dwell and int(min_dwell) > 0:
            where.append("COALESCE(m.dwell_time, 0)>=?")
            args.append(int(min_dwell))
        if parsed.get("date_from"):
            where.append("(m.created_at>=? OR m.captured_at>=?)")
            args += [parsed["date_from"], parsed["date_from"]]
        if parsed.get("date_to"):
            where.append("(m.created_at<=? OR m.captured_at<=?)")
            args += [parsed["date_to"], parsed["date_to"]]
        where_sql = ("WHERE " + " AND ".join(where)) if where else ""

        bm25_ranked = []
        if cleaned.strip():
            fts_q = textutil.escape_fts(cleaned)
            try:
                if fts_q:
                    sql = (
                        "SELECT m.id, bm25(memories_fts) AS rank "
                        "FROM memories_fts JOIN memories m ON m.id=memories_fts.rowid "
                        "WHERE memories_fts MATCH ? "
                    )
                    fargs = [fts_q]
                    if where:
                        sql += " AND " + " AND ".join(
                            w.replace("m.", "m.") for w in where
                        )
                        fargs += args
                    sql += " ORDER BY rank LIMIT ?"
                    fargs.append(config.CANDIDATE_K)
                    rows = conn.execute(sql, fargs).fetchall()
                    bm25_ranked = [(r["id"], -float(r["rank"])) for r in rows]
            except Exception:
                bm25_ranked = []

        qvec = embeddings.embed_query(
            cleaned if cleaned.strip() else (query or ""),
            dim=config.EMBED_DIM,
        )
        dense_all = vectors.get_index(config.EMBED_DIM).search(
            qvec, k=config.CANDIDATE_K
        )
        if where:
            allowed = {
                r["id"]
                for r in conn.execute(
                    "SELECT m.id FROM memories m %s" % where_sql, args
                ).fetchall()
            }
            dense_all = [(i, s) for i, s in dense_all if i in allowed]

        bm25_ids = [i for i, _ in sorted(bm25_ranked, key=lambda x: -x[1])]
        dense_ids = [i for i, _ in dense_all]
        if not bm25_ids and not dense_ids:
            rows = conn.execute(
                "SELECT m.* FROM memories m %s ORDER BY m.created_at DESC LIMIT ?"
                % where_sql,
                args + [limit],
            ).fetchall()
            return [
                attach_match(db.row_to_memory(r), 0.0, ["recent"])
                for r in rows
            ]

        fused = rrf_fuse([bm25_ids, dense_ids], k=config.RRF_K)
        bm25_pos = {mid: r for r, mid in enumerate(bm25_ids, start=1)}
        dense_pos = {mid: r for r, mid in enumerate(dense_ids, start=1)}

        now = int(time.time())
        scored = []
        for mid, fscore in fused[: max(limit * 3, limit)]:
            row = conn.execute("SELECT * FROM memories WHERE id=?", (mid,)).fetchone()
            if row is None:
                continue
            mem = db.row_to_memory(row)
            reasons = []
            boost = 0.0
            if mid in bm25_pos:
                reasons.append("keyword")
            if mid in dense_pos:
                reasons.append("semantic")
            if explicit_type and mem.get("type") == explicit_type:
                reasons.append("type")
                boost += 0.05
            elif type_hint and mem.get("type") == type_hint:
                reasons.append("type")
                boost += 0.10

            # Website type ranking boost
            wtype = (mem.get("website_type") or "").lower()
            if website_type_filter and wtype == website_type_filter.lower():
                reasons.append("website-type")
                boost += 0.10
            elif wtype in ("docs", "code"):
                boost += 0.08
                reasons.append("docs")
            elif wtype in ("academic", "research"):
                boost += 0.08
                reasons.append("academic")
            elif wtype in ("article", "blog"):
                boost += 0.06
                reasons.append("article")
            elif wtype in ("media", "video"):
                boost += 0.03

            # Dwell time engagement boost: more time spent = higher value/importance
            dwell = int(mem.get("dwell_time") or 0)
            if dwell > 0:
                dwell_boost = min(0.18, math.log1p(dwell / 20.0) * 0.045)
                boost += dwell_boost
                if dwell >= 60:
                    reasons.append(f"{dwell // 60}m-read")
                elif dwell >= 15:
                    reasons.append(f"{dwell}s-read")

            if parsed.get("domain") and parsed["domain"] in (mem.get("domain") or ""):
                reasons.append("source")
                boost += 0.10

            age_days = max(0, (now - (mem.get("created_at") or now)) / 86400.0)
            recency = math.exp(-age_days * math.log(2) / max(1, config.RECENCY_HALF_LIFE_DAYS))
            boost += 0.05 * recency

            ql = (cleaned or "").lower()
            if ql and ql in (mem.get("content") or "").lower()[:20000]:
                boost += 0.10
                reasons.append("exact")

            if not reasons:
                reasons = ["related"]
            scored.append((mem, fscore + boost, reasons))

        scored.sort(key=lambda x: -x[1])
        return [attach_match(m, s, r) for m, s, r in scored[:limit]]
    finally:
        conn.close()


def attach_match(mem, score, reasons):
    out = db.public_memory(mem)
    out["score"] = round(float(score), 4)
    out["match"] = reasons
    return out
