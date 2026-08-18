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
import type { Table } from "../types.js";

const nodeTypes = { "codemap-default": DefaultNode };

const COLUMN_WIDTH = 360;
const ROW_HEIGHT = 88;

/**
 * DatabaseSchemaView — an ER overview: one node per table, edges for
 * relations. Tables referenced by others sit leftmost (they are the
 * backbone: users, profiles, lookups); dependents fan out rightward.
 */
export function DatabaseSchemaView() {
  const { data, loading, error } = useCodeMap();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesState] = useEdgesState<Edge>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!data?.database || initialized) return;

    const { nodes: n, edges: e } = schemaToGraph(data.database);
    setNodes(n);
    setEdges(e);
    setInitialized(true);
  }, [data, initialized, setNodes, setEdges, onEdgesState]);

  if (loading) {
    return <div style={centerStyle}>Mapping your database...</div>;
  }

  if (error) {
    return (
      <div style={{ ...centerStyle, flexDirection: "column", gap: 8 }}>
        <span style={{ color: "var(--accent-route)" }}>Failed to load codemap.json</span>
        <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{error}</span>
      </div>
    );
  }

  if (!data?.database?.tables?.length) {
    return <div style={centerStyle}>No database schema detected in this project.</div>;
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

function schemaToGraph(db: { tables: Table[] }): { nodes: Node[]; edges: Edge[] } {
  const references = new Map<string, Set<string>>();

  for (const table of db.tables) {
    for (const relation of table.relations) {
      if (!references.has(relation.to)) references.set(relation.to, new Set());
      references.get(relation.to)!.add(table.name);
    }
  }

  // Column = how many OTHER tables reference this one (fan-in backbone).
  const fanIn = (name: string) => references.get(name)?.size ?? 0;
  const sorted = [...db.tables].sort((a, b) => fanIn(b.name) - fanIn(a.name));

  const PER_COLUMN = Math.max(6, Math.ceil(Math.sqrt(sorted.length)));
  const nodes: Node[] = sorted.map((table, i) => ({
    id: table.name,
    type: "codemap-default",
    position: {
      x: Math.floor(i / PER_COLUMN) * COLUMN_WIDTH,
      y: (i % PER_COLUMN) * ROW_HEIGHT,
    },
    data: {
      label: `${table.name} · ${table.columns.length} cols`,
      nodeType: "database",
    },
  }));

  const tableNames = new Set(db.tables.map((t) => t.name));
  const edges: Edge[] = [];
  let edgeIndex = 0;
  for (const table of db.tables) {
    const seen = new Set<string>();
    for (const relation of table.relations) {
      if (!tableNames.has(relation.to) || seen.has(relation.to)) continue;
      seen.add(relation.to);
      edges.push({
        id: `edge:${edgeIndex++}`,
        source: table.name,
        target: relation.to,
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
