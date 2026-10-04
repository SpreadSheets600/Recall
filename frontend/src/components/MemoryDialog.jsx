import { useEffect, useState } from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { CloseButton } from "@/components/base/buttons/close-button";
import { Badge } from "@/components/base/badges/badge";
import { Chip } from "@/components/base/badges/chip";
import { Divider } from "@/components/base/divider/divider";
import { api, fmtDate, fmtKB, tagList } from "../api.js";

function Block({ title, children }) {
  return (
    <div>
      <h3 className="mb-1 text-caption-1-semibold uppercase tracking-wide text-text-tertiary">{title}</h3>
      <div className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border-card-default bg-background-secondary-default p-3 text-body-regular text-text-primary">
        {children}
      </div>
    </div>
  );
}

export function MemoryDialog({ id, onClose, onDeleted, onOpen, onToast }) {
  const [m, setM] = useState(null);

  useEffect(() => {
    if (id == null) return;
    setM(null);
    api(`/api/memories/${id}`)
      .then(setM)
      .catch(() => onToast("Could not load memory"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function remove() {
    if (!window.confirm("Delete this memory?")) return;
    try {
      await api(`/api/memories/${id}`, { method: "DELETE" });
      onToast("Deleted");
      onDeleted();
    } catch (e) {
      onToast("Delete failed");
    }
  }

  let exif = {};
  try {
    exif = JSON.parse(m?.exif_json || "{}");
  } catch (e) {
    exif = {};
  }

  return (
    <ModalOverlay
      isOpen={id != null}
      onOpenChange={(open) => { if (!open) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <Modal className="max-h-[88vh] w-[92vw] max-w-2xl overflow-auto rounded-3lg border border-border-card-default bg-background-primary-default p-6 shadow-lg outline-none">
        <Dialog aria-label="Memory detail">
          <div className="mb-3 flex items-start justify-between gap-2">
            <h2 className="text-title-3-medium text-text-primary">{m?.title || "Loading…"}</h2>
            <CloseButton aria-label="Close" onClick={onClose} />
          </div>
          {m && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1">
                {m.type && <Badge color="neutral">{m.type}</Badge>}
                {m.domain && <Badge color="neutral">{m.domain}</Badge>}
                {(m.match || []).map((x) => (
                  <Chip key={x} color="blue">
                    {x}
                  </Chip>
                ))}
              </div>
              {m.type === "image" && (
                <img
                  className="max-h-80 w-full rounded-lg border border-border-card-default object-contain"
                  src={`/api/memories/${m.id}/file`}
                  alt=""
                />
              )}
              {m.description && <Block title="AI description">{m.description}</Block>}
              <Block title="Extracted content">{(m.content || "—").slice(0, 4000)}</Block>
              {m.ocr_text && <Block title="OCR text">{m.ocr_text.slice(0, 2000)}</Block>}
              <div>
                <h3 className="mb-1 text-caption-1-semibold uppercase tracking-wide text-text-tertiary">
                  Topics &amp; tags
                </h3>
                <div className="flex flex-wrap gap-1">
                  {tagList(m.tags).length > 0
                    ? tagList(m.tags).map((t) => <Chip key={t} color="neutral">#{t}</Chip>)
                    : <span className="text-body-regular text-text-tertiary">none yet</span>}
                </div>
              </div>
              <div>
                <h3 className="mb-1 text-caption-1-semibold uppercase tracking-wide text-text-tertiary">Metadata</h3>
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-body-regular">
                  <dt className="text-text-tertiary">source</dt><dd className="break-words text-text-primary">{m.source || "—"}</dd>
                  <dt className="text-text-tertiary">file</dt><dd className="break-words text-text-primary">{m.path || "—"}</dd>
                  <dt className="text-text-tertiary">size</dt><dd className="text-text-primary">{fmtKB(m.file_size)}</dd>
                  {m.width && (<><dt className="text-text-tertiary">dimensions</dt><dd className="text-text-primary">{m.width}×{m.height}</dd></>)}
                  <dt className="text-text-tertiary">saved</dt><dd className="text-text-primary">{fmtDate(m.created_at)}</dd>
                  <dt className="text-text-tertiary">status</dt><dd className="text-text-primary">{m.status || "indexed"}</dd>
                </dl>
              </div>
              {Object.keys(exif).length > 0 && (
                <div>
                  <h3 className="mb-1 text-caption-1-semibold uppercase tracking-wide text-text-tertiary">EXIF</h3>
                  <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-body-regular">
                    {Object.entries(exif).map(([k, v]) => (
                      <span key={k} className="contents">
                        <dt className="text-text-tertiary">{k}</dt>
                        <dd className="break-words text-text-primary">{String(v)}</dd>
                      </span>
                    ))}
                  </dl>
                </div>
              )}
              {(m.related || []).length > 0 && (
                <div>
                  <h3 className="mb-1 text-caption-1-semibold uppercase tracking-wide text-text-tertiary">Related</h3>
                  <ul className="flex flex-col gap-1">
                    {(m.related || []).map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className="cursor-pointer text-body-medium text-text-primary underline-offset-2 hover:underline"
                          onClick={() => onOpen(r.id)}
                        >
                          {r.title || "untitled"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Divider />
              <div className="flex justify-end gap-2">
                <Button variant="danger" onClick={remove}>
                  Delete
                </Button>
                <Button variant="secondary" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
