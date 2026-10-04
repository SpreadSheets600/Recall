import { useEffect, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select, SelectItem } from "@/components/base/select/select";
import { PageHeader } from "../components/PageHeader.jsx";
import { api } from "../api.js";
import { MemoryCard } from "../components/MemoryCard.jsx";

const TYPE_OPTIONS = [
  { id: "", label: "All content types" },
  { id: "image", label: "Images" },
  { id: "webpage", label: "Web pages" },
  { id: "pdf", label: "PDFs" },
  { id: "text", label: "Notes & Text" },
  { id: "markdown", label: "Markdown" },
  { id: "file", label: "Files" },
];

const WEBSITE_TYPE_OPTIONS = [
  { id: "", label: "Any website category" },
  { id: "article", label: "Article / Blog" },
  { id: "docs", label: "Docs / Code" },
  { id: "social", label: "Social / Forum" },
  { id: "academic", label: "Academic / Research" },
  { id: "media", label: "Video / Media" },
  { id: "ecommerce", label: "E-Commerce" },
  { id: "general", label: "General Web" },
];

const DWELL_OPTIONS = [
  { id: "0", label: "Any time spent" },
  { id: "10", label: "> 10s spent" },
  { id: "30", label: "> 30s read" },
  { id: "120", label: "> 2m read" },
  { id: "300", label: "> 5m deep dive" },
];

const DATE_OPTIONS = [
  { id: "any", label: "Any time period" },
  { id: "week", label: "Past week" },
  { id: "month", label: "Past month" },
  { id: "year", label: "Past year" },
];

export function SearchPage({ onOpen, initialQuery = "", lastDeletedId = null }) {
  const [q, setQ] = useState(initialQuery);
  const [type, setType] = useState("");
  const [websiteType, setWebsiteType] = useState("");
  const [minDwell, setMinDwell] = useState("0");
  const [source, setSource] = useState("");
  const [date, setDate] = useState("any");
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const timer = useRef(null);

  // Immediately remove deleted memory from search view if deleted anywhere
  useEffect(() => {
    if (lastDeletedId != null) {
      setItems((prev) => (prev ? prev.filter((m) => m.id !== lastDeletedId) : prev));
    }
  }, [lastDeletedId]);

  async function run(query, t, s, d, wt, md) {
    setError("");
    setSearching(true);
    try {
      const day = 86400;
      const now = Date.now() / 1000;
      const date_from =
        d === "week"
          ? Math.floor(now - 7 * day)
          : d === "month"
          ? Math.floor(now - 30 * day)
          : d === "year"
          ? Math.floor(now - 365 * day)
          : 0;
      const data = await api("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          limit: 30,
          type: t,
          source: s,
          date_from,
          website_type: wt || undefined,
          min_dwell: parseInt(md || "0", 10) || 0,
        }),
      });
      setItems(data.results || []);
    } catch (e) {
      setError(String(e.message || e));
      setItems([]);
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    run(initialQuery || "", type, source, date, websiteType, minDwell);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  function debounced(v) {
    setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => run(v, type, source, date, websiteType, minDwell), 250);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Unified Bento Header (No matches pills) */}
      <PageHeader
        title="Search Studio"
        subtitle="Hybrid dense vector embeddings and BM25 lexical search with real-time dwell filters."
        actions={
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={RefreshCw}
            onClick={() => run(q, type, source, date, websiteType, minDwell)}
            disabled={searching}
          >
            Refresh
          </Button>
        }
      />

      {/* Bento Search & Filter Card */}
      <div className="rounded-3xl border border-border-button-default bg-background-primary-default p-5 shadow-xs flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Input
            aria-label="Search memories"
            placeholder="Search keywords, concepts, questions, or exact text…"
            value={q}
            onChange={debounced}
            leadingIcon={Search}
            className="flex-1"
          />
          <Button
            variant="primary"
            size="md"
            onClick={() => run(q, type, source, date, websiteType, minDwell)}
            disabled={searching}
          >
            {searching ? "Searching…" : "Search"}
          </Button>
        </div>

        {/* Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-border-button-default/60">
          <div>
            <Select
              aria-label="Type filter"
              selectedKey={type}
              onSelectionChange={(k) => {
                setType(k);
                run(q, k, source, date, websiteType, minDwell);
              }}
            >
              {TYPE_OPTIONS.map((t) => (
                <SelectItem key={t.id} id={t.id} textValue={t.label}>
                  {t.label}
                </SelectItem>
              ))}
            </Select>
          </div>

          <div>
            <Select
              aria-label="Website type filter"
              selectedKey={websiteType}
              onSelectionChange={(k) => {
                setWebsiteType(k);
                run(q, type, source, date, k, minDwell);
              }}
            >
              {WEBSITE_TYPE_OPTIONS.map((w) => (
                <SelectItem key={w.id} id={w.id} textValue={w.label}>
                  {w.label}
                </SelectItem>
              ))}
            </Select>
          </div>

          <div>
            <Select
              aria-label="Dwell filter"
              selectedKey={minDwell}
              onSelectionChange={(k) => {
                setMinDwell(k);
                run(q, type, source, date, websiteType, k);
              }}
            >
              {DWELL_OPTIONS.map((d) => (
                <SelectItem key={d.id} id={d.id} textValue={d.label}>
                  {d.label}
                </SelectItem>
              ))}
            </Select>
          </div>

          <div>
            <Select
              aria-label="Date filter"
              selectedKey={date}
              onSelectionChange={(k) => {
                setDate(k);
                run(q, type, source, k, websiteType, minDwell);
              }}
            >
              {DATE_OPTIONS.map((d) => (
                <SelectItem key={d.id} id={d.id} textValue={d.label}>
                  {d.label}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-body-small text-red-500">
          Search error: {error}
        </div>
      )}

      {/* Search Results */}
      <div>
        {items === null ? (
          <div className="rounded-2xl border border-dashed border-border-button-default p-12 text-center text-body-medium text-text-tertiary">
            Type a query or choose a filter to search across your local knowledge base.
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-button-default p-12 text-center">
            <p className="text-body-medium text-text-secondary">
              No matching memories found.
            </p>
            <p className="text-caption-regular text-text-tertiary mt-1">
              Try adjusting your query keywords or clearing filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((m) => (
              <MemoryCard key={m.id} item={m} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
