import numpy as np


class VectorIndex:
    def __init__(self, dim: int = 384):
        self.dim = dim
        self._faiss = None
        self._index = None
        self._ids = []
        self._vecs = np.zeros((0, dim), dtype=np.float32)
        try:
            import faiss

            self._faiss = faiss
            base = faiss.IndexFlatIP(dim)
            self._index = faiss.IndexIDMap2(base)
        except Exception:
            self._faiss = None
            self._index = None

    def using_faiss(self):
        return self._index is not None

    def add(self, ids: list, vecs):
        import numpy as np

        vecs = np.asarray(vecs, dtype=np.float32)
        if vecs.size == 0:
            return
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        vecs = vecs / norms
        if self._index is not None:
            self._index.add_with_ids(vecs, np.asarray(ids, dtype=np.int64))
        self._ids.extend(list(ids))
        self._vecs = np.vstack([self._vecs, vecs]) if len(self._ids) > len(vecs) else vecs \
            if self._vecs.shape[0] == 0 else np.vstack([self._vecs, vecs])

    def search(self, query_vec, k: int = 50):
        import numpy as np

        q = np.asarray(query_vec, dtype=np.float32).reshape(1, -1)
        n = np.linalg.norm(q)
        if n > 0:
            q = q / n
        if self._index is not None and self._index.ntotal > 0:
            k = min(k, int(self._index.ntotal))
            scores, ids = self._index.search(q, k)
            return [(int(i), float(s)) for i, s in zip(ids[0], scores[0]) if int(i) != -1]
        if self._vecs.shape[0] == 0:
            return []
        sims = (self._vecs @ q[0])
        order = np.argsort(-sims)[:k]
        return [(int(self._ids[i]), float(sims[i])) for i in order]

    def rebuild(self, ids: list, vecs):
        import numpy as np

        self._ids = []
        self._vecs = np.zeros((0, self.dim), dtype=np.float32)
        if self._faiss is not None:
            base = self._faiss.IndexFlatIP(self.dim)
            self._index = self._faiss.IndexIDMap2(base)
        if ids:
            self.add(ids, np.asarray(vecs, dtype=np.float32))


_store = {}


def get_index(dim: int = 384):
    if dim not in _store:
        _store[dim] = VectorIndex(dim=dim)
    return _store[dim]


def reset_index(dim: int = 384):
    if dim in _store:
        del _store[dim]
