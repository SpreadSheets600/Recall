import { useCallback, useEffect, useState } from "react";
import { api, fetchStats } from "./api.js";
import { RecallNavbar } from "./components/RecallNavbar.jsx";
import { RecallSidebar } from "./components/RecallSidebar.jsx";
import { MemoryDialog } from "./components/MemoryDialog.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { SearchPage } from "./pages/SearchPage.jsx";
import { UploadPage } from "./pages/UploadPage.jsx";
import { LibraryPage } from "./pages/LibraryPage.jsx";
import { KnowledgeGraphPage } from "./pages/KnowledgeGraphPage.jsx";
import { ModelsPage } from "./pages/ModelsPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";

export function App() {
  const [tab, setTab] = useState("dashboard");
  const [detailId, setDetailId] = useState(null);
  const [toast, setToast] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastDeletedId, setLastDeletedId] = useState(null);
  const [counts, setCounts] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("recall_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");

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
    fetchStats()
      .then((s) => setCounts(s))
      .catch(() => setCounts(null));
  }, [refreshKey]);

  function handleToggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("recall_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  }

  function handleGlobalSearchSubmit() {
    if (tab !== "search") {
      setTab("search");
    }
  }

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
    <div className="min-h-screen bg-background-secondary-default text-text-primary antialiased flex flex-col">
      {/* Docked Collapsible Sidebar */}
      <RecallSidebar
        tab={tab}
        onNav={setTab}
        counts={counts}
        onRebuild={rebuild}
        collapsed={sidebarCollapsed}
      />

      {/* Main Content Area */}
      <div
        style={{ marginLeft: sidebarCollapsed ? 68 : 240 }}
        className="flex-1 min-w-0 flex flex-col transition-[margin-left] duration-200 ease-in-out"
      >
        <RecallNavbar
          tab={tab}
          onNav={setTab}
          counts={counts}
          onToggleSidebar={handleToggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
          globalSearchQuery={globalSearchQuery}
          onGlobalSearchChange={(q) => {
            setGlobalSearchQuery(q);
            if (tab !== "search" && q) {
              setTab("search");
            }
          }}
          onGlobalSearchSubmit={handleGlobalSearchSubmit}
        />

        <main className="w-full max-w-7xl mx-auto p-6 lg:p-8 flex-1 space-y-6">
          {tab === "dashboard" && (
            <DashboardPage
              counts={counts}
              onNav={setTab}
              onOpen={setDetailId}
              onToast={showToast}
              onRefresh={refresh}
              lastDeletedId={lastDeletedId}
            />
          )}

          {tab === "search" && (
            <SearchPage
              onOpen={setDetailId}
              initialQuery={globalSearchQuery}
              lastDeletedId={lastDeletedId}
              onChanged={refresh}
            />
          )}

          {tab === "graph" && (
            <KnowledgeGraphPage
              onOpen={setDetailId}
              onSearchNav={(term) => {
                setGlobalSearchQuery(term);
                setTab("search");
              }}
              onToast={showToast}
            />
          )}

          {tab === "upload" && (
            <UploadPage onToast={showToast} onChanged={refresh} />
          )}

          {tab === "library" && (
            <LibraryPage
              onOpen={setDetailId}
              onToast={showToast}
              refreshKey={refreshKey}
              lastDeletedId={lastDeletedId}
              onChanged={refresh}
            />
          )}

          {tab === "models" && <ModelsPage onToast={showToast} />}

          {tab === "settings" && (
            <SettingsPage onToast={showToast} onRefresh={refresh} />
          )}
        </main>
      </div>

      {/* Memory Detail Dialog */}
      <MemoryDialog
        id={detailId}
        onClose={() => setDetailId(null)}
        onDeleted={(deletedId) => {
          if (deletedId) setLastDeletedId(deletedId);
          setDetailId(null);
          showToast("Memory deleted");
          refresh();
        }}
        onOpen={setDetailId}
        onToast={showToast}
      />

      {/* Global Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 rounded-xl bg-background-primary-default px-4 py-2.5 text-body-small text-text-primary shadow-lg border border-border-button-default animate-in fade-in slide-in-from-bottom-2"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
