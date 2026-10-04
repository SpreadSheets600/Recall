"""Hybrid search: BM25 (lexical) + dense vectors fused on scores, not ranks alone.

Pipeline per query:
  1. candidate retrieval -- FTS5 BM25 top-N  ||  FAISS/numpy cosine top-N
     (+ hard metadata filters applied to both legs)
  2. score fusion -- per-leg min-max normalized scores weighted by the
     configured ``W_BM25`` / ``W_DENSE`` knobs, mixed with a normalized
     RRF term for rank robustness::
         relevance = 0.7 * (w_bm25 * n_bm25 + w_dense * n_dense)
                   + 0.3 * n_rrf
  3. relevance bonuses -- every large bonus is *query-dependent*
     (term coverage, title/filename/tag hits, phrase match). Query-independent
     signals (dwell time, recency) are capped tiny tie-breakers so they can
     never outvote relevance.

This fixes the old ranking where unconditional ``website_type`` boosts
(+0.08 docs/code, +0.06 article/blog, ...) plus a dwell boost up to +0.18
dwarfed the RRF deltas (~0.002 between adjacent ranks), so long-dwell
websites systematically outranked files with far better lexical/semantic
matches.
"""

import math
import os
import time

from . import config, db
from . import embeddings, textutil, vectors

# Fusion mix: how much of the fused relevance comes from calibrated score
# weights vs. rank robustness. Scores carry magnitude info RRF throws away;
# RRF protects against badly calibrated legs (e.g. hash-fallback vectors).
_SCORE_MIX = 0.7
_RRF_MIX = 0.3

# Bonus caps. Query-dependent (relevance) bonuses may be large; anything
# query-independent stays <= ~0.05 combined so it only breaks near-ties.
_COVERAGE_W = 0.25   # fraction of query terms matched anywhere
_TITLE_W = 0.20      # fraction of query terms matched in title
_FILETAG_W = 0.08    # any query term in filename or tags
_PHRASE_TITLE_W = 0.12
_PHRASE_CONTENT_W = 0.05
_TYPE_HINT_W = 0.05
_TYPE_EXPLICIT_W = 0.03
_DOMAIN_W = 0.08
_WEBSITE_TYPE_FILTER_W = 0.10
_DWELL_MAX = 0.03
_RECENCY_MAX = 0.02


def normalize_scores(scores: list):
    """Min-max normalize ``[(id, raw)]`` to ``[(id, 0..1)]``.

    A leg where every candidate scores identically carries no information;
    map it to a constant so it cannot reorder results on its own.
    """
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


def _norm_map(pairs: list):
    return dict(normalize_scores(pairs))


def _fusion_weights():
    try:
        wb = float(config.W_BM25)
    except (TypeError, ValueError):
        wb = 0.4
    try:
        wd = float(config.W_DENSE)
    except (TypeError, ValueError):
        wd = 0.6
    tot = wb + wd
    if tot <= 0:
        return 0.5, 0.5
    return wb / tot, wd / tot


def _content_sample(mem, limit=8000):
    return (mem.get("content") or "")[:limit]


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

        cand_k = max(config.CANDIDATE_K, min(max(limit, 1) * 3, 200))

        # ---- leg 1: lexical (BM25). OR recall; precision is restored by
        # the coverage/title bonuses at rerank time so AND-like matches win.
        bm25_ranked = []  # [(id, better-is-higher)]
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
                    fargs.append(cand_k)
                    rows = conn.execute(sql, fargs).fetchall()
                    bm25_ranked = [(r["id"], -float(r["rank"])) for r in rows]
            except Exception:
                bm25_ranked = []

        # ---- leg 2: dense (cosine via normalized FAISS/numpy index)
        qvec = embeddings.embed_query(
            cleaned if cleaned.strip() else (query or ""),
            dim=config.EMBED_DIM,
        )
        dense_all = vectors.get_index(config.EMBED_DIM).search(qvec, k=cand_k)
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

        # ---- fusion on calibrated scores (not ranks alone)
        n_bm25 = _norm_map(bm25_ranked)
        n_dense = _norm_map(dense_all)
        rrf = rrf_fuse([bm25_ids, dense_ids], k=config.RRF_K)
        n_rrf = _norm_map(rrf)
        wb, wd = _fusion_weights()

        bm25_set = set(bm25_ids)
        dense_set = set(dense_ids)

        q_terms = textutil.content_tokens(cleaned or "")
        q_set = set(q_terms)
        n_q = len(q_set)
        ql = (cleaned or "").strip().lower()

        wtype_filter_lc = (website_type_filter or "").lower()
        domain_q = (parsed.get("domain") or "").lower()

        now = int(time.time())
        scored = []
        for mid in list(dict.fromkeys(bm25_ids + dense_ids))[: max(limit * 3, limit)]:
            row = conn.execute("SELECT * FROM memories WHERE id=?", (mid,)).fetchone()
            if row is None:
                continue
            mem = db.row_to_memory(row)
            reasons = []

            base = wb * n_bm25.get(mid, 0.0) + wd * n_dense.get(mid, 0.0)
            relevance = _SCORE_MIX * base + _RRF_MIX * n_rrf.get(mid, 0.0)
            boost = 0.0

            if mid in bm25_set:
                reasons.append("keyword")
            if mid in dense_set:
                reasons.append("semantic")

            # ---- query-dependent relevance bonuses (the ranking workhorses)
            if n_q:
                doc_toks = set(
                    textutil.tokenize(_content_sample(mem))
                )
                hits = len(q_set & doc_toks)
                if hits:
                    boost += _COVERAGE_W * (hits / n_q)
                    if hits == n_q and n_q >= 2:
                        reasons.append("all-terms")

                title_toks = set(textutil.tokenize(mem.get("title") or ""))
                title_hits = len(q_set & title_toks)
                if title_hits:
                    boost += _TITLE_W * (title_hits / n_q)
                    reasons.append("title")

                fname = os.path.basename(mem.get("path") or "").lower()
                tag_toks = set(textutil.tokenize(mem.get("tags") or ""))
                if q_set & tag_toks or (fname and any(t in fname for t in q_set)):
                    boost += _FILETAG_W
                    reasons.append("filename" if fname and any(t in fname for t in q_set) else "tag")

                if ql:
                    title_lc = (mem.get("title") or "").lower()
                    if ql in title_lc:
                        boost += _PHRASE_TITLE_W
                        reasons.append("exact")
                    elif ql in _content_sample(mem, 20000).lower():
                        boost += _PHRASE_CONTENT_W
                        reasons.append("exact")

            # ---- explicit/parsed filters: reward what was asked for, nothing else
            if explicit_type and mem.get("type") == explicit_type:
                reasons.append("type")
                boost += _TYPE_EXPLICIT_W
            elif type_hint and mem.get("type") == type_hint:
                reasons.append("type")
                boost += _TYPE_HINT_W

            wtype = (mem.get("website_type") or "").lower()
            if wtype_filter_lc and wtype == wtype_filter_lc:
                reasons.append("website-type")
                boost += _WEBSITE_TYPE_FILTER_W

            if domain_q and domain_q in (mem.get("domain") or ""):
                reasons.append("source")
                boost += _DOMAIN_W

            # ---- query-independent tie-breakers, deliberately tiny
            dwell = int(mem.get("dwell_time") or 0)
            if dwell > 0:
                boost += min(_DWELL_MAX, math.log1p(dwell / 30.0) * 0.008)
                if dwell >= 60:
                    reasons.append(f"{dwell // 60}m-read")
                elif dwell >= 15:
                    reasons.append(f"{dwell}s-read")

            age_days = max(0, (now - (mem.get("created_at") or now)) / 86400.0)
            recency = math.exp(-age_days * math.log(2) / max(1, config.RECENCY_HALF_LIFE_DAYS))
            boost += _RECENCY_MAX * recency

            if not reasons:
                reasons = ["related"]
            scored.append((mem, relevance + boost, reasons))

        scored.sort(key=lambda x: -x[1])
        return [attach_match(m, s, r) for m, s, r in scored[:limit]]
    finally:
        conn.close()


def attach_match(mem, score, reasons):
    out = db.public_memory(mem)
    out["score"] = round(float(score), 4)
    out["match"] = reasons
    return out
