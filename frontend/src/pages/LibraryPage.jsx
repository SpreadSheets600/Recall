import { useEffect, useState } from "react";
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
import { Chip } from "@/components/base/badges/chip";
import { api, fmtDate } from "../api.js";

export function LibraryPage({ onOpen, onToast, refreshKey }) {
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);

  async function load(t, query) {
    try {
      const params = new URLSearchParams({ type: t, q: query, limit: "100" });
      setItems(await api("/api/memories?" + params));
    } catch (e) {
      onToast("Library failed to load");
    }
  }

  useEffect(() => {
    load(type, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function remove(id) {
    if (!window.confirm("Delete this memory?")) return;
    try {
      await api(`/api/memories/${id}`, { method: "DELETE" });
      onToast("Deleted");
      load(type, q);
    } catch (e) {
      onToast("Delete failed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-title-2-medium text-text-primary">Library</h1>
        <p className="text-body-regular text-text-secondary">
          {items.length} memor{items.length === 1 ? "y" : "ies"} stored locally.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Select aria-label="Type filter" selectedKey={type} onSelectionChange={(k) => { setType(k); load(k, q); }}>
          {["", "image", "webpage", "pdf", "text", "markdown", "file"].map((t) => (
            <SelectItem key={t} id={t} textValue={t || "All types"}>
              {t || "All types"}
            </SelectItem>
          ))}
        </Select>
        <div className="min-w-44 flex-1">
          <Input aria-label="Filter" placeholder="filter by title or text…" value={q} onChange={setQ} />
        </div>
        <Button variant="secondary" onClick={() => load(type, q)}>
          Refresh
        </Button>
      </div>
      <Table aria-label="Memories">
        <TableHeader>
          <TableColumn>Title</TableColumn>
          <TableColumn>Type</TableColumn>
          <TableColumn>Source</TableColumn>
          <TableColumn>Saved</TableColumn>
          <TableColumn> </TableColumn>
        </TableHeader>
        <TableBody>
          {items.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <button
                  type="button"
                  className="cursor-pointer text-left text-body-medium text-text-primary underline-offset-2 hover:underline"
                  onClick={() => onOpen(m.id)}
                >
                  {m.title || "(untitled)"}
                </button>
              </TableCell>
              <TableCell>
                <Chip color="neutral">{m.type}</Chip>
              </TableCell>
              <TableCell>{m.domain || m.source || "—"}</TableCell>
              <TableCell>{fmtDate(m.created_at)}</TableCell>
              <TableCell>
                <Button variant="ghost" size="xs" onClick={() => remove(m.id)}>
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
