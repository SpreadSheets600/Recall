import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/base/badges/badge";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { PageHeader } from "../components/PageHeader.jsx";
import { api } from "../api.js";

const TYPE_COLORS = {
  term: { fill: "#6366f1", stroke: "#818cf8", glow: "rgba(99, 102, 241, 0.4)" },
  webpage: { fill: "#3b82f6", stroke: "#60a5fa", glow: "rgba(59, 130, 246, 0.4)" },
  image: { fill: "#a855f7", stroke: "#c084fc", glow: "rgba(168, 85, 247, 0.4)" },
  pdf: { fill: "#10b981", stroke: "#34d399", glow: "rgba(16, 185, 129, 0.4)" },
  text: { fill: "#f59e0b", stroke: "#fbbf24", glow: "rgba(245, 158, 11, 0.4)" },
  markdown: { fill: "#ec4899", stroke: "#f472b6", glow: "rgba(236, 72, 153, 0.4)" },
};

export function KnowledgeGraphPage({ onOpen, onSearchNav, onToast }) {
  const canvasRef = useRef(null);
  const [data, setData] = useState({ nodes: [], links: [], stats: {} });
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState("");
  const [showRings, setShowRings] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");

  // Physics simulation state refs
  const simRef = useRef({
    nodes: [],
    links: [],
    transform: { x: 0, y: 0, k: 1 },
    dragNode: null,
    hoverNode: null,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    animId: null,
  });

  async function loadGraph() {
    setLoading(true);
    try {
      const res = await api("/api/graph?min_terms=1&max_nodes=150");
      setData(res || { nodes: [], links: [] });
      initSimulation(res.nodes || [], res.links || []);
    } catch {
      onToast("Failed to load knowledge graph");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGraph();
    return () => {
      if (simRef.current.animId) {
        cancelAnimationFrame(simRef.current.animId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function initSimulation(rawNodes, rawLinks) {
    const canvas = canvasRef.current;
    const width = canvas ? canvas.clientWidth : 800;
    const height = canvas ? canvas.clientHeight : 600;
    const centerX = width / 2;
    const centerY = height / 2;

    const termNodes = rawNodes.filter((n) => n.type === "term");
    const memNodes = rawNodes.filter((n) => n.type === "memory");

    const simNodes = rawNodes.map((n) => {
      let x, y;
      if (n.type === "term") {
        const idx = termNodes.indexOf(n);
        const angle = (idx / Math.max(1, termNodes.length)) * 2 * Math.PI;
        const radius = 100 + (idx % 3) * 60;
        x = centerX + Math.cos(angle) * radius + (Math.random() - 0.5) * 20;
        y = centerY + Math.sin(angle) * radius + (Math.random() - 0.5) * 20;
      } else {
        const idx = memNodes.indexOf(n);
        const angle = (idx / Math.max(1, memNodes.length)) * 2 * Math.PI;
        const radius = 240 + (idx % 4) * 50;
        x = centerX + Math.cos(angle) * radius + (Math.random() - 0.5) * 30;
        y = centerY + Math.sin(angle) * radius + (Math.random() - 0.5) * 30;
      }
      return {
        ...n,
        x,
        y,
        vx: 0,
        vy: 0,
        radius: n.size || (n.type === "term" ? 14 : 7),
      };
    });

    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
    const simLinks = rawLinks
      .map((l) => ({
        ...l,
        sourceNode: nodeMap.get(l.source),
        targetNode: nodeMap.get(l.target),
      }))
      .filter((l) => l.sourceNode && l.targetNode);

    simRef.current.nodes = simNodes;
    simRef.current.links = simLinks;

    startSimulationLoop();
  }

  function startSimulationLoop() {
    if (simRef.current.animId) cancelAnimationFrame(simRef.current.animId);

    function step() {
      const { nodes, links, dragNode } = simRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const centerX = width / 2;
      const centerY = height / 2;

      // 1. Center attraction
      for (const n of nodes) {
        if (n === dragNode) continue;
        const dx = centerX - n.x;
        const dy = centerY - n.y;
        n.vx += dx * 0.0006;
        n.vy += dy * 0.0006;
      }

      // 2. Node-node repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy || 1;
          const minDist = a.radius + b.radius + 30;
          if (distSq < minDist * minDist * 4) {
            const dist = Math.sqrt(distSq);
            const force = (minDist * minDist) / (distSq * dist) * 0.8;
            const fx = dx * force;
            const fy = dy * force;
            if (a !== dragNode) {
              a.vx -= fx;
              a.vy -= fy;
            }
            if (b !== dragNode) {
              b.vx += fx;
              b.vy += fy;
            }
          }
        }
      }

      // 3. Link spring tension
      for (const l of links) {
        const s = l.sourceNode;
        const t = l.targetNode;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const desiredDist = l.type === "cooccurrence" ? 140 : 80;
        const force = (dist - desiredDist) * 0.003;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (s !== dragNode) {
          s.vx += fx;
          s.vy += fy;
        }
        if (t !== dragNode) {
          t.vx -= fx;
          t.vy -= fy;
        }
      }

      // 4. Dampen velocity and update position
      for (const n of nodes) {
        if (n === dragNode) continue;
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += n.vx;
        n.y += n.vy;
      }

      renderCanvas();
      simRef.current.animId = requestAnimationFrame(step);
    }

    simRef.current.animId = requestAnimationFrame(step);
  }

  function renderCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    // Handle high DPI
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const { nodes, links, transform, hoverNode } = simRef.current;
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    const qLower = filterQuery.trim().toLowerCase();
    const isMatching = (n) => {
      if (!qLower) return true;
      return (
        n.label.toLowerCase().includes(qLower) ||
        (n.full_title && n.full_title.toLowerCase().includes(qLower)) ||
        (n.domain && n.domain.toLowerCase().includes(qLower))
      );
    };

    const isTypeVisible = (n) => {
      if (typeFilter === "all") return true;
      if (typeFilter === "terms") return n.type === "term";
      if (typeFilter === "memories") return n.type === "memory";
      return n.group === typeFilter;
    };

    const activeNode = selectedNode || hoverNode;
    let connectedNodeIds = null;
    if (activeNode) {
      connectedNodeIds = new Set([activeNode.id]);
      for (const l of links) {
        if (l.sourceNode.id === activeNode.id) connectedNodeIds.add(l.targetNode.id);
        if (l.targetNode.id === activeNode.id) connectedNodeIds.add(l.sourceNode.id);
      }
    }

    for (const l of links) {
      const s = l.sourceNode;
      const t = l.targetNode;
      if (!isTypeVisible(s) || !isTypeVisible(t)) continue;

      const isConnected =
        connectedNodeIds && (s.id === activeNode.id || t.id === activeNode.id);
      const isDimmed = connectedNodeIds && !isConnected;

      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);

      if (isConnected) {
        ctx.strokeStyle = l.type === "cooccurrence" ? "#818cf8" : "#38bdf8";
        ctx.lineWidth = 2.5;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 8;
      } else if (isDimmed) {
        ctx.strokeStyle = "rgba(100, 116, 139, 0.05)";
        ctx.lineWidth = 0.5;
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle =
          l.type === "cooccurrence"
            ? "rgba(99, 102, 241, 0.2)"
            : "rgba(148, 163, 184, 0.12)";
        ctx.lineWidth = l.type === "cooccurrence" ? 1.5 : 1;
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
    }

    for (const n of nodes) {
      if (!isTypeVisible(n)) continue;

      const matches = isMatching(n);
      const isCurrentActive = activeNode && activeNode.id === n.id;
      const isConnected = connectedNodeIds && connectedNodeIds.has(n.id);
      const isDimmed = (connectedNodeIds && !isConnected) || (!matches && qLower);

      ctx.save();
      const style = TYPE_COLORS[n.group] || TYPE_COLORS.text;

      let r = n.radius;
      if (isCurrentActive) r *= 1.35;
      else if (isConnected) r *= 1.15;

      if ((isCurrentActive || isConnected || n.type === "term") && !isDimmed) {
        ctx.shadowColor = style.glow;
        ctx.shadowBlur = isCurrentActive ? 22 : 12;
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = isDimmed
        ? "rgba(51, 65, 85, 0.2)"
        : isCurrentActive
        ? style.stroke
        : style.fill;
      ctx.fill();

      ctx.lineWidth = isCurrentActive ? 3 : 1.5;
      ctx.strokeStyle = isDimmed ? "rgba(100, 116, 139, 0.2)" : style.stroke;
      ctx.stroke();

      if (showLabels && (isCurrentActive || isConnected || n.type === "term" || matches)) {
        ctx.font =
          n.type === "term"
            ? "600 11px system-ui, -apple-system, sans-serif"
            : "500 10px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isCurrentActive ? "#ffffff" : isDimmed ? "#64748b" : "#cbd5e1";

        const labelY = n.y + r + 11;
        ctx.fillText(n.label, n.x, labelY);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  function getCanvasCoords(e) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const { transform } = simRef.current;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    return {
      x: (clientX - transform.x) / transform.k,
      y: (clientY - transform.y) / transform.k,
      rawX: clientX,
      rawY: clientY,
    };
  }

  function findNodeAt(x, y) {
    const { nodes } = simRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = n.x - x;
      const dy = n.y - y;
      if (dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6)) {
        return n;
      }
    }
    return null;
  }

  function handleMouseDown(e) {
    const pos = getCanvasCoords(e);
    const node = findNodeAt(pos.x, pos.y);
    if (node) {
      simRef.current.dragNode = node;
      node.vx = 0;
      node.vy = 0;
    } else {
      simRef.current.isPanning = true;
      simRef.current.panStart = {
        x: pos.rawX - simRef.current.transform.x,
        y: pos.rawY - simRef.current.transform.y,
      };
    }
  }

  function handleMouseMove(e) {
    const pos = getCanvasCoords(e);
    const { dragNode, isPanning, panStart, transform } = simRef.current;

    if (dragNode) {
      dragNode.x = pos.x;
      dragNode.y = pos.y;
      dragNode.vx = 0;
      dragNode.vy = 0;
    } else if (isPanning) {
      transform.x = pos.rawX - panStart.x;
      transform.y = pos.rawY - panStart.y;
    } else {
      const node = findNodeAt(pos.x, pos.y);
      if (node !== simRef.current.hoverNode) {
        simRef.current.hoverNode = node;
      }
    }
  }

  function handleMouseUp(e) {
    const { dragNode, isPanning } = simRef.current;
    if (dragNode) {
      simRef.current.dragNode = null;
    }
    if (isPanning) {
      simRef.current.isPanning = false;
    }
    const pos = getCanvasCoords(e);
    const node = findNodeAt(pos.x, pos.y);
    if (node) {
      setSelectedNode((prev) => (prev?.id === node.id ? null : node));
    }
  }

  function handleWheel(e) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const { transform } = simRef.current;
    const nextK = Math.max(0.2, Math.min(4, transform.k * zoomFactor));

    transform.x = mouseX - (mouseX - transform.x) * (nextK / transform.k);
    transform.y = mouseY - (mouseY - transform.y) * (nextK / transform.k);
    transform.k = nextK;
  }

  function resetZoom() {
    simRef.current.transform = { x: 0, y: 0, k: 1 };
  }

  const connectedLinks = selectedNode
    ? (data.links || []).filter(
        (l) => l.source === selectedNode.id || l.target === selectedNode.id
      )
    : [];

  const connectedMemories = selectedNode
    ? (data.nodes || []).filter((n) => {
        if (n.type !== "memory") return false;
        return connectedLinks.some(
          (l) =>
            (l.source === n.id && l.target === selectedNode.id) ||
            (l.target === n.id && l.source === selectedNode.id)
        );
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      {/* Unified Bento Header (No count pills) */}
      <PageHeader
        title="Knowledge Graph"
        subtitle="Visual mesh connecting extracted keywords, entities, and memories."
        actions={
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={RefreshCw}
            onClick={loadGraph}
            disabled={loading}
          >
            Refresh
          </Button>
        }
      />

      {/* Bento Controls Card */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-button-default bg-background-primary-default p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="w-64">
            <Input
              aria-label="Filter graph nodes"
              placeholder="Filter keyword or memory…"
              value={filterQuery}
              onChange={setFilterQuery}
              leadingIcon={Search}
            />
          </div>

          {/* Type filters */}
          <div className="flex items-center gap-1.5">
            {[
              { id: "all", label: "All" },
              { id: "terms", label: "Keywords" },
              { id: "memories", label: "Memories" },
              { id: "webpage", label: "Webpages" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTypeFilter(f.id)}
                className={`rounded-xl px-3 py-1.5 text-caption-medium transition-all ${
                  typeFilter === f.id
                    ? "bg-accent-500 text-text-white shadow-2xs"
                    : "bg-background-secondary-default text-text-secondary hover:text-text-primary"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="tertiary"
            size="sm"
            leadingIcon={showLabels ? Eye : EyeOff}
            onClick={() => setShowLabels(!showLabels)}
          >
            Labels
          </Button>
          <Button variant="tertiary" size="sm" onClick={resetZoom}>
            Reset View
          </Button>
        </div>
      </div>

      {/* Graph Area & Details Panel */}
      <div className="relative h-[650px] w-full overflow-hidden rounded-3xl border border-border-button-default bg-[#0a0d14] shadow-xs">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          className="h-full w-full cursor-grab active:cursor-grabbing"
        />

        {/* Selected Node Sidebar Overlay */}
        {selectedNode && (
          <div className="absolute right-4 top-4 bottom-4 w-84 rounded-2xl border border-border-button-default/80 bg-background-primary-default/95 p-5 backdrop-blur-md shadow-lg flex flex-col gap-4 overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-caption-2-medium uppercase tracking-wider text-text-tertiary">
                  {selectedNode.type === "term" ? "Keyword Entity" : "Memory Document"}
                </span>
                <h3 className="text-title-3-bold text-text-primary mt-0.5">
                  {selectedNode.label}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="text-text-tertiary hover:text-text-primary text-body-large"
              >
                ✕
              </button>
            </div>

            {selectedNode.type === "memory" ? (
              <div className="flex flex-col gap-3">
                <p className="text-caption-regular text-text-secondary line-clamp-3">
                  {selectedNode.content || selectedNode.full_title}
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  leadingIcon={ExternalLink}
                  onClick={() => onOpen(selectedNode.memory_id)}
                >
                  Inspect Memory #{selectedNode.memory_id}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="text-caption-regular text-text-secondary">
                  Found across{" "}
                  <strong className="text-text-primary">
                    {connectedMemories.length}
                  </strong>{" "}
                  memory records.
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <span className="text-caption-1-semibold text-text-tertiary uppercase">
                    Connected Memories
                  </span>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {connectedMemories.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => onOpen(m.memory_id)}
                        className="rounded-xl border border-border-button-default bg-background-secondary-default/50 p-2.5 text-left text-caption-regular text-text-primary hover:border-accent-500 cursor-pointer transition-colors"
                      >
                        <div className="font-medium truncate">{m.label}</div>
                        {m.domain && (
                          <div className="text-caption-2-medium text-text-tertiary mt-0.5">
                            {m.domain}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={Search}
                  onClick={() => onSearchNav(selectedNode.label)}
                >
                  Search for "{selectedNode.label}"
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
