import { useEffect, useState } from "react";
import {
  Cpu,
  Database,
  Download,
  Save,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Switch } from "@/components/base/switch/switch";
import { PageHeader } from "../components/PageHeader.jsx";
import {
  exportMemories,
  fetchSettings,
  importMemories,
  optimizeIndex,
  updateSettings,
} from "../api.js";

export function SettingsPage({ onToast, onRefresh }) {
  const [settings, setSettings] = useState({
    w_dense: 0.6,
    w_bm25: 0.4,
    rrf_k: 60,
    recency_half_life_days: 30,
    candidate_k: 50,
    ocr_enabled: true,
    caption_enabled: true,
    autotag_enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then((data) => {
        if (data) setSettings((prev) => ({ ...prev, ...data }));
      })
      .catch(() => onToast("Could not load settings"))
      .finally(() => setLoading(false));
  }, [onToast]);

  async function handleSaveSettings() {
    setSaving(true);
    try {
      const updated = await updateSettings(settings);
      setSettings(updated);
      onToast("Settings saved successfully");
    } catch (err) {
      onToast("Failed to save settings: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleOptimize() {
    setOptimizing(true);
    try {
      const res = await optimizeIndex();
      onToast(`Optimized index: ${res.reclaimed_bytes} bytes reclaimed`);
      onRefresh?.();
    } catch (err) {
      onToast("Database optimization failed");
    } finally {
      setOptimizing(false);
    }
  }

  async function handleExport() {
    try {
      const data = await exportMemories();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recall-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onToast(`Exported ${data.count} memories`);
    } catch (err) {
      onToast("Export failed");
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const list = Array.isArray(json) ? json : json.memories || [];
      if (!list.length) {
        onToast("No valid memories found in file");
        return;
      }
      const res = await importMemories(list);
      onToast(`Imported ${res.imported} memories (${res.skipped} skipped)`);
      onRefresh?.();
    } catch (err) {
      onToast("Import failed: " + err.message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Unified Bento Header */}
      <PageHeader
        title="Settings & Tools"
        subtitle="Configure hybrid search parameters, AI ingestion, and data management."
        actions={
          <Button
            variant="primary"
            size="sm"
            leadingIcon={Save}
            onClick={handleSaveSettings}
            disabled={saving || loading}
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        }
      />

      {/* Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bento Card 1: Retrieval & Search Weights */}
        <div className="rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-xs flex flex-col gap-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-border-button-default">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-500/10 text-accent-500">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-headline-medium text-text-primary">
                Search & Ranking Weights
              </h2>
              <p className="text-caption-regular text-text-secondary">
                Control balance between semantic meaning and exact keywords.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label className="text-body-medium font-medium text-text-primary">
                Semantic (Dense Vector) Weight
              </label>
              <span className="font-semibold text-accent-500">
                {Number(settings.w_dense).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.w_dense}
              onChange={(e) =>
                setSettings({ ...settings, w_dense: parseFloat(e.target.value) })
              }
              className="accent-accent-500 cursor-pointer"
            />
            <span className="text-caption-regular text-text-tertiary">
              Higher value prioritizes conceptual similarity over exact keyword matching.
            </span>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <div className="flex justify-between items-center">
              <label className="text-body-medium font-medium text-text-primary">
                Lexical (BM25 Keyword) Weight
              </label>
              <span className="font-semibold text-accent-500">
                {Number(settings.w_bm25).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.w_bm25}
              onChange={(e) =>
                setSettings({ ...settings, w_bm25: parseFloat(e.target.value) })
              }
              className="accent-accent-500 cursor-pointer"
            />
            <span className="text-caption-regular text-text-tertiary">
              Higher value prioritizes literal words, symbols, and code names.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border-button-default">
            <div className="flex flex-col gap-1.5">
              <label className="text-caption-1-semibold text-text-secondary">
                Recency Half-Life (Days)
              </label>
              <Input
                type="number"
                min="1"
                max="365"
                value={String(settings.recency_half_life_days)}
                onChange={(v) =>
                  setSettings({
                    ...settings,
                    recency_half_life_days: parseInt(v, 10) || 30,
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-caption-1-semibold text-text-secondary">
                Candidate Pool (k)
              </label>
              <Input
                type="number"
                min="10"
                max="200"
                value={String(settings.candidate_k)}
                onChange={(v) =>
                  setSettings({
                    ...settings,
                    candidate_k: parseInt(v, 10) || 50,
                  })
                }
              />
            </div>
          </div>
        </div>

        {/* Right Column: AI Toggles + Backup/Storage */}
        <div className="flex flex-col gap-6">
          {/* Bento Card 2: AI Pipeline Toggles */}
          <div className="rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-xs flex flex-col gap-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-border-button-default">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-500/10 text-accent-500">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-headline-medium text-text-primary">
                  Ingestion Pipeline Engines
                </h2>
                <p className="text-caption-regular text-text-secondary">
                  Enable or disable local AI extraction stages.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-background-secondary-default/40 border border-border-button-default">
                <div>
                  <div className="text-body-small font-semibold text-text-primary">
                    Tesseract OCR Engine
                  </div>
                  <div className="text-caption-regular text-text-tertiary">
                    Extracts embedded text from screenshots and PDF pages.
                  </div>
                </div>
                <Switch
                  aria-label="Tesseract OCR Engine"
                  isSelected={settings.ocr_enabled}
                  onChange={(checked) =>
                    setSettings({ ...settings, ocr_enabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-background-secondary-default/40 border border-border-button-default">
                <div>
                  <div className="text-body-small font-semibold text-text-primary">
                    BLIP Vision-Language Captioning
                  </div>
                  <div className="text-caption-regular text-text-tertiary">
                    Generates descriptive captions for images without alt tags.
                  </div>
                </div>
                <Switch
                  aria-label="BLIP Vision Captioning"
                  isSelected={settings.caption_enabled}
                  onChange={(checked) =>
                    setSettings({ ...settings, caption_enabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-background-secondary-default/40 border border-border-button-default">
                <div>
                  <div className="text-body-small font-semibold text-text-primary">
                    Automatic Entity & Topic Tagging
                  </div>
                  <div className="text-caption-regular text-text-tertiary">
                    Infers hashtags from salient entities and content structure.
                  </div>
                </div>
                <Switch
                  aria-label="Automatic Tagging"
                  isSelected={settings.autotag_enabled}
                  onChange={(checked) =>
                    setSettings({ ...settings, autotag_enabled: checked })
                  }
                />
              </div>
            </div>
          </div>

          {/* Bento Card 3: Storage & Maintenance */}
          <div className="rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-xs flex flex-col gap-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-border-button-default">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-500/10 text-accent-500">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-headline-medium text-text-primary">
                  Data Backup & Optimization
                </h2>
                <p className="text-caption-regular text-text-secondary">
                  Export backups, import JSON libraries, or reclaim storage.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={Download}
                onClick={handleExport}
              >
                Export JSON Backup
              </Button>

              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleImportFile}
                  disabled={importing}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={Upload}
                  disabled={importing}
                  className="pointer-events-none"
                >
                  {importing ? "Importing…" : "Import JSON Backup"}
                </Button>
              </label>

              <Button
                variant="secondary"
                size="sm"
                leadingIcon={Sparkles}
                onClick={handleOptimize}
                disabled={optimizing}
              >
                {optimizing ? "Optimizing…" : "Vacuum & Optimize DB"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
