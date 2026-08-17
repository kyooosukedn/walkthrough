/**
 * @walkthrough/scanner
 *
 * Analyzes codebases and produces codemap.json blueprints.
 */

export type {
  CodeMap,
  CodeMapMeta,
  CodeMapStats,
  FrameworkDetection,
  FileTreeNode,
  EntryPoint,
  Route,
  Component,
  DatabaseSchema,
  Table,
  Column,
  Relation,
  Migration,
  Service,
  ImportGraph,
  ImportNode,
  ImportEdge,
  TourDefinition,
  TourStep,
  NodeType,
  Analyzer,
  AnalyzerOutput,
  ProjectInfo,
  ViewPlugin,
} from "./types.js";

export { SCHEMA_VERSION } from "./types.js";
export { FileTreeAnalyzer } from "./analyzers/file-tree.js";
export { scan } from "./scanner.js";
export { writeCodeMap } from "./output/json.js";
