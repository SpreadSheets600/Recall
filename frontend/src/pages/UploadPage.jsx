import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Save,
  Terminal,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Textarea } from "@/components/base/textarea/textarea";
import { FileUpload } from "@/components/base/file-upload/file-upload";
import { PageHeader } from "../components/PageHeader.jsx";
import { api } from "../api.js";

const SINGLE_FILE_CURL = `curl -X POST http://127.0.0.1:8000/api/upload \\
  -F "files=@report.pdf" \\
  -F "source=manual"`;

const NOTE_CURL = `curl -X POST http://127.0.0.1:8000/api/memories \\
  -H "Content-Type: application/json" \\
  -d '{"type":"text","title":"Demo","content":"Hello world"}'`;

// Everything the backend ingest pipeline handles (see textutil detect_type).
const ACCEPTED_EXTENSIONS = [
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "tif",
  "pdf", "txt", "md", "markdown", "html", "htm",
];
const MAX_BYTES = 50 * 1024 * 1024;

export function UploadPage({ onToast, onChanged }) {
  const [source, setSource] = useState("");
  const [queue, setQueue] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  async function uploadFile(file) {
    const key = `${file.name}-${Date.now()}`;
    setQueue((q) =>
      [{ key, name: file.name, status: "uploading" }, ...q].slice(0, 20)
    );
    const fd = new FormData();
    fd.append("files", file, file.name);
    fd.append("source", source.trim());
    try {
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      if (!r.ok) throw new Error(await r.text());
      const body = await r.json();
      const res = (body.results || [])[0] || {};
      setQueue((q) =>
        q.map((e) =>
          e.key === key ? { ...e, status: res.status || "done", id: res.id } : e
        )
      );
      onToast(`${file.name}: ${res.status}`);
      onChanged?.();
      return res;
    } catch (e) {
      setQueue((q) =>
        q.map((e) =>
          e.key === key
            ? { ...e, status: "failed", error: String(e).slice(0, 160) }
            : e
        )
      );
      onToast(`${file.name} failed`);
      return null;
    }
  }

  async function saveNote(e) {
    e?.preventDefault();
    if (!title.trim() && !content.trim()) {
      onToast("Write a title or some content first");
      return;
    }
    setSavingNote(true);
    try {
      const m = await api("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "text",
          title: title.trim() || undefined,
          content: content.trim(),
        }),
      });
      onToast(`Saved note #${m.id}`);
      setTitle("");
      setContent("");
      onChanged?.();
    } catch {
      onToast("Save failed");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Unified Bento Header */}
      <PageHeader
        title="Add memories"
        subtitle="Three ways in — pick whichever fits. Every image automatically gets an AI description plus OCR text at ingest."
      />

      {/* 1 · Upload files */}
      <div className="rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-xs flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-500/10 text-accent-500 font-semibold text-caption-medium">
              1
            </div>
            <div>
              <h2 className="text-title-3-bold text-text-primary">Upload files</h2>
              <p className="text-caption-regular text-text-secondary">
                Drag in images (PNG, JPG, WebP), PDFs, text notes, or Markdown files.
              </p>
            </div>
          </div>
          <div className="w-64">
            <Input
              aria-label="Source tag"
              placeholder="Source tag (optional, e.g. receipt)"
              value={source}
              onChange={setSource}
            />
          </div>
        </div>

        <FileUpload
          onFileAccepted={uploadFile}
          allowedExtensions={ACCEPTED_EXTENSIONS}
          maxBytes={MAX_BYTES}
        />

        {queue.length > 0 && (
          <div className="mt-2 space-y-1.5 pt-3 border-t border-border-button-default/50">
            <span className="text-caption-1-semibold uppercase tracking-wider text-text-tertiary">
              Recent Ingestion Queue
            </span>
            {queue.map((q) => (
              <div
                key={q.key || q.name}
                className="flex items-center justify-between rounded-xl border border-border-button-default bg-background-secondary-default/40 px-3.5 py-2 text-caption-regular"
              >
                <span className="font-mono text-text-primary truncate max-w-md">
                  {q.name}
                </span>
                <span className="flex items-center gap-1.5">
                  {q.status === "failed" ? (
                    <>
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <span className="text-red-500 font-medium">Failed</span>
                    </>
                  ) : q.status === "uploading" ? (
                    <>
                      <UploadCloud className="h-4 w-4 text-accent-500 animate-pulse" />
                      <span className="text-accent-500 font-medium">Uploading…</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span className="text-emerald-500 font-medium">
                        {q.status} {q.id ? `#${q.id}` : ""}
                      </span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid: 2 · Quick note & 3 · API / script */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* 2 · Quick note */}
        <div className="rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-xs flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-500/10 text-accent-500 font-semibold text-caption-medium">
              2
            </div>
            <div>
              <h2 className="text-title-3-bold text-text-primary">Quick note</h2>
              <p className="text-caption-regular text-text-secondary">
                Type directly without creating a file.
              </p>
            </div>
          </div>

          <form onSubmit={saveNote} className="flex flex-col gap-3">
            <Input
              aria-label="Note title"
              placeholder="Title (optional)"
              value={title}
              onChange={setTitle}
            />
            <Textarea
              aria-label="Note content"
              placeholder="What do you want to remember? Markdown, meeting notes, code snippets, brainstorms…"
              rows={6}
              value={content}
              onChange={setContent}
            />
            <Button
              variant="primary"
              size="md"
              type="submit"
              leadingIcon={Save}
              disabled={savingNote || (!title.trim() && !content.trim())}
              className="justify-center"
            >
              {savingNote ? "Saving…" : "Save note"}
            </Button>
          </form>
        </div>

        {/* 3 · API / script */}
        <div className="rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-xs flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-500/10 text-accent-500 font-semibold text-caption-medium">
              3
            </div>
            <div>
              <h2 className="text-title-3-bold text-text-primary">API / script</h2>
              <p className="text-caption-regular text-text-secondary">
                Ingest from terminal or automated scripts.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 text-caption-regular text-text-secondary">
            <div>
              <div className="font-semibold text-text-primary mb-1">
                Upload single file:
              </div>
              <pre className="rounded-xl border border-border-button-default bg-background-secondary-default/70 p-3 text-caption-2-medium font-mono text-text-primary overflow-x-auto whitespace-pre-wrap">
                {SINGLE_FILE_CURL}
              </pre>
            </div>

            <div>
              <div className="font-semibold text-text-primary mb-1">
                Insert text note:
              </div>
              <pre className="rounded-xl border border-border-button-default bg-background-secondary-default/70 p-3 text-caption-2-medium font-mono text-text-primary overflow-x-auto whitespace-pre-wrap">
                {NOTE_CURL}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
