export async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error((await r.text()).slice(0, 400));
  const ct = r.headers.get("content-type") || "";
  return ct.includes("json") ? r.json() : r.text();
}

export const esc = (s) => String(s ?? "");
export const fmtDate = (ts) => (ts ? new Date(ts * 1000).toLocaleString() : "—");
export const fmtKB = (b) =>
  b == null ? "—" : b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;

export function tagList(tags) {
  return String(tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
