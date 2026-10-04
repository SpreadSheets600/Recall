import { useEffect, useState } from "react";
import {
  RiCpuLine,
  RiDatabase2Line,
  RiEyeLine,
  RiFileTextLine,
  RiImageLine,
  RiSearchLine,
} from "@remixicon/react";
import { StatCards } from "@/components/application/dashboard/stat-cards";
import { Badge } from "@/components/base/badges/badge";
import { Button } from "@/components/base/buttons/button";
import { api, fmtKB } from "../api.js";

const ICONS = {
  embed: RiCpuLine,
  caption: RiEyeLine,
  ocr: RiFileTextLine,
  vector_index: RiDatabase2Line,
  lexical: RiSearchLine,
  imaging: RiImageLine,
};

const LABELS = {
  embed: "Text embeddings",
  caption: "Image captioning",
  ocr: "OCR",
  vector_index: "Vector index",
  lexical: "Lexical search",
  imaging: "Image I/O",
};

export function ModelsPage({ onToast }) {
  const [models, setModels] = useState(null);
  const [stats, setStats] = useState(null);

  async function load() {
    try {
      const [m, s] = await Promise.all([api("/api/models"), api("/api/stats")]);
      setModels(m);
      setStats(s);
    } catch (e) {
      onToast("Models unavailable");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function rebuild() {
    try {
      const r = await api("/api/rebuild", { method: "POST" });
      onToast(`Rebuilt ${r.rebuilt} vectors`);
      load();
    } catch (e) {
      onToast("Rebuild failed");
    }
  }

  const cards = stats
    ? [
        { icon: RiDatabase2Line, label: "Memories", value: String(stats.total), delta: `${stats.vectors} vectors`, deltaColor: "neutral" },
        { icon: RiFileTextLine, label: "Database", value: fmtKB(stats.db_bytes), delta: `${stats.uploads ?? 0} uploads`, deltaColor: "neutral" },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-title-2-medium text-text-primary">Models &amp; storage</h1>
        <p className="text-body-regular text-text-secondary">
          Everything runs on this machine. AI models work at ingest time — search stays fast and offline.
        </p>
      </div>

      {cards.length > 0 && <StatCards stats={cards} />}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {models &&
          Object.entries(models).map(([k, m]) => (
            <div
              key={k}
              className="rounded-3lg border border-border-card-default bg-background-primary-default p-4 shadow-xs"
            >
              <h2 className="text-headline-medium text-text-primary">{LABELS[k] || k}</h2>
              <p className="text-body-medium text-text-primary">{m.name}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge color={m.ready ? "primary" : "neutral"}>
                  {m.ready ? "ready" : "fallback"}
                </Badge>
                {m.active_backend && <Badge color="neutral">{m.active_backend}</Badge>}
                {m.dim && <Badge color="neutral">{m.dim}d</Badge>}
              </div>
              <p className="mt-1 text-caption-regular text-text-tertiary">
                {[m.library, m.size, m.license].filter(Boolean).join(" · ")}
              </p>
              {m.note && <p className="mt-1 text-body-regular text-text-secondary">{m.note}</p>}
            </div>
          ))}
      </div>

      <div className="rounded-3lg border border-border-card-default bg-background-primary-default p-4 shadow-xs">
        <h2 className="text-headline-medium text-text-primary">Index maintenance</h2>
        <p className="text-body-regular text-text-secondary">
          Rebuild re-embeds anything missing or stored at an old dimension, then rewrites the vector index.
        </p>
        <div className="mt-2">
          <Button variant="secondary" onClick={rebuild}>
            Rebuild index
          </Button>
        </div>
      </div>
    </div>
  );
}
