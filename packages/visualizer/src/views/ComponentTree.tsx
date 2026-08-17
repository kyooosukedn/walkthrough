import { useEffect, useState } from "react";
import {
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import { useCodeMap } from "../data/context.js";
import { GraphCanvas } from "../graph/index.js";
import { DefaultNode } from "../graph/nodes/DefaultNode.tsx";
import type { Component } from "../types.js";

const nodeTypes = { "codemap-default": DefaultNode };

const COLUMN_WIDTH = 340;
const ROW_HEIGHT = 76;

/**
 * ComponentTree — React components layered by dependency depth.
 *
 * Pages sit in the leftmost column; each import hop steps one column right,
 * so the UI composition hierarchy reads left → right.
 */
export function ComponentTree() {
  const { data, loading, error } = useCodeMap();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesState] = useEdgesState<Edge>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!data?.components || initialized) return;

    const { nodes: n, edges: e } = componentsToGraph(data.components);
    setNodes(n);
    setEdges(e);
    setInitialized(true);
  }, [data, initialized, setNodes, setEdges, onEdgesState]);

  if (loading) {
    return <div style={centerStyle}>Mapping your components...</div>;
  }

  if (error) {
    return (
      <div style={{ ...centerStyle, flexDirection: "column", gap: 8 }}>
        <span style={{ color: "var(--accent-route)" }}>Failed to load codemap.json</span>
        <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{error}</span>
      </div>
    );
  }

  if (!data?.components?.length) {
    return <div style={centerStyle}>No React components detected in this project.</div>;
  }

  return (
    <GraphCanvas
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesState}
      nodeTypes={nodeTypes}
    />
  );
}

function componentsToGraph(components: Component[]): { nodes: Node[]; edges: Edge[] } {
  // Key components by file — one node per file keeps the graph readable even
  // when a file exports several components.
  const byFile = new Map<string, Component[]>();
  for (const c of components) {
    const list = byFile.get(c.file) ?? [];
    list.push(c);
    byFile.set(c.file, list);
  }

  const importsOf = new Map<string, Set<string>>();
  for (const [, list] of byFile) {
    const set = importsOf.get(list[0].file) ?? new Set<string>();
    for (const c of list) {
      for (const target of c.imports) {
        if (byFile.has(target)) set.add(target);
      }
    }
    importsOf.set(list[0].file, set);
  }

  // Depth: BFS from page components, then longest-chain fallback for orphans.
  const depth = new Map<string, number>();
  const queue: Array<{ file: string; depth: number }> = [];
  for (const file of byFile.keys()) {
    if ((byFile.get(file) ?? []).some((c) => c.isPage)) {
      depth.set(file, 0);
      queue.push({ file, depth: 0 });
    }
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of importsOf.get(current.file) ?? []) {
      if (!depth.has(next) || depth.get(next)! > current.depth + 1) {
        depth.set(next, current.depth + 1);
        queue.push({ file: next, depth: current.depth + 1 });
      }
    }
  }
  const orphanDepth = (depth.size > 0 ? Math.max(...depth.values()) : -1) + 1;
  for (const file of byFile.keys()) {
    if (!depth.has(file)) depth.set(file, orphanDepth);
  }

  const perColumn = new Map<number, number>();
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (const [file, list] of byFile) {
    const d = depth.get(file) ?? 0;
    const row = perColumn.get(d) ?? 0;
    perColumn.set(d, row + 1);

    const isPage = list.some((c) => c.isPage);
    nodes.push({
      id: file,
      type: "codemap-default",
      position: { x: d * COLUMN_WIDTH, y: row * ROW_HEIGHT },
      data: {
        label: list.length === 1 ? list[0].name : `${list[0].name} +${list.length - 1}`,
        filePath: file,
        nodeType: isPage ? "page" : "component",
      },
    });

    for (const target of importsOf.get(file) ?? []) {
      edges.push({
        id: `edge:${file}->${target}`,
        source: file,
        target,
        animated: false,
      });
    }
  }

  return { nodes, edges };
}

const centerStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--text-muted)",
};
