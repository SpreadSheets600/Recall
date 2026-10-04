import { Badge } from "@/components/base/badges/badge";
import { Button } from "@/components/base/buttons/button";
import { Divider } from "@/components/base/divider/divider";
import { ThemeToggle } from "@/components/application/theme/theme-toggle";

export const TABS = ["search", "upload", "library", "models"];

export function RecallSidebar({ tab, onNav, counts, onRebuild, icons }) {
  const { SearchIcon, UploadIcon, LibraryIcon, ModelsIcon } = icons;
  const items = [
    { key: "search", label: "Search", Icon: SearchIcon },
    { key: "upload", label: "Upload", Icon: UploadIcon },
    {
      key: "library",
      label: "Library",
      Icon: LibraryIcon,
      badge: counts ? String(counts.total) : undefined,
    },
    { key: "models", label: "Models", Icon: ModelsIcon },
  ];

  return (
    <aside
      aria-label="Primary"
      className="flex h-full w-[248px] shrink-0 flex-col gap-1 overflow-y-auto rounded-3xl border border-border-card-default bg-background-primary-default p-3 shadow-xs"
    >
      <div className="flex items-center gap-2 px-2 py-1">
        <span aria-hidden className="text-headline-medium text-text-primary">
          ◈
        </span>
        <span className="text-headline-medium text-text-primary">Recall</span>
      </div>

      <nav aria-label="Sections" className="flex flex-col gap-1">
        {items.map(({ key, label, Icon, badge }) => (
          <div key={key} className="flex items-center gap-1">
            <Button
              variant={tab === key ? "secondary" : "ghost"}
              onClick={() => onNav(key)}
              aria-current={tab === key ? "page" : undefined}
              leadingIcon={Icon}
              className="w-full justify-start"
            >
              {label}
            </Button>
            {badge !== undefined && (
              <Badge color={tab === key ? "primary" : "neutral"}>{badge}</Badge>
            )}
          </div>
        ))}
      </nav>

      <Divider />

      <div className="px-2">
        <p className="text-caption-1-semibold uppercase tracking-wide text-text-tertiary">
          Index
        </p>
        {counts ? (
          <dl className="mt-1 flex flex-col gap-0.5 text-body-regular text-text-secondary">
            <div className="flex justify-between">
              <dt>memories</dt>
              <dd className="text-text-primary">{counts.total}</dd>
            </div>
            <div className="flex justify-between">
              <dt>vectors</dt>
              <dd className="text-text-primary">{counts.vectors}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-body-regular text-text-tertiary">Loading…</p>
        )}
        <div className="mt-2">
          <Button variant="secondary" size="xs" onClick={onRebuild}>
            Rebuild index
          </Button>
        </div>
      </div>

      <div className="flex-1" />

      <div className="px-2">
        <p className="text-caption-regular text-text-tertiary">
          AI enriches at ingest. Search stays fast and offline.
        </p>
      </div>
      <ThemeToggle />
    </aside>
  );
}
