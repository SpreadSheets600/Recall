const $ = (s) => document.querySelector(s);
const resultsEl = $("#results");
const emptyEl = $("#empty");
const qEl = $("#q");
let activeType = "";

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function cardHTML(m) {
  const badges = [
    m.type ? `<span class="badge">${m.type}</span>` : "",
    m.domain ? `<span class="badge">${m.domain}</span>` : "",
    ...(m.match || []).map((x) => `<span class="badge">${x}</span>`),
  ].join("");
  const date = m.created_at ? new Date(m.created_at * 1000).toLocaleDateString() : "";
  const snippet = (m.description || m.content || "").slice(0, 280);
  return `<article class="card" data-id="${m.id}" tabindex="0" role="button" aria-label="${(m.title || "").replace(/"/g, "")}">
    <h3>${m.title || "(untitled)"}</h3>
    <div>${badges}</div>
    <p>${snippet.replace(/</g, "&lt;")}</p>
    <div class="meta">${m.source || ""} · ${date} · score ${m.score ?? ""}</div>
  </article>`;
}

async function runSearch() {
  const query = qEl.value.trim();
  resultsEl.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
  emptyEl.style.display = "none";
  try {
    const body = {
      query,
      limit: 24,
      type: $("#f-type").value || activeType,
      source: $("#f-source").value.trim(),
    };
    const data = await api("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const items = data.results || [];
    if (!items.length) {
      resultsEl.innerHTML = "";
      emptyEl.style.display = "";
      return;
    }
    resultsEl.className = items[0] && items[0].type === "image" ? "grid" : "grid list";
    resultsEl.innerHTML = items.map(cardHTML).join("");
    resultsEl.querySelectorAll(".card").forEach((el) => {
      el.addEventListener("click", () => openDetail(el.dataset.id));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") openDetail(el.dataset.id);
      });
    });
  } catch (e) {
    resultsEl.innerHTML = `<div class="card"><p>Search failed: ${String(e).slice(0, 300)}</p></div>`;
  }
}

async function openDetail(id) {
  try {
    const m = await api(`/api/memories/${id}`);
    const related = (m.related || []).map((r) => `<li>${r.title} <span class="badge">${r.score}</span></li>`).join("");
    $("#detail-body").innerHTML = `
      <h2>${m.title || "(untitled)"}</h2>
      <p>${(m.description || "").replace(/</g, "&lt;")}</p>
      <p>${(m.content || "").slice(0, 2000).replace(/</g, "&lt;")}</p>
      ${m.ocr_text ? `<h3>OCR</h3><p>${m.ocr_text.slice(0, 1000).replace(/</g, "&lt;")}</p>` : ""}
      <div class="meta">type ${m.type} · source ${m.source || ""} · ${m.domain || ""} · ${m.path || ""}</div>
      ${related ? `<h3>Related</h3><ul>${related}</ul>` : ""}`;
    $("#detail").showModal();
  } catch (e) {
    alert("Could not load memory");
  }
}

async function loadStats() {
  try {
    const s = await api("/api/stats");
    $("#stats").textContent =
      `${s.total} memories\n` +
      Object.entries(s.by_type || {}).map(([k, v]) => `${v} ${k}`).join("\n") +
      `\n${s.vectors} vectors`;
  } catch (e) {
    $("#stats").textContent = "stats unavailable";
  }
}

function initTheme() {
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    document.documentElement.classList.add("dark");
  }
  $("#theme-btn").addEventListener("click", () => {
    document.documentElement.classList.toggle("dark");
  });
}

document.querySelectorAll(".nav-item").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((x) => x.classList.remove("is-active"));
    b.classList.add("is-active");
    activeType = b.dataset.filter;
    $("#f-type").value = activeType;
    runSearch();
  });
});

let t;
qEl.addEventListener("input", () => {
  clearTimeout(t);
  t = setTimeout(runSearch, 250);
});
$("#search-btn").addEventListener("click", runSearch);
qEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});

initTheme();
loadStats();
