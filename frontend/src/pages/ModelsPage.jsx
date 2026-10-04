import { useEffect, useState } from "react";
import {
  Activity,
  Binary,
  CheckCircle2,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  Layers,
  RotateCw,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/base/badges/badge";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { PageHeader } from "../components/PageHeader.jsx";
import {
  api,
  fmtKB,
  optimizeIndex,
  runBenchmark,
  testEmbed,
} from "../api.js";

const LABELS = {
  embed: "Vector Embeddings",
  caption: "Image Captioning",
  ocr: "Optical Character Recognition",
  vector_index: "Dense Vector Index",
  lexical: "Lexical Search Engine",
  imaging: "Image Processing Engine",
};

export function ModelsPage({ onToast }) {
  const [models, setModels] = useState(null);
  const [stats, setStats] = useState(null);
  const [benchmarking, setBenchmarking] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState(null);
  const [optimizing, setOptimizing] = useState(false);

  // Embedding Playground state
  const [embedQuery, setEmbedQuery] = useState("Local-first neural memory with hybrid search");
  const [embedResult, setEmbedResult] = useState(null);
  const [embeddingLoading, setEmbeddingLoading] = useState(false);

  async function load() {
    try {
      const [m, s] = await Promise.all([api("/api/models"), api("/api/stats")]);
      setModels(m);
      setStats(s);
    } catch {
      onToast("Failed to load models");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function rebuild() {
    try {
      const r = await api("/api/rebuild", { method: "POST" });
      onToast(`Rebuilt ${r.rebuilt} vectors`);
      load();
    } catch {
      onToast("Rebuild failed");
    }
  }

  async function handleOptimize() {
    setOptimizing(true);
    try {
      const res = await optimizeIndex();
      onToast(`Optimized database (${res.reclaimed_bytes} B freed)`);
      load();
    } catch {
      onToast("Optimize failed");
    } finally {
      setOptimizing(false);
    }
  }

  async function handleBenchmark() {
    setBenchmarking(true);
    try {
      const res = await runBenchmark();
      setBenchmarkResult(res);
      onToast("Benchmark finished");
    } catch {
      onToast("Benchmark failed");
    } finally {
      setBenchmarking(false);
    }
  }

  async function handleTestEmbed(e) {
    e?.preventDefault();
    if (!embedQuery.trim()) return;
    setEmbeddingLoading(true);
    try {
      const res = await testEmbed(embedQuery.trim());
      setEmbedResult(res);
      onToast(`Computed ${res.dim}-dim vector in ${res.latency_ms}ms`);
    } catch (err) {
      onToast("Embedding test failed: " + (err.message || err));
    } finally {
      setEmbeddingLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Unified Bento Header */}
      <PageHeader
        title="Models & AI"
        subtitle="On-device embedding models, OCR engines, vector search indices, and live playground."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={Gauge}
              onClick={handleBenchmark}
              disabled={benchmarking}
            >
              {benchmarking ? "Benchmarking…" : "Run Benchmark"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={Sparkles}
              onClick={handleOptimize}
              disabled={optimizing}
            >
              {optimizing ? "Optimizing…" : "Optimize Index"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              leadingIcon={RotateCw}
              onClick={rebuild}
            >
              Rebuild Vectors
            </Button>
          </>
        }
      />

      {/* Bento Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border-button-default bg-background-primary-default p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-caption-1-semibold uppercase tracking-wider text-text-tertiary">
              Embedding Model
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-500/10 text-accent-500">
              <Binary className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-body-large font-bold text-text-primary truncate">
            {stats?.models?.embed || "all-mpnet-base-v2"}
          </div>
          <div className="mt-1 text-caption-regular text-text-secondary">
            {stats?.settings?.embed_dim || 768}-dim dense representations
          </div>
        </div>

        <div className="rounded-2xl border border-border-button-default bg-background-primary-default p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-caption-1-semibold uppercase tracking-wider text-text-tertiary">
              Vector Index
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-title-1-bold text-text-primary">
            {stats?.vectors ?? 0}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-caption-regular text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>FAISS FlatIP / Cosine index</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border-button-default bg-background-primary-default p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-caption-1-semibold uppercase tracking-wider text-text-tertiary">
              Vision Captioning
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-body-large font-bold text-text-primary truncate">
            {stats?.models?.caption || "blip-image-captioning-base"}
          </div>
          <div className="mt-1 text-caption-regular text-text-secondary">
            Zero-shot local image description
          </div>
        </div>

        <div className="rounded-2xl border border-border-button-default bg-background-primary-default p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-caption-1-semibold uppercase tracking-wider text-text-tertiary">
              SQLite Storage
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <HardDrive className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-title-1-bold text-text-primary">
            {fmtKB(stats?.db_bytes)}
          </div>
          <div className="mt-1 text-caption-regular text-text-secondary">
            FTS5 Porter Tokenizer + WAL
          </div>
        </div>
      </div>

      {/* NEW FUNCTIONALITY: Vector & Embedding Playground */}
      <div className="rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-xs flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-500/10 text-accent-500">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-title-3-bold text-text-primary">
                Neural Embedding & Latency Playground
              </h2>
              <p className="text-caption-regular text-text-secondary">
                Generate real-time vector embeddings, inspect L2 norms, and test inference speeds.
              </p>
            </div>
          </div>
          {embedResult && (
            <div className="flex items-center gap-2 text-caption-medium">
              <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-emerald-600 font-semibold">
                {embedResult.latency_ms} ms latency
              </span>
              <span className="rounded-lg bg-accent-500/10 px-2.5 py-1 text-accent-500 font-semibold">
                {embedResult.dim} dimensions
              </span>
            </div>
          )}
        </div>

        <form onSubmit={handleTestEmbed} className="flex items-center gap-3">
          <div className="flex-1">
            <Input
              aria-label="Text to embed"
              placeholder="Enter any sentence, paragraph, code snippet, or search query…"
              value={embedQuery}
              onChange={setEmbedQuery}
              leadingIcon={Search}
            />
          </div>
          <Button
            variant="primary"
            size="md"
            type="submit"
            leadingIcon={Zap}
            disabled={embeddingLoading || !embedQuery.trim()}
          >
            {embeddingLoading ? "Embedding…" : "Embed Text"}
          </Button>
        </form>

        {embedResult && (
          <div className="rounded-2xl border border-border-button-default bg-background-secondary-default/40 p-4 flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-border-button-default bg-background-primary-default p-3">
                <span className="text-caption-2-medium uppercase text-text-tertiary">
                  Inference Speed
                </span>
                <div className="text-body-large font-bold text-text-primary mt-1">
                  {embedResult.latency_ms} ms
                </div>
              </div>
              <div className="rounded-xl border border-border-button-default bg-background-primary-default p-3">
                <span className="text-caption-2-medium uppercase text-text-tertiary">
                  Vector L2 Magnitude
                </span>
                <div className="text-body-large font-bold text-text-primary mt-1">
                  {embedResult.norm}
                </div>
              </div>
              <div className="rounded-xl border border-border-button-default bg-background-primary-default p-3">
                <span className="text-caption-2-medium uppercase text-text-tertiary">
                  Compute Engine
                </span>
                <div className="text-body-large font-bold text-text-primary mt-1 truncate">
                  {embedResult.backend || "PyTorch CPU"}
                </div>
              </div>
            </div>

            {/* Vector Dimensions Preview Chips */}
            <div>
              <span className="text-caption-1-semibold uppercase tracking-wider text-text-tertiary block mb-2">
                First 12 Dense Vector Float Values:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 font-mono text-caption-2-medium">
                {embedResult.vector_preview.map((val, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col gap-1 rounded-xl border border-border-button-default bg-background-primary-default p-2 text-center"
                  >
                    <span className="text-text-tertiary text-[10px]">dim [{idx}]</span>
                    <span className={val >= 0 ? "text-emerald-500" : "text-amber-500"}>
                      {val > 0 ? `+${val.toFixed(4)}` : val.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Benchmark Diagnostics Results Panel */}
      {benchmarkResult && (
        <div className="rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-xs flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <Activity className="h-5 w-5 text-accent-500" />
            <h2 className="text-title-3-bold text-text-primary">
              Live Benchmark Diagnostics
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border-button-default bg-background-secondary-default/50 p-3.5">
              <span className="text-caption-2-medium text-text-tertiary">SQLite Read</span>
              <div className="mt-1 text-headline-medium text-text-primary">
                {benchmarkResult.db_read_ms} ms
              </div>
            </div>
            <div className="rounded-xl border border-border-button-default bg-background-secondary-default/50 p-3.5">
              <span className="text-caption-2-medium text-text-tertiary">FTS5 Search</span>
              <div className="mt-1 text-headline-medium text-text-primary">
                {benchmarkResult.fts_search_ms} ms
              </div>
            </div>
            <div className="rounded-xl border border-border-button-default bg-background-secondary-default/50 p-3.5">
              <span className="text-caption-2-medium text-text-tertiary">Dense Search</span>
              <div className="mt-1 text-headline-medium text-text-primary">
                {benchmarkResult.vector_search_ms} ms
              </div>
            </div>
            <div className="rounded-xl border border-border-button-default bg-background-secondary-default/50 p-3.5">
              <span className="text-caption-2-medium text-text-tertiary">Total Records</span>
              <div className="mt-1 text-headline-medium text-text-primary">
                {benchmarkResult.memories_count}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Model & Hardware Pipeline Details */}
      <div className="rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-xs">
        <h2 className="text-title-3-bold text-text-primary mb-4">
          Component Pipelines & Engines
        </h2>
        <div className="divide-y divide-border-button-default/50">
          {models &&
            Object.entries(models).map(([k, v]) => (
              <div key={k} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-body-medium font-semibold text-text-primary">
                    {LABELS[k] || k}
                  </span>
                  <span className="font-mono text-caption-regular text-text-secondary">
                    {v.model || v.engine || "built-in"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-caption-regular text-text-tertiary">
                    {v.details || v.device || ""}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-caption-2-medium text-emerald-600 font-semibold">
                    <CheckCircle2 className="h-3 w-3" />
                    {v.status || "ready"}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
