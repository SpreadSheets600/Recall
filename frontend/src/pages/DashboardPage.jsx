import { useState } from "react";
import {
  ArrowRight,
  Cpu,
  Database,
  FileText,
  FolderArchive,
  Search,
  Sparkles,
  UploadCloud,
  Zap,
} from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { PageHeader } from "../components/PageHeader.jsx";
import { api, fmtKB } from "../api.js";
import { MemoryCard } from "../components/MemoryCard.jsx";

export function DashboardPage({
  counts,
  onNav,
  onOpen,
  onToast,
  onRefresh,
  lastDeletedId = null,
}) {
  const [quickTitle, setQuickTitle] = useState("");
  const [quickContent, setQuickContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  async function handleSaveQuickNote(e) {
    e?.preventDefault();
    if (!quickContent.trim()) {
      onToast("Note content cannot be empty");
      return;
    }
    setSavingNote(true);
    try {
      await api("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "text",
          title: quickTitle.trim() || undefined,
          content: quickContent.trim(),
        }),
      });
      onToast("Quick note saved and indexed");
      setQuickTitle("");
      setQuickContent("");
      onRefresh();
    } catch (err) {
      onToast("Failed to save note: " + (err.message || err));
    } finally {
      setSavingNote(false);
    }
  }

  async function handleQuickOptimize() {
    setOptimizing(true);
    try {
      const res = await api("/api/tools/optimize", { method: "POST" });
      onToast(`Optimized index (${res.reclaimed_bytes} B reclaimed)`);
      onRefresh();
    } catch {
      onToast("Optimization failed");
    } finally {
      setOptimizing(false);
    }
  }

  const allRecent = counts?.recent || [];
  const recentMemories =
    lastDeletedId != null ? allRecent.filter((m) => m.id !== lastDeletedId) : allRecent;

  return (
    <div className="flex flex-col gap-8">
      {/* Unified Bento Header (No memory pills) */}
      <PageHeader
        title="Dashboard"
        subtitle="System metrics, quick capture, and recent memory activity."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={Sparkles}
              onClick={handleQuickOptimize}
              disabled={optimizing}
            >
              {optimizing ? "Optimizing…" : "Optimize Index"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              leadingIcon={Search}
              onClick={() => onNav("search")}
            >
              Search Studio
            </Button>
          </>
        }
      />

      {/* Bento Grid: Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Memories */}
        <div className="rounded-2xl border border-border-button-default bg-background-primary-default p-5 shadow-xs transition-all hover:border-border-button-hover">
          <div className="flex items-center justify-between">
            <span className="text-caption-1-semibold uppercase tracking-wider text-text-tertiary">
              Total Memories
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-500/10 text-accent-500">
              <FolderArchive className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-title-1-bold text-text-primary">
            {counts?.total ?? "—"}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-caption-regular text-text-secondary">
            <span>{counts?.uploads ?? 0} media uploads</span>
          </div>
        </div>

        {/* Vector Embeddings */}
        <div className="rounded-2xl border border-border-button-default bg-background-primary-default p-5 shadow-xs transition-all hover:border-border-button-hover">
          <div className="flex items-center justify-between">
            <span className="text-caption-1-semibold uppercase tracking-wider text-text-tertiary">
              Vectors Indexed
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Cpu className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-title-1-bold text-text-primary">
            {counts?.vectors ?? "—"}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-caption-regular text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>{counts?.settings?.embed_dim || 768}-dim dense FAISS</span>
          </div>
        </div>

        {/* Database Size */}
        <div className="rounded-2xl border border-border-button-default bg-background-primary-default p-5 shadow-xs transition-all hover:border-border-button-hover">
          <div className="flex items-center justify-between">
            <span className="text-caption-1-semibold uppercase tracking-wider text-text-tertiary">
              Storage Used
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <Database className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-title-1-bold text-text-primary">
            {fmtKB(counts?.db_bytes)}
          </div>
          <div className="mt-1 text-caption-regular text-text-secondary">
            SQLite FTS5 + WAL Mode
          </div>
        </div>

        {/* AI & Pipeline */}
        <div className="rounded-2xl border border-border-button-default bg-background-primary-default p-5 shadow-xs transition-all hover:border-border-button-hover">
          <div className="flex items-center justify-between">
            <span className="text-caption-1-semibold uppercase tracking-wider text-text-tertiary">
              Pipeline Status
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-title-1-bold text-text-primary">
            Fully Offline
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-caption-regular text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
            <span>OCR & BLIP ready</span>
          </div>
        </div>
      </div>

      {/* Row 2: Quick Capture & Shortcuts (Col 1) + Recent Memories (Col 2) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Quick Capture OUTSIDE any card wrapper, matching Recent Memories */}
        <div className="flex flex-col gap-8 lg:col-span-1">
          {/* Quick Capture Section */}
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-headline-medium font-semibold text-text-primary">
                Quick Capture
              </h2>
              <p className="text-caption-regular text-text-secondary mt-0.5">
                Instantly save and index thoughts or snippets.
              </p>
            </div>

            <form onSubmit={handleSaveQuickNote} className="flex flex-col gap-3">
              <Input
                aria-label="Note title"
                placeholder="Optional title…"
                value={quickTitle}
                onChange={setQuickTitle}
              />
              <textarea
                rows={4}
                placeholder="Paste code, write a quick thought, note, or snippet…"
                value={quickContent}
                onChange={(e) => setQuickContent(e.target.value)}
                className="w-full rounded-xl border border-border-button-default bg-background-secondary-default/50 p-3 text-body-small text-text-primary placeholder:text-text-tertiary shadow-2xs transition-all hover:border-border-button-hover focus:border-border-focus-ring focus:bg-background-primary-default focus:ring-2 focus:ring-border-focus-ring/20 focus:outline-none resize-none"
              />
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={savingNote || !quickContent.trim()}
                className="w-full justify-center"
              >
                {savingNote ? "Indexing…" : "Save Note"}
              </Button>
            </form>
          </div>

          {/* Quick Shortcuts Section */}
          <div className="flex flex-col gap-3 pt-4 border-t border-border-button-default/60">
            <h3 className="text-caption-1-semibold uppercase tracking-wider text-text-tertiary">
              Quick Shortcuts
            </h3>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onNav("upload")}
                className="flex items-center justify-between rounded-xl border border-border-button-default bg-background-primary-default p-3 text-left text-body-small text-text-primary hover:border-border-button-hover hover:bg-background-secondary-default transition-all shadow-2xs"
              >
                <span className="flex items-center gap-2">
                  <UploadCloud className="h-4 w-4 text-accent-500" />
                  Upload documents & media
                </span>
                <ArrowRight className="h-4 w-4 text-text-tertiary" />
              </button>
              <button
                type="button"
                onClick={() => onNav("library")}
                className="flex items-center justify-between rounded-xl border border-border-button-default bg-background-primary-default p-3 text-left text-body-small text-text-primary hover:border-border-button-hover hover:bg-background-secondary-default transition-all shadow-2xs"
              >
                <span className="flex items-center gap-2">
                  <FolderArchive className="h-4 w-4 text-accent-500" />
                  Browse Memory Library
                </span>
                <ArrowRight className="h-4 w-4 text-text-tertiary" />
              </button>
              <button
                type="button"
                onClick={() => onNav("models")}
                className="flex items-center justify-between rounded-xl border border-border-button-default bg-background-primary-default p-3 text-left text-body-small text-text-primary hover:border-border-button-hover hover:bg-background-secondary-default transition-all shadow-2xs"
              >
                <span className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-accent-500" />
                  Models & Hardware Info
                </span>
                <ArrowRight className="h-4 w-4 text-text-tertiary" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Recent Memories (Open Section) */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-headline-medium font-semibold text-text-primary">
                Recent Memories
              </h2>
              <p className="text-caption-regular text-text-secondary mt-0.5">
                Latest indexed documents, web clips, and notes.
              </p>
            </div>
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => onNav("library")}
            >
              View all →
            </Button>
          </div>

          {recentMemories.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-button-default p-12 text-center">
              <p className="text-body-medium text-text-secondary">
                No memories recorded yet.
              </p>
              <p className="text-caption-regular text-text-tertiary mt-1">
                Upload files or save a quick note above to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentMemories.map((m) => (
                <MemoryCard key={m.id} m={m} onOpen={onOpen} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
