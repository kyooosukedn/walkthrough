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
import type { Route } from "../types.js";

const nodeTypes = { "codemap-default": DefaultNode };

const COLUMN_WIDTH = 460;
const ROW_HEIGHT = 92;

/**
 * RouteMap — pages and API endpoints with their import targets.
 *
 * Simple column layout: pages on the left, API endpoints on the right,
 * called files fan out to the far columns.
 */
export function RouteMap() {
  const { data, loading, error } = useCodeMap();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesState] = useEdgesState<Edge>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!data?.routes || initialized) return;

    const { nodes: n, edges: e } = routesToGraph(data.routes);
    setNodes(n);
    setEdges(e);
    setInitialized(true);
  }, [data, initialized, setNodes, setEdges, onEdgesState]);

  if (loading) {
    return <div style={centerStyle}>Mapping your routes...</div>;
  }

  if (error) {
    return (
      <div style={{ ...centerStyle, flexDirection: "column", gap: 8 }}>
        <span style={{ color: "var(--accent-route)" }}>Failed to load codemap.json</span>
        <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{error}</span>
      </div>
    );
  }

  if (!data?.routes?.length) {
    return <div style={centerStyle}>No routes detected in this project.</div>;
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

function routesToGraph(routes: Route[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const fileNodeIds = new Set<string>();

  const isApi = (r: Route) => r.file.includes("route.") || r.file.includes("api");
  const pages = routes.filter((r) => !isApi(r));
  const apis = routes.filter(isApi);

  const column = (items: Route[], x: number, nodeType: "page" | "api") => {
    items.slice(0, 40).forEach((route, i) => {
      const id = `route:${route.method}:${route.path}`;
      nodes.push({
        id,
        type: "codemap-default",
        position: { x, y: i * ROW_HEIGHT },
        data: {
          label: nodeType === "page" ? route.path : `${route.method} ${route.path}`,
          filePath: route.file,
          nodeType,
        },
      });

      for (const call of route.calls ?? []) {
        if (!fileNodeIds.has(call)) {
          fileNodeIds.add(call);
          nodes.push({
            id: `file:${call}`,
            type: "codemap-default",
            position: { x: x + COLUMN_WIDTH, y: fileNodeIds.size * 64 },
            data: { label: call.split("/").pop() ?? call, filePath: call, nodeType: "library" },
          });
        }
        edges.push({
          id: `edge:${id}->${call}`,
          source: id,
          target: `file:${call}`,
          animated: false,
        });
      }
    });
  };

  column(pages, 0, "page");
  column(apis, COLUMN_WIDTH * 2 + 80, "api");

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
