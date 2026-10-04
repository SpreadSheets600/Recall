import { useEffect, useRef } from "react";
import {
  Cpu,
  FolderArchive,
  LayoutDashboard,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { ThemeToggle } from "@/components/application/theme/theme-toggle";

const TAB_METADATA = {
  dashboard: { title: "Dashboard", Icon: LayoutDashboard },
  search: { title: "Search Studio", Icon: Search },
  graph: { title: "Knowledge Graph", Icon: Network },
  upload: { title: "Upload & Ingest", Icon: UploadCloud },
  library: { title: "Memory Library", Icon: FolderArchive },
  models: { title: "Models & AI", Icon: Cpu },
  settings: { title: "Settings", Icon: Settings },
};

export function RecallNavbar({
  tab,
  onNav,
  onToggleSidebar,
  sidebarCollapsed,
  globalSearchQuery,
  onGlobalSearchChange,
  onGlobalSearchSubmit,
}) {
  const currentMeta = TAB_METADATA[tab] || { title: "Overview", Icon: LayoutDashboard };
  const CurrentIcon = currentMeta.Icon;
  const searchInputRef = useRef(null);

  // Global keyboard shortcut '/' or 'Cmd+K' to focus quick search
  useEffect(() => {
    function handleKeyDown(e) {
      if (
        (e.key === "/" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") ||
        ((e.metaKey || e.ctrlKey) && e.key === "k")
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-border-button-default bg-background-primary-default/90 backdrop-blur-md px-6 lg:px-8">
      {/* Left: Mobile/Desktop toggle + Breadcrumb Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="text-text-secondary hover:text-text-primary p-2 rounded-xl border border-transparent hover:border-border-button-default hover:bg-background-secondary-default transition-all"
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label="Toggle navigation sidebar"
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4.5 w-4.5" />
          ) : (
            <PanelLeftClose className="h-4.5 w-4.5" />
          )}
        </button>

        <div className="flex items-center gap-2">
          <CurrentIcon className="h-5 w-5 text-accent-500" />
          <span className="text-body-medium font-semibold text-text-primary">
            {currentMeta.title}
          </span>
          <span className="text-text-tertiary">/</span>
          <span className="text-caption-regular text-text-tertiary hidden sm:inline">
            Local Workspace
          </span>
        </div>
      </div>

      {/* Center: Consistent Quick Search input */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <form onSubmit={onGlobalSearchSubmit} className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-text-tertiary" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Quick search memories… (Press / or ⌘K)"
            value={globalSearchQuery}
            onChange={(e) => onGlobalSearchChange(e.target.value)}
            className="h-10 w-full rounded-xl border border-border-button-default bg-background-secondary-default/50 pl-9 pr-9 text-body-small text-text-primary placeholder:text-text-tertiary shadow-2xs transition-all hover:border-border-button-hover focus:border-border-focus-ring focus:bg-background-primary-default focus:ring-2 focus:ring-border-focus-ring/20 focus:outline-none"
          />
          {globalSearchQuery && (
            <button
              type="button"
              onClick={() => onGlobalSearchChange("")}
              className="absolute right-3 text-text-tertiary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>

      {/* Right Actions: Theme Toggle, New Ingest button (NO memory pills) */}
      <div className="flex items-center gap-3">
        <ThemeToggle />

        <Button
          variant="primary"
          size="sm"
          leadingIcon={Plus}
          onClick={() => onNav("upload")}
        >
          Add Memory
        </Button>
      </div>
    </header>
  );
}
