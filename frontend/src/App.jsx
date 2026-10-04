import { useCallback, useEffect, useState } from "react";
import {
  RiImageLine,
  RiSearchLine,
  RiSettings3Line,
  RiUploadCloud2Line,
} from "@remixicon/react";
import {
  DashboardSidebar,
} from "@/components/application/dashboard/dashboard-sidebar";
import { ThemeToggle } from "@/components/application/theme/theme-toggle";
import { api } from "./api.js";
import { SearchPage } from "./pages/SearchPage.jsx";
import { UploadPage } from "./pages/UploadPage.jsx";
import { LibraryPage } from "./pages/LibraryPage.jsx";
import { ModelsPage } from "./pages/ModelsPage.jsx";
import { MemoryDialog } from "./components/MemoryDialog.jsx";

const NAV = [
  { key: "search", label: "Search", icon: RiSearchLine },
  { key: "upload", label: "Upload", icon: RiUploadCloud2Line },
  { key: "library", label: "Library", icon: RiImageLine },
  { key: "models", label: "Models", icon: RiSettings3Line },
];

export function App() {
  const [tab, setTab] = useState("search");
  const [detailId, setDetailId] = useState(null);
  const [toast, setToast] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [counts, setCounts] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(h);
  }, [toast]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    api("/api/stats")
      .then((s) => setCounts(s))
      .catch(() => setCounts(null));
  }, [refreshKey]);

  const navItems = NAV.map((n) =>
    n.key === "library" && counts
      ? { ...n, badge: counts.total }
      : n
  );

  return (
    <div className="flex min-h-screen bg-background-secondary-default">
      <div className="sticky top-0 h-screen shrink-0 p-3">
        <DashboardSidebar
          selected={tab}
          items={navItems.map((n) => ({
            ...n,
            href: `#${n.key}`,
          }))}
        />
      </div>
      {/* Sidebar rows render anchors; intercept to tab-switch instead. */}
      <NavInterceptor onNav={setTab} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-separator-border bg-background-primary-default px-5 py-3">
          <span className="text-headline-medium text-text-primary">Recall</span>
          <span className="text-caption-regular text-text-tertiary">
            private local memory · stays on this device
          </span>
          <span className="flex-1" />
          <span className="text-caption-regular text-text-tertiary">
            {counts ? `${counts.total} memories · ${counts.vectors} vectors` : "…"}
          </span>
          <ThemeToggle />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-5">
          {tab === "search" && <SearchPage onOpen={setDetailId} />}
          {tab === "upload" && (
            <UploadPage onToast={showToast} onChanged={refresh} />
          )}
          {tab === "library" && (
            <LibraryPage
              onOpen={setDetailId}
              onToast={showToast}
              refreshKey={refreshKey}
            />
          )}
          {tab === "models" && <ModelsPage onToast={showToast} />}
        </main>
      </div>
      <MemoryDialog
        id={detailId}
        onClose={() => setDetailId(null)}
        onDeleted={() => {
          setDetailId(null);
          refresh();
        }}
        onOpen={setDetailId}
        onToast={showToast}
      />
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-background-inverse-default px-5 py-2.5 text-body-medium text-text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/** BoardUI sidebar rows are anchors — capture clicks and tab-switch. */
function NavInterceptor({ onNav }) {
  useEffect(() => {
    function handler(e) {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const key = a.getAttribute("href").slice(1);
      if (["search", "upload", "library", "models"].includes(key)) {
        e.preventDefault();
        onNav(key);
      }
    }
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [onNav]);
  return null;
}
