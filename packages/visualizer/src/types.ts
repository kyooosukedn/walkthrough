/**
 * Walkthrough types — mirror of @walkthrough/scanner types.
 * The visualizer does NOT depend on the scanner package.
 * codemap.json is the contract between them.
 */

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
}

export interface CodeMapMeta {
  name: string;
  version: string;
  scannedAt: string;
  frameworks: FrameworkDetection[];
  language: string;
  stats: CodeMapStats;
}

export interface CodeMapStats {
  files: number;
  directories: number;
  totalLines: number;
}

export interface FrameworkDetection {
  name: string;
  confidence: number;
  version?: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  extension?: string;
  children?: FileTreeNode[];
}

export interface EntryPoint {
  file: string;
  type: "page" | "layout" | "server" | "cli" | "worker";
  route?: string;
}

export interface Route {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  file: string;
  handler?: string;
  calls?: string[];
}

export interface Component {
  name: string;
  file: string;
  type: "react" | "vue" | "svelte" | "angular";
  imports: string[];
  props?: string[];
  isPage?: boolean;
}

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

export interface Service {
  name: string;
  type: "database" | "ai" | "payment" | "auth" | "storage" | "analytics" | "other";
  purpose: string;
  files: string[];
}

export interface ImportGraph {
  nodes: ImportNode[];
  edges: ImportEdge[];
}

export interface ImportNode {
  id: string;
  type: "file" | "directory";
}

export interface ImportEdge {
  from: string;
  to: string;
  imports: string[];
}

export interface TourDefinition {
  steps: TourStep[];
}

export interface TourStep {
  id: string;
  title: string;
  description: string;
  focusNodeIds: string[];
  cameraPosition?: { x: number; y: number; zoom: number };
  edgeHighlightIds?: string[];
  codeSnippet?: { file: string; language: string; content: string };
}
