import { Badge } from "@/components/base/badges/badge";
import { Chip } from "@/components/base/badges/chip";
import { fmtDate, tagList } from "../api.js";

export function MatchChips({ match }) {
  return (
    <>
      {(match || []).map((m) => (
        <Chip key={m} color="blue">
          {m}
        </Chip>
      ))}
    </>
  );
}

export function MemoryCard({ m, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(m.id)}
      className="flex cursor-pointer flex-col gap-2 rounded-3lg border border-border-card-default bg-background-primary-default p-4 text-left shadow-xs transition-colors hover:border-border-card-hover"
    >
      {m.type === "image" && (
        <img
          className="h-40 w-full rounded-2lg border border-border-card-default object-cover"
          loading="lazy"
          src={`/api/memories/${m.id}/file`}
          alt=""
        />
      )}
      <div className="text-headline-medium text-text-primary">
        {m.title || "(untitled)"}
      </div>
      <div className="flex flex-wrap gap-1">
        {m.type && <Badge color="neutral">{m.type}</Badge>}
        {m.domain && <Badge color="neutral">{m.domain}</Badge>}
        <MatchChips match={m.match} />
      </div>
      <p className="line-clamp-3 text-body-regular text-text-secondary">
        {(m.description || m.content || "").slice(0, 240)}
      </p>
      {tagList(m.tags).slice(0, 4).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tagList(m.tags)
            .slice(0, 4)
            .map((t) => (
              <span key={t} className="text-caption-regular text-text-tertiary">
                #{t}
              </span>
            ))}
        </div>
      )}
      <div className="text-caption-regular text-text-tertiary">
        {[m.source, fmtDate(m.created_at)].filter(Boolean).join(" · ")}
      </div>
    </button>
  );
}
