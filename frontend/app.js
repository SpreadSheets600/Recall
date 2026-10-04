const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtDate = (ts) => (ts ? new Date(ts * 1000).toLocaleString() : "—");
let currentDetailId = null;

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error((await r.text()).slice(0, 400));
  const ct = r.headers.get("content-type") || "";
  return ct.includes("json") ? r.json() : r.text();
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------- tabs ---------- */
$$(".nav-item").forEach((b) => {
  b.addEventListener("click", () => {
    $$(".nav-item").forEach((x) => {
      x.classList.remove("is-active");
      x.setAttribute("aria-selected", "false");
    });
    b.classList.add("is-active");
    b.setAttribute("aria-selected", "true");
    const tab = b.dataset.tab;
    ["search", "upload", "library", "models"].forEach((t) => {
      $("#tab-" + t).hidden = t !== tab;
    });
    if (tab === "library") loadLibrary();
    if (tab === "models") loadModels();
  });
});

/* ---------- theme ---------- */
(function initTheme() {
  try {
    const saved = localStorage.getItem("recall-theme");
    if (saved === "dark" || (!saved && matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.classList.add("dark");
    }
  } catch (e) { /* ignore */ }
  $("#theme-btn").addEventListener("click", () => {
    const dark = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("recall-theme", dark ? "dark" : "light"); } catch (e) { /* ignore */ }
  });
})();

/* ---------- search ---------- */
function cardHTML(m) {
  const badges = [
    m.type ? `<span class="badge">${esc(m.type)}</span>` : "",
    m.domain ? `<span class="badge">${esc(m.domain)}</span>` : "",
    ...(m.match || []).map((x) => `<span class="badge badge-accent">${esc(x)}</span>`),
  ].join("");
  const tags = (m.tags || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 5)
    .map((t) => `<span class="badge">#${esc(t)}</span>`).join("");
  const snippet = (m.description || m.content || "").slice(0, 240);
  const img = m.type === "image" ? `<img class="thumb" loading="lazy" src="/api/memories/${m.id}/file" alt="">` : "";
  return `<article class="card card-click" data-id="${m.id}" tabindex="0" role="button" aria-label="${esc(m.title || "untitled")}">
    ${img}
    <h3>${esc(m.title || "(untitled)")}</h3>
    <div>${badges}</div>
    <p class="muted">${esc(snippet)}${snippet.length >= 240 ? "…" : ""}</p>
    ${tags ? `<div>${tags}</div>` : ""}
    <div class="meta">${esc(m.source || "")} · ${fmtDate(m.created_at)}</div>
  </article>`;
}

function bindCards(root) {
  root.querySelectorAll(".card-click").forEach((el) => {
    el.addEventListener("click", () => openDetail(el.dataset.id));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(el.dataset.id); }
    });
  });
}

async function runSearch() {
  const q = $("#q").value.trim();
  const box = $("#results");
  $("#empty-search").style.display = "none";
  box.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
  try {
    let date_from = 0;
    const d = $("#f-date").value;
    const day = 86400, now = Date.now() / 1000;
    if (d === "week") date_from = Math.floor(now - 7 * day);
    if (d === "month") date_from = Math.floor(now - 30 * day);
    if (d === "year") date_from = Math.floor(now - 365 * day);
    const data = await api("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: q, limit: 24,
        type: $("#f-type").value, source: $("#f-source").value.trim(),
        date_from,
      }),
    });
    const items = data.results || [];
    $("#results-meta").textContent = items.length
      ? `${items.length} result${items.length > 1 ? "s" : ""} for “${q || "everything"}”`
      : "";
    if (!items.length) {
      box.innerHTML = "";
      $("#empty-search").style.display = "";
      return;
    }
    box.className = items.every((m) => m.type === "image") ? "grid" : "grid list";
    box.innerHTML = items.map(cardHTML).join("");
    bindCards(box);
  } catch (e) {
    box.innerHTML = `<div class="card"><p>Search failed: ${esc(String(e))}</p></div>`;
  }
}

let searchT;
$("#q").addEventListener("input", () => { clearTimeout(searchT); searchT = setTimeout(runSearch, 280); });
$("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });
$("#search-btn").addEventListener("click", runSearch);

/* ---------- upload ---------- */
const dz = $("#dropzone"), fi = $("#file-input");
dz.addEventListener("click", () => fi.click());
dz.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fi.click(); }
});
["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => {
  e.preventDefault(); dz.classList.add("drag");
}));
["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => {
  e.preventDefault(); dz.classList.remove("drag");
}));
dz.addEventListener("drop", (e) => {
  if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
});
fi.addEventListener("change", () => { if (fi.files.length) uploadFiles(fi.files); fi.value = ""; });
$("#upload-btn").addEventListener("click", () => {
  if (fi.files.length) uploadFiles(fi.files);
  else { fi.click(); }
});

async function uploadFiles(fileList) {
  const q = $("#upload-queue");
  const files = [...fileList];
  for (const f of files) {
    const li = document.createElement("li");
    li.textContent = `${f.name} — uploading…`;
    q.prepend(li);
    try {
      const fd = new FormData();
      fd.append("files", f, f.name);
      fd.append("source", $("#up-source").value.trim());
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      if (!r.ok) throw new Error(await r.text());
      const body = await r.json();
      const res = (body.results || [])[0] || {};
      li.innerHTML = res.status === "indexed" || res.status === "skipped"
        ? `<span class="ok">●</span> ${esc(f.name)} — ${esc(res.status)} (id ${res.id ?? "?"})`
        : `<span class="fail">●</span> ${esc(f.name)} — failed`;
      toast(`${f.name}: ${res.status}`);
    } catch (e) {
      li.innerHTML = `<span class="fail">●</span> ${esc(f.name)} — ${esc(String(e).slice(0, 160))}`;
    }
  }
  loadStats();
}

$("#note-btn").addEventListener("click", async () => {
  const title = $("#note-title").value.trim(), content = $("#note-content").value.trim();
  if (!title && !content) { toast("Write a title or some content first"); return; }
  try {
    const m = await api("/api/memories", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "text", title, content }),
    });
    toast(`Saved note #${m.id}`);
    $("#note-title").value = ""; $("#note-content").value = "";
    loadStats();
  } catch (e) { toast("Save failed: " + String(e).slice(0, 120)); }
});

/* ---------- library ---------- */
async function loadLibrary() {
  const box = $("#library");
  box.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
  try {
    const params = new URLSearchParams({
      type: $("#lib-type").value, q: $("#lib-q").value.trim(), limit: "60",
    });
    const items = await api("/api/memories?" + params);
    $("#lib-meta").textContent = `${items.length} memor${items.length === 1 ? "y" : "ies"}`;
    $("#empty-lib").hidden = items.length > 0;
    box.innerHTML = items.map(cardHTML).join("");
    bindCards(box);
  } catch (e) {
    box.innerHTML = `<div class="card"><p>Library failed to load: ${esc(String(e))}</p></div>`;
  }
}
$("#lib-btn").addEventListener("click", loadLibrary);
$("#lib-q").addEventListener("keydown", (e) => { if (e.key === "Enter") loadLibrary(); });

/* ---------- detail ---------- */
async function openDetail(id) {
  try {
    const m = await api(`/api/memories/${id}`);
    currentDetailId = m.id;
    const tags = (m.tags || "").split(",").map((t) => t.trim()).filter(Boolean)
      .map((t) => `<span class="badge">#${esc(t)}</span>`).join("") || "<span class='muted'>none yet</span>";
    const img = m.type === "image" ? `<img class="preview-img" src="/api/memories/${m.id}/file" alt="">` : "";
    let exif = {};
    try { exif = JSON.parse(m.exif_json || "{}"); } catch (e) { /* ignore */ }
    const exifRows = Object.entries(exif).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`).join("");
    const related = (m.related || []).map((r) =>
      `<li><a href="#" data-rel="${r.id}">${esc(r.title || "untitled")}</a> <span class="badge">${esc(String(r.score ?? ""))}</span></li>`).join("");
    $("#detail-body").innerHTML = `
      <h2>${esc(m.title || "(untitled)")}</h2>
      <div>${m.type ? `<span class="badge">${esc(m.type)}</span>` : ""}
        ${m.domain ? `<span class="badge">${esc(m.domain)}</span>` : ""}
        ${(m.match || []).map((x) => `<span class="badge badge-accent">${esc(x)}</span>`).join("")}</div>
      ${img}
      ${m.description ? `<h3>AI description</h3><div class="block">${esc(m.description)}</div>` : ""}
      <h3>Extracted content</h3>
      <div class="block">${esc((m.content || "").slice(0, 4000)) || "—"}</div>
      ${m.ocr_text ? `<h3>OCR text</h3><div class="block">${esc(m.ocr_text.slice(0, 2000))}</div>` : ""}
      <h3>Topics &amp; tags</h3><div>${tags}</div>
      <h3>Metadata</h3>
      <dl class="kv">
        <dt>source</dt><dd>${esc(m.source || "—")}</dd>
        <dt>file</dt><dd>${esc(m.path || "—")}</dd>
        <dt>size</dt><dd>${m.file_size ? (m.file_size / 1024).toFixed(1) + " KB" : "—"}</dd>
        ${m.width ? `<dt>dimensions</dt><dd>${m.width}×${m.height}</dd>` : ""}
        <dt>saved</dt><dd>${fmtDate(m.created_at)}</dd>
        <dt>status</dt><dd>${esc(m.status || "indexed")}</dd>
      </dl>
      ${exifRows ? `<h3>EXIF</h3><dl class="kv">${exifRows}</dl>` : ""}
      ${related ? `<h3>Related</h3><ul>${related}</ul>` : ""}`;
    $("#detail").showModal();
    $$("#detail-body [data-rel]").forEach((a) => {
      a.addEventListener("click", (e) => { e.preventDefault(); openDetail(a.dataset.rel); });
    });
  } catch (e) { toast("Could not load memory"); }
}

$("#detail-delete").addEventListener("click", async () => {
  if (currentDetailId == null) return;
  if (!confirm("Delete this memory?")) return;
  try {
    await api(`/api/memories/${currentDetailId}`, { method: "DELETE" });
    toast("Deleted");
    $("#detail").close();
    runSearch(); loadLibrary(); loadStats();
  } catch (e) { toast("Delete failed"); }
});

/* ---------- stats + models ---------- */
async function loadStats() {
  try {
    const s = await api("/api/stats");
    const rows = Object.entries(s.by_type || {}).map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b>${v}</b></div>`).join("");
    $("#stats").innerHTML = `<div class="row"><span>memories</span><b>${s.total}</b></div>${rows}
      <div class="row"><span>vectors</span><b>${s.vectors}</b></div>`;
    const pill = $("#model-pill");
    if (s.total > 0) { pill.textContent = `models: ready · ${s.vectors} vectors`; pill.className = "pill ok"; }
    else { pill.textContent = "models: ready · empty index"; pill.className = "pill"; }
  } catch (e) { $("#stats").textContent = "stats unavailable"; }
}

async function loadModels() {
  const box = $("#model-cards");
  box.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
  try {
    const [models, stats] = await Promise.all([api("/api/models"), api("/api/stats")]);
    const order = ["embed", "caption", "ocr", "vector_index", "lexical", "imaging"];
    const labels = { embed: "Text embeddings", caption: "Image captioning", ocr: "OCR",
      vector_index: "Vector index", lexical: "Lexical search", imaging: "Image I/O" };
    box.innerHTML = order.map((k) => {
      const m = models[k] || {};
      const dot = m.ready ? `<span class="badge badge-accent">ready</span>` : `<span class="badge">fallback</span>`;
      return `<div class="card"><h3>${labels[k] || k}</h3>
        <p><b>${esc(m.name || "")}</b></p><div>${dot}</div>
        <div class="meta">${esc(m.library || "")} · ${esc(m.size || "")} · ${esc(m.license || "")}</div>
        <p class="muted">${esc(m.note || m.fallback || "")}</p></div>`;
    }).join("");
    const kb = (stats.db_bytes / 1024).toFixed(1);
    $("#storage").textContent =
      `${stats.total} memories · ${stats.vectors} vectors · DB ${kb} KB · ${stats.uploads ?? 0} uploaded files · SQLite ${models.lexical?.sqlite_version ?? ""}`;
  } catch (e) {
    box.innerHTML = `<div class="card"><p>Models unavailable: ${esc(String(e))}</p></div>`;
  }
}

$("#rebuild-btn").addEventListener("click", async () => {
  try {
    const r = await api("/api/rebuild", { method: "POST" });
    toast(`Rebuilt ${r.rebuilt} vectors`);
    loadStats();
  } catch (e) { toast("Rebuild failed"); }
});

loadStats();
runSearch();
