import { join } from "node:path";
import { readFile } from "node:fs/promises";

import type {
  Component,
  ProjectInfo,
  Analyzer,
  FileTreeNode,
  ImportGraph,
  AnalyzerOutput,
} from "../types.js";

const COMPONENT_FILE_RE = /\.(tsx|jsx)$/;
const PAGE_FILE_RE = /^(page|layout|loading|error|not-found|template)\.(tsx|jsx|ts|js)$/;

const EXPORTED_FUNCTION_RE = /export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Z]\w*)/g;
const EXPORTED_CONST_RE = /export\s+(?:const|let)\s+([A-Z]\w*)\s*(?::[^=]+)?=/g;
const DESTRUCTURED_PROPS_RE = /(?:function\s+[A-Z]\w*|(?:const|let)\s+[A-Z]\w*\s*=\s*(?:\([^)]*\)|\w+))\s*(?:<[^>]*>)?\s*\(\{([^}]*)\}/;

/**
 * Extracts React components: every PascalCase export from a .tsx/.jsx file.
 * `imports` points at other component files via the import graph;
 * `isPage` marks Next.js App Router page/layout files.
 */
export class ReactComponentAnalyzer implements Analyzer {
  name = "react-components";

  detect(project: ProjectInfo): boolean {
    return findComponentFiles(project.fileTree).length > 0;
  }

  async analyze(project: ProjectInfo): Promise<AnalyzerOutput> {
    const importGraph: ImportGraph | undefined = (project as ProjectInfo & { _imports?: ImportGraph })._imports;
    const importsByFile = new Map<string, string[]>();
    for (const edge of importGraph?.edges ?? []) {
      const list = importsByFile.get(edge.from) ?? [];
      list.push(edge.to);
      importsByFile.set(edge.from, list);
    }

    const files = findComponentFiles(project.fileTree);
    const componentFiles = new Set(files);
    const components: Component[] = [];

    for (const filePath of files) {
      const names = await extractExportedComponents(join(project.rootPath, filePath));
      if (names.length === 0) continue;

      const imports = (importsByFile.get(filePath) ?? []).filter((target) => componentFiles.has(target));
      const isPage = PAGE_FILE_RE.test(filePath.split("/").pop() ?? "");

      for (const { name, props } of names) {
        components.push({ name, file: filePath, type: "react", imports, props, isPage });
      }
    }

    components.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
    return { components };
  }
}

function findComponentFiles(tree?: FileTreeNode): string[] {
  const out: string[] = [];

  function walk(node: FileTreeNode): void {
    for (const child of node.children ?? []) {
      if (child.type === "directory") walk(child);
      else if (COMPONENT_FILE_RE.test(child.name)) out.push(child.path);
    }
  }

  if (tree) walk(tree);
  return out;
}

async function extractExportedComponents(fullPath: string): Promise<Array<{ name: string; props?: string[] }>> {
  let content: string;
  try {
    content = await readFile(fullPath, "utf-8");
  } catch {
    return [];
  }

  const names = new Map<string, string[] | undefined>();
  for (const re of [EXPORTED_FUNCTION_RE, EXPORTED_CONST_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      if (!names.has(match[1])) names.set(match[1], undefined);
    }
  }

  const propsMatch = content.match(DESTRUCTURED_PROPS_RE);
  const props = propsMatch
    ? propsMatch[1].split(",").map((p) => p.trim().split(/[:=]/)[0].trim()).filter(Boolean)
    : undefined;

  return [...names].map(([name]) => ({ name, props }));
}
