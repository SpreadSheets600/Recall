import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { FileUpload } from "@/components/base/file-upload/file-upload";
import { Input } from "@/components/base/input/input";
import { Textarea } from "@/components/base/textarea/textarea";
import { api } from "../api.js";

export function UploadPage({ onToast, onChanged }) {
  const [source, setSource] = useState("");
  const [queue, setQueue] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  function push(entry) {
    setQueue((q) => [entry, ...q].slice(0, 20));
  }

  async function uploadFile(file) {
    const fd = new FormData();
    fd.append("files", file, file.name);
    fd.append("source", source.trim());
    try {
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      if (!r.ok) throw new Error(await r.text());
      const body = await r.json();
      const res = (body.results || [])[0] || {};
      push({ name: file.name, status: res.status || "done", id: res.id });
      onToast(`${file.name}: ${res.status}`);
      onChanged();
      return res;
    } catch (e) {
      push({ name: file.name, status: "failed", error: String(e).slice(0, 160) });
      onToast(`${file.name} failed`);
      return null;
    }
  }

  async function saveNote() {
    if (!title.trim() && !content.trim()) {
      onToast("Write a title or some content first");
      return;
    }
    try {
      const m = await api("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "text", title: title.trim(), content: content.trim() }),
      });
      onToast(`Saved note #${m.id}`);
      setTitle("");
      setContent("");
      onChanged();
    } catch (e) {
      onToast("Save failed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-title-2-medium text-text-primary">Add memories</h1>
        <p className="text-body-regular text-text-secondary">
          Three ways in — pick whichever fits. Every image automatically gets an
          AI description plus OCR text at ingest.
        </p>
      </div>

      <div className="rounded-4lg border border-border-card-default bg-background-primary-default p-5 shadow-xs">
        <h2 className="text-headline-medium text-text-primary">1 · Upload files</h2>
        <p className="text-body-regular text-text-secondary">
          Images, PDFs, text, markdown, HTML. Files land in data/uploads/ and are indexed.
        </p>
        <div className="mt-3">
          <FileUpload
            allowedExtensions={["png", "jpg", "jpeg", "gif", "webp", "pdf", "txt", "md", "markdown", "html", "htm"]}
            maxBytes={100 * 1024 * 1024}
            onUploadComplete={(file) => uploadFile(file)}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <div className="flex-1">
            <Input
              aria-label="Source URL for uploads"
              placeholder="source (optional) · e.g. https://github.com/…"
              value={source}
              onChange={setSource}
            />
          </div>
        </div>
        {queue.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1">
            {queue.map((e, i) => (
              <li
                key={`${e.name}-${i}`}
                className="rounded-lg border border-border-card-default px-3 py-2 text-body-regular text-text-secondary"
              >
                {e.name} — {e.status}
                {e.id != null && ` (id ${e.id})`}
                {e.error && `: ${e.error}`}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-4lg border border-border-card-default bg-background-primary-default p-5 shadow-xs">
          <h2 className="text-headline-medium text-text-primary">2 · Quick note</h2>
          <p className="text-body-regular text-text-secondary">Save text directly — no file needed.</p>
          <div className="mt-3 flex flex-col gap-2">
            <Input aria-label="Note title" label="Title" placeholder="Title" value={title} onChange={setTitle} />
            <Textarea
              aria-label="Note content"
              label="Content"
              placeholder="Paste or type content…"
              value={content}
              onChange={setContent}
            />
            <div>
              <Button variant="primary" onClick={saveNote}>
                Save note
              </Button>
            </div>
          </div>
        </div>
        <div className="rounded-4lg border border-border-card-default bg-background-primary-default p-5 shadow-xs">
          <h2 className="text-headline-medium text-text-primary">3 · API / script</h2>
          <p className="text-body-regular text-text-secondary">Same backend the UI uses. Good for bulk imports.</p>
          <pre className="mt-3 overflow-auto rounded-lg bg-background-secondary-default p-3 text-caption-regular">
{`# single file
curl -F "files=@shot.png" \\
     -F "source=https://github.com/…" \\
     localhost:8000/api/upload

# text note
curl -X POST localhost:8000/api/memories \\
  -H 'Content-Type: application/json' \\
  -d '{"title":"FAISS notes",
       "content":"vector index"}'`}
          </pre>
        </div>
      </div>
    </div>
  );
}
