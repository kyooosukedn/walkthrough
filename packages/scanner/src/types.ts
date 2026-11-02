/**
 * CodeMap type definitions — the contract between scanner and visualizer.
 *
 * Rules:
 * - Everything except `meta` and `fileTree` is optional (progressive schema)
 * - Adding fields never breaks old visualizers
 * - The visualizer ignores unknown fields gracefully
 */

// ─── Top-level ───────────────────────────────────────────────

/** The entire codebase blueprint. Scanner writes it, visualizer reads it. */
export interface CodeMap {
  meta: CodeMapMeta;
  fileTree: FileTreeNode;
  entryPoints?: EntryPoint[];
  routes?: Route[];
  components?: Component[];
  database?: DatabaseSchema;
  services?: Service[];
  imports?: ImportGraph;
  tour?: TourDefinition;
  orientation?: RepoOrientation;
}

/** Source-backed locations useful before language-specific analysis. */
export interface RepoOrientation {
  docs: string[];
  manifests: string[];
  tests: string[];
  sourceRoots: string[];
}

// ─── Meta ────────────────────────────────────────────────────

export interface CodeMapMeta {
  /** Project name (from package.json or directory name) */
  name: string;
  /** Schema version — follows semver. Visualizer checks this. */
  version: string;
  /** When this file was generated */
  scannedAt: string;
  /** Frameworks detected with confidence scores */
  frameworks: FrameworkDetection[];
  /** Primary language */
  language: string;
  /** Aggregate counts */
  stats: CodeMapStats;
}

export interface CodeMapStats {
  files: number;
  directories: number;
  totalLines: number;
}

export interface FrameworkDetection {
  name: string;
  confidence: number; // 0–1
  version?: string;
}

// ─── File Tree ───────────────────────────────────────────────

export interface FileTreeNode {
  name: string;
  path: string; // relative to project root
  type: "file" | "directory";
  size?: number; // bytes
  extension?: string;
  children?: FileTreeNode[];
}

// ─── Entry Points ────────────────────────────────────────────

export interface EntryPoint {
  file: string;
  type: "page" | "layout" | "server" | "cli" | "worker";
  /** URL route for pages (e.g. "/") */
  route?: string;
}

// ─── Routes ──────────────────────────────────────────────────

export interface Route {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  file: string;
  handler?: string;
  /** Files or modules this route calls */
  calls?: string[];
}

// ─── Components ──────────────────────────────────────────────

export interface Component {
  name: string;
  file: string;
  type: "react" | "vue" | "svelte" | "angular";
  /** Other components this one imports */
  imports: string[];
  props?: string[];
  isPage?: boolean;
}

// ─── Database ────────────────────────────────────────────────

export interface DatabaseSchema {
  tables: Table[];
  migrations?: Migration[];
}

export interface Table {
  name: string;
  columns: Column[];
  relations: Relation[];
}

export interface Column {
  name: string;
  type: string;
  nullable?: boolean;
  primary?: boolean;
  foreignKey?: { table: string; column: string };
}

export interface Relation {
  to: string;
  type: "has_many" | "has_one" | "belongs_to" | "many_to_many";
  through?: string;
}

export interface Migration {
  file: string;
  timestamp?: string;
  tablesCreated: string[];
  tablesModified: string[];
}

// ─── Services ────────────────────────────────────────────────

export interface Service {
  name: string;
  type: "database" | "ai" | "payment" | "auth" | "storage" | "analytics" | "other";
  purpose: string;
  /** Where this service is used */
  files: string[];
}

// ─── Import Graph ────────────────────────────────────────────

export interface ImportGraph {
  nodes: ImportNode[];
  edges: ImportEdge[];
}

export interface ImportNode {
  /** File path (matches FileTreeNode.path) */
  id: string;
  type: "file" | "directory";
}

export interface ImportEdge {
  from: string;
  to: string;
  /** What names are imported */
  imports: string[];
}

// ─── Tour ────────────────────────────────────────────────────

export interface TourDefinition {
  steps: TourStep[];
}

export interface TourStep {
  id: string;
  title: string;
  /** Markdown narration for this step */
  description: string;
  /** Node IDs to highlight (file paths or generated IDs) */
  focusNodeIds: string[];
  cameraPosition?: { x: number; y: number; zoom: number };
  /** Edge IDs to animate during this step */
  edgeHighlightIds?: string[];
  codeSnippet?: { file: string; language: string; content: string };
}

// ─── Node Types (used by visualizer for color-coding) ────────

export type NodeType =
  | "page"
  | "api"
  | "component"
  | "database"
  | "service"
  | "library"
  | "config"
  | "middleware";

// ─── Analyzer Interface (used by scanner) ────────────────────

export interface Analyzer {
  name: string;
  detect(project: ProjectInfo): boolean;
  analyze(project: ProjectInfo): Promise<AnalyzerOutput>;
}

/** Whatever the analyzer returns. The scanner merges it into CodeMap. */
export type AnalyzerOutput = {
  fileTree?: FileTreeNode;
  stats?: CodeMapStats;
  entryPoints?: EntryPoint[];
  routes?: Route[];
  components?: Component[];
  database?: DatabaseSchema;
  services?: Service[];
  imports?: ImportGraph;
  tour?: TourDefinition;
  orientation?: RepoOrientation;
};

export interface ProjectInfo {
  rootPath: string;
  packageJson?: Record<string, unknown>;
  tsconfig?: Record<string, unknown>;
  fileTree?: FileTreeNode;
}

// ─── View Interface (used by visualizer) ─────────────────────

export interface ViewPlugin {
  id: string;
  label: string;
  icon: string;
  requiredData: (keyof CodeMap)[];
  isAvailable(codemap: CodeMap): boolean;
}

/** Current schema version */
export const SCHEMA_VERSION = "1.1.0";
