import { useCallback, useEffect, useState } from "react";
import {
  RiImageLine,
  RiSearchLine,
  RiSettings3Line,
  RiUploadCloud2Line,
} from "@remixicon/react";
import { ThemeToggle } from "@/components/application/theme/theme-toggle";
import { api } from "./api.js";
import { SearchPage } from "./pages/SearchPage.jsx";
import { UploadPage } from "./pages/UploadPage.jsx";
import { LibraryPage } from "./pages/LibraryPage.jsx";
import { ModelsPage } from "./pages/ModelsPage.jsx";
import { MemoryDialog } from "./components/MemoryDialog.jsx";
import { RecallSidebar } from "./components/RecallSidebar.jsx";

const ICONS = {
  SearchIcon: RiSearchLine,
  UploadIcon: RiUploadCloud2Line,
  LibraryIcon: RiImageLine,
  ModelsIcon: RiSettings3Line,
};

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

  async function rebuild() {
    try {
      const r = await api("/api/rebuild", { method: "POST" });
      showToast(`Rebuilt ${r.rebuilt} vectors`);
      refresh();
    } catch (e) {
      showToast("Rebuild failed");
    }
  }

  return (
    <div className="flex min-h-screen gap-3 bg-background-secondary-default p-3">
      <div className="sticky top-3 h-[calc(100vh-24px)] shrink-0">
        <RecallSidebar
          tab={tab}
          onNav={setTab}
          counts={counts}
          onRebuild={rebuild}
          icons={ICONS}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <header className="flex items-center gap-3 rounded-3xl border border-border-card-default bg-background-primary-default px-5 py-3 shadow-xs">
          <span className="text-headline-medium text-text-primary">
            {tab === "search" && "Search"}
            {tab === "upload" && "Upload"}
            {tab === "library" && "Library"}
            {tab === "models" && "Models"}
          </span>
          <span className="text-caption-regular text-text-tertiary">
            private local memory · stays on this device
          </span>
          <span className="flex-1" />
          <span className="text-caption-regular text-text-tertiary">
            {counts ? `${counts.total} memories · ${counts.vectors} vectors` : "…"}
          </span>
          <ThemeToggle />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 pb-6">
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
