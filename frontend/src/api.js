export async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error((await r.text()).slice(0, 400));
  const ct = r.headers.get("content-type") || "";
  return ct.includes("json") ? r.json() : r.text();
}

export const esc = (s) => String(s ?? "");
export const fmtDate = (ts) => (ts ? new Date(ts * 1000).toLocaleString() : "—");
export const fmtKB = (b) => {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

export function fmtRelativeDate(ts) {
  if (!ts) return "—";
  const diffSec = Math.floor(Date.now() / 1000 - ts);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function tagList(tags) {
  return String(tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function fetchStats() {
  return api("/api/stats");
}

export async function fetchSettings() {
  return api("/api/settings");
}

export async function updateSettings(settings) {
  return api("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
}

export async function optimizeIndex() {
  return api("/api/tools/optimize", { method: "POST" });
}

export async function runBenchmark() {
  return api("/api/tools/benchmark", { method: "POST" });
}

export async function testEmbed(text) {
  return api("/api/tools/embed-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export async function exportMemories() {
  return api("/api/tools/export");
}

export async function importMemories(memories) {
  return api("/api/tools/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memories }),
  });
}

export async function patchMemory(id, data) {
  return api(`/api/memories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteMemory(id) {
  return api(`/api/memories/${id}`, {
    method: "DELETE",
  });
}

export async function batchDeleteMemories(ids) {
  return api("/api/memories/batch-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}
