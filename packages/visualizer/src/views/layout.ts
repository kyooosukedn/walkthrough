import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { Node, Edge } from "@xyflow/react";
import type { FileTreeNode } from "../types";

const elk = new ELK();

const ELK_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.spacing.nodeNode": "60",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
};

/**
 * Convert a FileTreeNode tree into React Flow nodes + edges,
 * auto-layouted with ELK.
 *
 * Strategy: group by top-level directories. Each directory becomes a node.
 * Files inside are shown as child nodes.
 */
export async function treeToGraph(
  tree: FileTreeNode,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  // Dot-files and dot-folders (.github, .vscode, .env...) are tooling noise on
  // an architecture map; they stay reachable through search and the file tree.
  const children = (tree.children ?? []).filter((c) => !c.name.startsWith("."));

  // Collect top-level items as nodes
  const elkNodes: ElkNode[] = [];
  const elkEdges: { id: string; sources: string[]; targets: string[] }[] = [];

  for (const child of children) {
    const nodeId = child.path;

    if (child.type === "directory") {
      // Directory node
      elkNodes.push({
        id: nodeId,
        width: 200,
        height: 80,
      });

      // Add edges to its children
      for (const sub of child.children ?? []) {
        if (sub.type === "directory") {
          elkNodes.push({
            id: sub.path,
            width: 200,
            height: 80,
          });
          elkEdges.push({
            id: `e-${nodeId}-${sub.path}`,
            sources: [nodeId],
            targets: [sub.path],
          });
        }
      }
    } else {
      // File node at root
      elkNodes.push({
        id: nodeId,
        width: 200,
        height: 60,
      });
    }
  }

  // Run ELK layout
  const root: ElkNode = {
    id: "root",
    layoutOptions: ELK_OPTIONS,
    children: elkNodes,
    edges: elkEdges,
  };

  const layouted = await elk.layout(root);

  // Convert ELK output to React Flow
  const nodes: Node[] = (layouted.children ?? []).map((n) => {
    const original = children.find((c: FileTreeNode) => c.path === n.id)
      ?? children.flatMap((c: FileTreeNode) => c.children ?? []).find((c: FileTreeNode) => c.path === n.id);

    const nodeType = inferNodeType(original);
    const label = original?.name ?? n.id;

    return {
      id: n.id,
      position: { x: n.x ?? 0, y: n.y ?? 0 },
      type: "codemap-default",
      data: {
        label,
        filePath: original?.path,
        nodeType,
      },
      width: n.width,
      height: n.height,
    };
  });

  const edges: Edge[] = (layouted.edges ?? []).map((e) => ({
    id: e.id,
    source: e.sources[0],
    target: e.targets[0],
    type: "smoothstep",
    style: { stroke: "var(--border-active)", strokeWidth: 1.5 },
  }));

  return { nodes, edges };
}

/** Infer node type from file/directory name */
function inferNodeType(node?: FileTreeNode): string {
  if (!node) return "library";
  if (node.type === "directory") return "library";

  const name = node.name.toLowerCase();
  const ext = node.extension?.toLowerCase() ?? "";

  if (name.includes("route") || name.includes("api")) return "api";
  if (name.includes("page") || name === "layout.tsx") return "page";
  if (name.includes("component") || name.includes("components")) return "component";
  if (name.includes("migration") || name.includes("schema")) return "database";
  if (name.includes("service") || name.includes("lib/ai")) return "service";
  if (name.includes("config") || name.includes(".config")) return "config";
  if (name.includes("middleware")) return "middleware";
  if (ext === ".tsx" || ext === ".jsx") return "component";
  if (ext === ".ts" || ext === ".js") return "library";

  return "library";
}
