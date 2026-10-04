import {
  Cpu,
  FolderArchive,
  LayoutDashboard,
  Network,
  RotateCw,
  Search,
  Settings,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/base/buttons/button";

export function RecallSidebar({
  tab,
  onNav,
  counts,
  onRebuild,
  collapsed = false,
}) {
  const items = [
    { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { key: "search", label: "Search", Icon: Search },
    { key: "graph", label: "Knowledge Graph", Icon: Network },
    { key: "upload", label: "Upload & Ingest", Icon: UploadCloud },
    { key: "library", label: "Library", Icon: FolderArchive },
    { key: "models", label: "Models & AI", Icon: Cpu },
    { key: "settings", label: "Settings", Icon: Settings },
  ];

  return (
    <aside
      aria-label="Primary navigation"
      style={{ width: collapsed ? 68 : 240 }}
      className="fixed top-0 bottom-0 left-0 z-30 flex flex-col border-r border-border-button-default bg-background-primary-default transition-[width] duration-200 ease-in-out select-none overflow-hidden"
    >
      {/* Brand header */}
      <div className="flex h-16 items-center px-4 border-b border-border-button-default shrink-0">
        {!collapsed ? (
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-500 font-bold text-text-white shadow-xs">
              R
            </div>
            <div className="flex flex-col truncate">
              <span className="text-headline-medium font-bold text-text-primary tracking-tight leading-none">
                Recall
              </span>
              <span className="text-caption-2-medium text-text-tertiary mt-1">
                Local-First Memory
              </span>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl bg-accent-500 font-bold text-text-white shadow-xs">
            R
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-1 p-2.5 overflow-y-auto overflow-x-hidden">
        {items.map((it) => {
          const active = tab === it.key;
          const Icon = it.Icon;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onNav(it.key)}
              title={collapsed ? it.label : undefined}
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-body-medium font-medium transition-all ${
                active
                  ? "bg-accent-500 text-text-white shadow-xs"
                  : "text-text-secondary hover:bg-background-secondary-default hover:text-text-primary"
              } ${collapsed ? "justify-center px-0" : ""}`}
            >
              <Icon
                className={`h-5 w-5 shrink-0 transition-colors ${
                  active ? "text-text-white" : "text-text-tertiary group-hover:text-text-primary"
                }`}
              />
              {!collapsed && (
                <span className="truncate flex-1 text-left">{it.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer stats & Rebuild button */}
      <div className="p-3 border-t border-border-button-default flex flex-col gap-2 shrink-0">
        {!collapsed ? (
          <>
            <div className="rounded-xl bg-background-secondary-default/70 p-2.5 flex items-center justify-between text-caption-regular">
              <span className="text-text-tertiary">Indexed Status</span>
              <span className="text-text-primary font-semibold">
                {counts?.vectors ?? 0} vectors
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={RotateCw}
              onClick={onRebuild}
              className="w-full justify-center"
            >
              Sync & Rebuild
            </Button>
          </>
        ) : (
          <button
            type="button"
            onClick={onRebuild}
            title="Sync & Rebuild Vectors"
            className="flex h-9 w-9 mx-auto items-center justify-center rounded-xl text-text-secondary hover:bg-background-secondary-default hover:text-text-primary transition-colors"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
