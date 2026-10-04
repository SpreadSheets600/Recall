import { Clock, FileText, Globe, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/base/badges/badge";
import { fmtDate, tagList } from "../api.js";

function formatDwell(sec) {
  if (!sec || sec < 5) return null;
  if (sec < 60) return `${sec}s read`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s read` : `${m}m read`;
}

export function MemoryCard({ m, item, onOpen, onClick }) {
  const data = item || m;
  const handleOpen = onClick || onOpen;
  if (!data) return null;

  const dwellLabel = formatDwell(data.dwell_time);

  return (
    <button
      type="button"
      onClick={() => handleOpen?.(data.id)}
      className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-border-button-default bg-background-primary-default p-5 text-left shadow-xs transition-all hover:border-border-button-hover hover:bg-background-primary-hover hover:shadow-sm"
    >
      {data.type === "image" && (
        <img
          className="h-44 w-full rounded-xl border border-border-button-default object-cover"
          loading="lazy"
          src={`/api/memories/${data.id}/file`}
          alt=""
        />
      )}

      <div className="flex items-start justify-between gap-2">
        <h3 className="text-body-medium font-semibold text-text-primary line-clamp-1 group-hover:text-accent-500 transition-colors">
          {data.title || "(untitled)"}
        </h3>
        {data.type && (
          <span className="shrink-0 text-caption-2-medium capitalize text-text-tertiary">
            {data.type}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-caption-2-medium">
        {data.website_type && (
          <span className="rounded-md bg-accent-500/10 px-2 py-0.5 text-accent-500 font-medium capitalize">
            {data.website_type}
          </span>
        )}
        {data.domain && (
          <span className="inline-flex items-center gap-1 text-text-secondary">
            <Globe className="h-3 w-3 text-text-tertiary" />
            {data.domain}
          </span>
        )}
        {dwellLabel && (
          <span className="inline-flex items-center gap-1 text-text-tertiary">
            <Clock className="h-3 w-3" />
            {dwellLabel}
          </span>
        )}
      </div>

      <p className="line-clamp-3 text-body-small text-text-secondary leading-relaxed">
        {data.content || data.ocr_text || data.caption || ""}
      </p>

      {tagList(data.tags).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {tagList(data.tags).map((t) => (
            <span
              key={t}
              className="text-caption-2-medium text-text-tertiary hover:text-text-secondary"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between pt-3 border-t border-border-button-default/50 text-caption-regular text-text-tertiary">
        <span>{fmtDate(data.created_at)}</span>
        {data.source && (
          <span className="truncate max-w-[160px] text-caption-regular text-text-tertiary">
            {data.source}
          </span>
        )}
      </div>
    </button>
  );
}
