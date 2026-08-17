import { useState, useEffect, useCallback } from "react";
import {
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import { useCodeMap } from "../data/context.js";
import { GraphCanvas } from "../graph/index.js";
import { DefaultNode } from "../graph/nodes/DefaultNode.tsx";
import { treeToGraph } from "./layout.js";
import { useTourTransitions } from "../tour/useTourTransitions.js";
import type { TourState } from "../tour/TourEngine.js";

const nodeTypes = { "codemap-default": DefaultNode };

interface SystemOverviewProps {
  tourState?: TourState | null;
}

export function SystemOverview({ tourState }: SystemOverviewProps) {
  const { data, loading, error } = useCodeMap();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!data?.fileTree || initialized) return;
    treeToGraph(data.fileTree).then(({ nodes: n, edges: e }) => {
      setNodes(n);
      setEdges(e);
      setInitialized(true);
    });
  }, [data, initialized, setNodes, setEdges]);

  // Apply tour transitions
  useTourTransitions(tourState ?? null);

  if (loading) {
    return (
      <div style={centerStyle}>
        Mapping your architecture...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...centerStyle, flexDirection: "column", gap: 8 }}>
        <span style={{ color: "var(--accent-route)" }}>Failed to load codemap.json</span>
        <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{error}</span>
      </div>
    );
  }

  return (
    <GraphCanvas
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
    />
  );
}

const centerStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--bg-deep)",
  color: "var(--text-muted)",
  fontFamily: "var(--font-body)",
  fontSize: 16,
};
