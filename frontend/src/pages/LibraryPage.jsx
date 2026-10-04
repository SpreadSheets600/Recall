import { useEffect, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  RotateCw,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/base/badges/badge";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select, SelectItem } from "@/components/base/select/select";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/base/table/table";
import { PageHeader } from "../components/PageHeader.jsx";
import {
  api,
  batchDeleteMemories,
  deleteMemory,
  exportMemories,
  fmtDate,
  tagList,
} from "../api.js";

const TYPE_OPTIONS = [
  { id: "", label: "All types" },
  { id: "image", label: "Images" },
  { id: "webpage", label: "Web pages" },
  { id: "pdf", label: "PDFs" },
  { id: "text", label: "Text & Notes" },
  { id: "markdown", label: "Markdown" },
  { id: "file", label: "Files" },
];

export function LibraryPage({
  onOpen,
  onToast,
  refreshKey,
  lastDeletedId = null,
  onChanged,
}) {
  const [items, setItems] = useState([]);
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const filterTimer = useRef(null);

  useEffect(() => () => clearTimeout(filterTimer.current), []);

  function debouncedFilter(t, val) {
    setQ(val);
    clearTimeout(filterTimer.current);
    filterTimer.current = setTimeout(() => load(t, val), 250);
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
    } catch {
      onToast("Export failed");
    }
  }

  async function load(t, query) {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (t) qs.set("type", t);
      if (query) qs.set("q", query);
      qs.set("limit", "100");
      const data = await api(`/api/memories?${qs}`);
      const list = Array.isArray(data) ? data : data.memories || [];
      setItems(list);
    } catch {
      onToast("Failed to load memories");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(type, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    if (lastDeletedId != null) {
      setItems((prev) => prev.filter((m) => m.id !== lastDeletedId));
      setSelectedIds((prev) => {
        if (prev.has(lastDeletedId)) {
          const next = new Set(prev);
          next.delete(lastDeletedId);
          return next;
        }
        return prev;
      });
    }
  }, [lastDeletedId]);

  async function removeSingle(id) {
    if (!window.confirm("Permanently delete this memory?")) return;
    setItems((prev) => prev.filter((m) => m.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      await deleteMemory(id);
      onToast("Deleted memory");
      onChanged?.();
    } catch {
      onToast("Delete failed");
      load(type, q);
    }
  }

  async function handleBatchDelete() {
    const idsToDelete = Array.from(selectedIds);
    const count = idsToDelete.length;
    if (count === 0) return;
    if (!window.confirm(`Delete ${count} selected memor${count === 1 ? "y" : "ies"}?`)) {
      return;
    }
    const deleteSet = new Set(idsToDelete);
    setItems((prev) => prev.filter((m) => !deleteSet.has(m.id)));
    setSelectedIds(new Set());
    try {
      await batchDeleteMemories(idsToDelete);
      onToast(`Deleted ${count} memories`);
      onChanged?.();
    } catch {
      onToast("Batch delete failed");
      load(type, q);
    }
  }

  function toggleSelectAll() {
    if (selectedIds.size === items.length && items.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((m) => m.id)));
    }
  }

  function toggleSelectOne(id) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Unified Bento Header (No memory count pills) */}
      <PageHeader
        title="Memory Library"
        subtitle="Inspect, filter, and manage all your locally preserved memories."
        actions={
          <>
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                leadingIcon={Trash2}
                onClick={handleBatchDelete}
                className="bg-red-600 hover:bg-red-700 text-white font-medium"
              >
                Delete Selected ({selectedIds.size})
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={Download}
              onClick={handleExport}
            >
              Export JSON
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={RotateCw}
              onClick={() => load(type, q)}
              disabled={loading}
            >
              Refresh
            </Button>
          </>
        }
      />

      {/* Bento Controls Card */}
      <div className="rounded-2xl border border-border-button-default bg-background-primary-default p-4 shadow-xs flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <Input
            aria-label="Filter memories"
            placeholder="Filter memories by keyword or title…"
            value={q}
            onChange={(val) => debouncedFilter(type, val)}
            leadingIcon={Search}
          />
        </div>
        <div className="w-48">
          <Select
            aria-label="Type filter"
            selectedKey={type}
            onSelectionChange={(k) => {
              setType(k);
              load(k, q);
            }}
          >
            {TYPE_OPTIONS.map((t) => (
              <SelectItem key={t.id} id={t.id} textValue={t.label}>
                {t.label}
              </SelectItem>
            ))}
          </Select>
        </div>
      </div>

      {/* Table Card */}
      <div className="rounded-2xl border border-border-button-default bg-background-primary-default overflow-hidden shadow-xs">
        <Table aria-label="Memories table">
          <TableHeader>
            <TableColumn className="w-12">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={items.length > 0 && selectedIds.size === items.length}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-border-button-default text-accent-500 focus:ring-accent-500/20"
              />
            </TableColumn>
            <TableColumn className="w-16">ID</TableColumn>
            <TableColumn className="w-28">Type</TableColumn>
            <TableColumn>Title / Content</TableColumn>
            <TableColumn className="w-44">Source</TableColumn>
            <TableColumn className="w-36">Created</TableColumn>
            <TableColumn className="w-20 text-right">Actions</TableColumn>
          </TableHeader>
          <TableBody>
            {items.map((m) => {
              const isSelected = selectedIds.has(m.id);
              return (
                <TableRow
                  key={m.id}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? "bg-accent-500/5" : "hover:bg-background-secondary-default/50"
                  }`}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select memory ${m.id}`}
                      checked={isSelected}
                      onChange={() => toggleSelectOne(m.id)}
                      className="h-4 w-4 rounded border-border-button-default text-accent-500 focus:ring-accent-500/20"
                    />
                  </TableCell>
                  <TableCell className="font-mono text-caption-medium text-text-tertiary">
                    #{m.id}
                  </TableCell>
                  <TableCell>
                    <Badge color="neutral">{m.type}</Badge>
                  </TableCell>
                  <TableCell onClick={() => onOpen(m.id)}>
                    <div className="font-medium text-text-primary hover:text-accent-500 transition-colors">
                      {m.title || "(untitled)"}
                    </div>
                    <div className="text-caption-regular text-text-secondary truncate max-w-xl">
                      {m.content?.slice(0, 100) || m.description || "—"}
                    </div>
                    {tagList(m.tags).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {tagList(m.tags).map((t) => (
                          <span
                            key={t}
                            className="text-caption-2-medium text-text-tertiary"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-caption-regular text-text-secondary truncate block max-w-[160px]">
                      {m.domain || m.source || "local"}
                    </span>
                  </TableCell>
                  <TableCell className="text-caption-regular text-text-tertiary">
                    {fmtDate(m.created_at)}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onOpen(m.id)}
                        title="View details"
                        className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-background-secondary-default transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSingle(m.id)}
                        title="Delete memory"
                        className="p-1.5 rounded-lg text-text-tertiary hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {items.length === 0 && !loading && (
          <div className="p-12 text-center text-text-tertiary text-body-medium">
            No memories match your filter criteria.
          </div>
        )}
      </div>
    </div>
  );
}
