import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select, SelectItem } from "@/components/base/select/select";
import { api } from "../api.js";
import { MemoryCard } from "../components/MemoryCard.jsx";

const TYPE_OPTIONS = ["", "image", "webpage", "pdf", "text", "markdown", "file"];
const DATE_OPTIONS = [
  { id: "any", label: "Any time" },
  { id: "week", label: "Past week" },
  { id: "month", label: "Past month" },
  { id: "year", label: "Past year" },
];

export function SearchPage({ onOpen }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [source, setSource] = useState("");
  const [date, setDate] = useState("any");
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const timer = useRef(null);

  async function run(query, t, s, d) {
    setError("");
    try {
      const day = 86400;
      const now = Date.now() / 1000;
      const date_from =
        d === "week" ? Math.floor(now - 7 * day)
        : d === "month" ? Math.floor(now - 30 * day)
        : d === "year" ? Math.floor(now - 365 * day)
        : 0;
      const data = await api("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 24, type: t, source: s, date_from }),
      });
      setItems(data.results || []);
    } catch (e) {
      setError(String(e.message || e));
      setItems([]);
    }
  }

  useEffect(() => {
    run("", "", "", "any");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function debounced(v) {
    setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => run(v, type, source, date), 280);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-4lg border border-border-card-default bg-background-primary-default p-5 shadow-xs">
        <Input
          aria-label="Search your memory"
          placeholder="Search your memory…  e.g. github dns error · article about FAISS · images from last week"
          value={q}
          onChange={debounced}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Select
            aria-label="Type filter"
            selectedKey={type}
            onSelectionChange={(k) => { setType(k); run(q, k, source, date); }}
          >
            {TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} id={t} textValue={t || "All types"}>
                {t || "All types"}
              </SelectItem>
            ))}
          </Select>
          <div className="min-w-44 flex-1">
            <Input
              aria-label="Source filter"
              placeholder="source · e.g. github.com"
              value={source}
              onChange={(v) => setSource(v)}
            />
          </div>
          <Select
            aria-label="Date filter"
            selectedKey={date}
            onSelectionChange={(k) => { setDate(k); run(q, type, source, k); }}
          >
            {DATE_OPTIONS.map((d) => (
              <SelectItem key={d.id} id={d.id} textValue={d.label}>
                {d.label}
              </SelectItem>
            ))}
          </Select>
          <Button variant="primary" onClick={() => run(q, type, source, date)}>
            Search
          </Button>
        </div>
        <p className="mt-2 text-caption-regular text-text-tertiary">
          Natural filters work too: from github · images · pdfs · last week
        </p>
      </div>

      {error && (
        <div className="rounded-3lg border border-border-card-default bg-background-primary-default p-4 text-body-regular text-text-secondary">
          Search failed: {error}
        </div>
      )}
      {items && items.length > 0 && (
        <p className="text-caption-regular text-text-tertiary">
          {items.length} result{items.length > 1 ? "s" : ""}
        </p>
      )}
      {items && items.length === 0 && !error && (
        <div className="rounded-3lg border border-dashed border-border-card-default bg-background-primary-default p-8 text-center">
          <p className="text-headline-medium text-text-primary">Nothing here yet</p>
          <p className="text-body-regular text-text-secondary">
            Upload files in the Upload tab, then search by keyword, concept, source, or date.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(items || []).map((m) => (
          <MemoryCard key={m.id} m={m} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
