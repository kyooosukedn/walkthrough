import type { CodeMap, FileTreeNode } from "@walkthrough/scanner";
import { buildEvidence, type EvidenceFile } from "../explain/context.js";

export interface LessonContext {
  schemaVersion: 1;
  repo: {
    name: string;
    language: string;
    frameworks: string[];
    orientation: CodeMap["orientation"] | null;
  };
  selectedPath: string;
  files: EvidenceFile[];
  relationships: { dependencies: string[]; importers: string[] };
  limits: { maxFiles: 6; maxSourceCharacters: 48_000 };
}

export function scannedPaths(tree: FileTreeNode): Set<string> {
  const paths = new Set<string>();
  function visit(node: FileTreeNode): void {
    if (node.type === "file") paths.add(node.path);
    else for (const child of node.children ?? []) visit(child);
  }
  visit(tree);
  return paths;
}

export async function buildLessonContext(rootPath: string, selectedPath: string, codemap: CodeMap): Promise<LessonContext> {
  const allowedPaths = scannedPaths(codemap.fileTree);
  const evidence = await buildEvidence(rootPath, selectedPath, allowedPaths, codemap.imports);
  const edges = codemap.imports?.edges ?? [];
  return {
    schemaVersion: 1,
    repo: {
      name: codemap.meta.name,
      language: codemap.meta.language,
      frameworks: codemap.meta.frameworks.map(({ name }) => name),
      orientation: codemap.orientation ?? null,
    },
    selectedPath: evidence.selectedPath,
    files: evidence.files,
    relationships: {
      dependencies: [...new Set(edges.filter((edge) => edge.from === selectedPath).map((edge) => edge.to))].sort(),
      importers: [...new Set(edges.filter((edge) => edge.to === selectedPath).map((edge) => edge.from))].sort(),
    },
    limits: { maxFiles: 6, maxSourceCharacters: 48_000 },
  };
}
