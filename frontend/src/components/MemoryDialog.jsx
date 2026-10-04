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
      <div className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border-button-default bg-background-secondary-default p-3 text-body-regular text-text-primary">
        {children}
      </div>
    </div>
  );
}

export function MemoryDialog({ id, onClose, onDeleted, onOpen, onToast }) {
  const [m, setM] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (id == null) return;
    setM(null);
    setIsDeleting(false);
    api(`/api/memories/${id}`)
      .then(setM)
      .catch(() => onToast("Could not load memory"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function remove() {
    if (!window.confirm("Delete this memory?")) return;
    setIsDeleting(true);
    const targetId = id;
    try {
      await api(`/api/memories/${targetId}`, { method: "DELETE" });
      onToast("Deleted memory");
      onDeleted(targetId);
    } catch (e) {
      setIsDeleting(false);
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
      <Modal className="max-h-[88vh] w-[92vw] max-w-2xl overflow-auto rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-lg outline-none">
        <Dialog aria-label="Memory detail">
          <div className="mb-3 flex items-start justify-between gap-2">
            <h2 className="text-title-3-medium text-text-primary">{m?.title || "Loading…"}</h2>
            <CloseButton aria-label="Close" onClick={onClose} />
          </div>
          {m && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1">
                {m.type && <Badge color="neutral">{m.type}</Badge>}
                {m.website_type && <Badge color="primary">{m.website_type}</Badge>}
                {m.domain && <Badge color="neutral">{m.domain}</Badge>}
                {m.dwell_time > 0 && (
                  <Badge color="neutral">⏱ {m.dwell_time}s spent</Badge>
                )}
                {(m.match || []).map((x) => (
                  <Chip key={x} color="blue">
                    {x}
                  </Chip>
                ))}
              </div>
              {m.type === "image" && (
                <img
                  className="max-h-96 w-full rounded-2xl border border-border-button-default object-contain"
                  src={`/api/memories/${m.id}/file`}
                  alt={m.title || "memory image"}
                />
              )}
              {m.caption && <Block title="AI Caption">{m.caption}</Block>}
              {m.ocr_text && <Block title="Extracted Text (OCR)">{m.ocr_text}</Block>}
              {m.content && <Block title="Extracted Content">{m.content}</Block>}
              {tagList(m.tags).length > 0 && (
                <div>
                  <h3 className="mb-1 text-caption-1-semibold uppercase tracking-wide text-text-tertiary">
                    Topics &amp; Tags
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {tagList(m.tags).map((t) => (
                      <Chip key={t} color="neutral">
                        #{t}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-caption-regular text-text-secondary">
                <div>Source: {m.source || "local"}</div>
                <div>Created: {fmtDate(m.created_at)}</div>
                {m.file_size ? <div>Size: {fmtKB(m.file_size)}</div> : null}
                {m.mime_type ? <div>MIME: {m.mime_type}</div> : null}
                {exif.device ? <div>Camera: {exif.device}</div> : null}
                {exif.datetime ? <div>Photo Date: {exif.datetime}</div> : null}
              </div>

              {m.similar && m.similar.length > 0 && (
                <div>
                  <Divider className="my-2" />
                  <h3 className="mb-2 text-caption-1-semibold uppercase tracking-wide text-text-tertiary">
                    Related Memories
                  </h3>
                  <div className="flex flex-col gap-1.5">
                    {m.similar.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onOpen(s.id)}
                        className="flex items-center justify-between rounded-xl border border-border-button-default bg-background-secondary-default p-2 text-left text-body-small text-text-primary transition-colors hover:border-border-button-hover hover:bg-background-secondary-hover"
                      >
                        <span className="truncate">{s.title || "(untitled)"}</span>
                        <span className="text-caption-regular text-text-tertiary">
                          {Math.round(s.similarity * 100)}% similar
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-2 flex justify-between border-t border-border-button-default pt-3">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={remove}
                  disabled={isDeleting}
                >
                  {isDeleting ? "Deleting…" : "Delete Memory"}
                </Button>
                {m.source?.startsWith("http") && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => window.open(m.source, "_blank", "noopener,noreferrer")}
                  >
                    Open Source
                  </Button>
                )}
              </div>
            </div>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
