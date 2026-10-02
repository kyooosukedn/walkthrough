# CodeMap — Architecture

> Historical design proposal. Several names and planned analyzers below do not match the shipped Walkthrough code. For the current implementation, use [the codebase guide](./docs/CODEBASE_GUIDE.md).

**Principle:** The scanner and visualizer never speak directly. The `codemap.json` is the entire contract. This is the single most important architectural decision.

---

## High-Level

```
┌──────────────┐         codemap.json          ┌──────────────────┐
│              │  ──────────────────────────────▶│                  │
│   SCANNER    │    (the contract, the truth)    │   VISUALIZER     │
│   (Node.js)  │                                │   (React/Vite)   │
│              │◀──────────────────────────────│                  │
└──────────────┘         CLI / npx              └──────────────────┘
```

They are separate packages. They can be versioned independently. The scanner can be used without the visualizer (CI pipelines, docs generation). The visualizer can load any valid codemap.json, even hand-written ones.

---

## Package Structure

```
codemap/
├── packages/
│   ├── scanner/              # @codemap/scanner
│   ├── visualizer/           # @codemap/visualizer
│   └── cli/                  # @codemap/cli (orchestrates scanner + visualizer)
├── package.json              # Monorepo root (workspaces)
├── tsconfig.base.json        # Shared TS config
└── README.md
```

Why three packages, not two:
- `scanner` is a library. Other tools can import it programmatically.
- `visualizer` is a library. It exports React components and a Vite plugin.
- `cli` is the user-facing entry point. It imports both and wires them together.

`npx codemap` installs only `@codemap/cli`, which depends on the other two.

---

## The Contract: codemap.json

This is the most critical piece of architecture. Get this right and everything else follows.

### Design Principles for the Schema

1. **Stable.** Adding a field should never break old visualizers. Removing or renaming a field is a major version bump.
2. **Self-describing.** The `meta` field tells you what framework, language, and capabilities were detected.
3. **Progressive.** A minimal codemap.json (just fileTree) is valid. Every other section is optional. The visualizer shows what it can.
4. **Typed.** We ship JSON Schema + TypeScript types from `@codemap/scanner`. The visualizer imports the same types.

### Schema (v1)

```typescript
// The contract between scanner and visualizer.
// Both packages import from @codemap/scanner/types.

interface CodeMap {
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

interface CodeMapMeta {
  name: string;                    // project name
  version: string;                 // codemap schema version ("1.0.0")
  scannedAt: string;               // ISO timestamp
  framework: FrameworkDetection[]; // what was detected, with confidence
  language: string;                // "typescript", "python", etc.
  stats: {
    files: number;
    directories: number;
    totalLines: number;
  };
}

// Everything below is OPTIONAL.
// The scanner fills in what it can. The visualizer adapts to what's available.
```

### Versioning Strategy

- Schema version is embedded in `meta.version`
- Visualizer checks version on load
- If version > supported: show warning, render what it can
- If version <= supported: full render
- Never crash on unknown fields. Ignore them.

---

## Scanner Architecture

### Core Abstraction

```typescript
// Every analyzer implements this interface.
interface Analyzer {
  name: string;                  // e.g. "nextjs-routes"
  detect(project: ProjectInfo): boolean;  // "should I run on this project?"
  analyze(project: ProjectInfo): Promise<AnalyzerOutput>;
}

type AnalyzerOutput =
  | { routes: Route[] }
  | { components: Component[] }
  | { database: DatabaseSchema }
  | { services: Service[] }
  | { imports: ImportGraph }
  | { entryPoints: EntryPoint[] }
  | { tour: TourDefinition };
```

### Analyzer Registry

Analyzers register themselves. The scanner runs all that `detect()` returns true.

```typescript
const registry = [
  FileTreeAnalyzer,        // always runs
  ImportGraphAnalyzer,     // always runs (language-aware)
  EntryPointAnalyzer,      // always runs

  // Framework-specific (only run when detected)
  NextJsRoutesAnalyzer,
  ExpressRoutesAnalyzer,
  FastApiRoutesAnalyzer,

  ReactComponentAnalyzer,
  VueComponentAnalyzer,
  SvelteComponentAnalyzer,

  SqlMigrationAnalyzer,
  PrismaSchemaAnalyzer,
  DrizzleSchemaAnalyzer,

  ServiceDetectorAnalyzer, // finds external service calls
  TourGeneratorAnalyzer,   // auto-generates tour from all other outputs
];
```

### Why Registry, Not Hardcoded

When someone wants to add Django support, they write a `DjangoRoutesAnalyzer` that implements the `Analyzer` interface, registers it, and the scanner picks it up. No core changes needed.

Community analyzers become possible: `@codemap/analyzer-rails`, `@codemap/analyzer-go`.

### Analyzer Execution

```
Scanner.run():
  1. Build ProjectInfo (root path, package.json, tsconfig, etc.)
  2. Run FileTreeAnalyzer (always)
  3. Run ImportGraphAnalyzer (always, needs file tree)
  4. Run EntryPointAnalyzer (always, needs imports)
  5. Run detect() on all registered analyzers in parallel
  6. Run all that returned true, in parallel where possible
  7. Some analyzers depend on others:
     - TourGeneratorAnalyzer runs LAST (needs all other outputs)
     - ComponentAnalyzer needs ImportGraph
  8. Merge all outputs into a single CodeMap object
  9. Validate against JSON Schema
  10. Write codemap.json
```

### Dependency Graph Between Analyzers

```
FileTree ──▶ ImportGraph ──▶ EntryPoint
    │              │              │
    │              ├──▶ ComponentAnalyzer
    │              │
    ├──▶ NextJsRoutesAnalyzer
    ├──▶ ExpressRoutesAnalyzer
    │
    ├──▶ SqlMigrationAnalyzer
    ├──▶ PrismaSchemaAnalyzer
    │
    └──▶ ServiceDetectorAnalyzer

ALL OF THE ABOVE ──▶ TourGeneratorAnalyzer
```

---

## Visualizer Architecture

### Core Principles

1. **Data-driven.** The visualizer renders what the JSON says. No file system access. No network calls. Pure data in, UI out.
2. **View plugins.** Each view (SystemOverview, RouteMap, etc.) is a self-contained module that declares what data it needs and renders it.
3. **Tour engine is a controller.** It orchestrates camera, highlights, and narration. It doesn't render anything itself.

### View Interface

```typescript
interface ViewPlugin {
  id: string;                    // "system-overview", "route-map", etc.
  label: string;                 // "System Overview"
  icon: string;                  // emoji or lucide icon name
  requiredData: (keyof CodeMap)[]; // what sections of codemap.json this view needs

  // Returns true if this view can be shown (has all required data)
  isAvailable(codemap: CodeMap): boolean;

  // The React component to render
  component: React.ComponentType<ViewProps>;
}

interface ViewProps {
  codemap: CodeMap;
  tourEngine: TourEngine | null; // null when not in tour mode
}
```

### View Registry

```typescript
const views = [
  SystemOverviewView,    // needs: fileTree, meta
  RouteMapView,          // needs: routes
  DataFlowView,          // needs: routes, database, services, imports
  DatabaseSchemaView,    // needs: database
  ComponentTreeView,     // needs: components
  ServiceMapView,        // needs: services
  FileExplorerView,      // needs: fileTree
];
```

Views that don't have their required data are hidden from the tab bar. If only fileTree exists, you see FileExplorer and SystemOverview. Progressive enhancement.

### Tour Engine

```typescript
class TourEngine {
  steps: TourStep[];
  currentStep: number;

  // These control the React Flow canvas
  setCameraPosition(position: { x: number; y: number; zoom: number }): void;
  highlightNodes(nodeIds: string[]): void;
  highlightEdges(edgeIds: string[]): void;
  dimAll(): void;

  // Navigation
  next(): void;
  previous(): void;
  goTo(stepIndex: number): void;

  // Callbacks for the narration panel
  onStepChange(callback: (step: TourStep) => void): void;
}
```

The tour engine doesn't know about React. It's a plain JS controller that emits commands. The React components subscribe to it.

### Tour Step Definition

```typescript
interface TourStep {
  id: string;
  title: string;
  description: string;          // markdown narration text
  focusNodeIds: string[];       // which nodes to highlight
  cameraPosition?: { x: number; y: number; zoom: number };
  edgeHighlightIds?: string[];  // which edges to animate
  codeSnippet?: {               // optional code preview
    file: string;
    language: string;
    content: string;
  };
  autoAdvance?: number;         // ms to wait before auto-advancing (optional)
}
```

### Layout Management

The graph needs automatic layout. Options:

1. **elkjs** — best for layered/hierarchical graphs (routes, component trees)
2. **dagre** — simpler, good for general directed graphs
3. **force-directed (d3-force)** — good for system overview where grouping matters

Strategy: different views use different layout algorithms. System overview uses force-directed. Route map uses hierarchical (elkjs). Component tree uses tree layout.

All layouts are computed once on load, then the user can drag nodes freely. Layout is cached in the codemap.json under `meta.layoutHints` so subsequent loads are instant.

---

## CLI Architecture

```typescript
// @codemap/cli — the user-facing entry point

async function main() {
  const args = parseArgs();       // path, --json, --output, --serve, --skip
  const projectPath = args._[0] || process.cwd();

  // 1. Scan
  const codemap = await scan(projectPath, {
    skip: args.skip,
    analyzers: args.analyzers,
  });

  // 2. Output
  if (args.json) {
    console.log(JSON.stringify(codemap, null, 2));
    return;
  }

  const outputPath = args.output || path.join(projectPath, 'codemap.json');
  writeFileSync(outputPath, JSON.stringify(codemap, null, 2));

  // 3. Serve visualizer (unless --no-serve)
  if (!args.noServe) {
    const server = await startDevServer({
      codemapPath: outputPath,
      port: args.port || 4321,
    });
    open(`http://localhost:${server.port}`);
  }
}
```

The CLI bundles the visualizer as static assets. When you run `npx codemap`, it:
1. Scans
2. Writes codemap.json
3. Starts a tiny HTTP server serving the React app + the JSON
4. Opens browser

No build step for the user. The visualizer is pre-built and bundled into the CLI package.

---

## Scaling Concerns

### Large Codebases (1000+ files)

- The scanner already handles this (it's just reading files, not loading them)
- The visualizer uses React Flow's virtualization — only renders visible nodes
- Views can paginate (show top 50 routes, "load more")
- File tree is lazily expanded

### Community Analyzers

The analyzer registry is open. Community packages:
```
@codemap/analyzer-rails
@codemap/analyzer-django
@codemap/analyzer-go
@codemap/analyzer-rust
```

CLI flag: `npx codemap --analyzers @codemap/analyzer-rails`

### Community Views

Same pattern:
```
@codemap/view-dependency-graph
@codemap/view-git-history
@codemap/view-test-coverage
```

### Monorepo Support

Scanner detects `workspaces` in package.json. Produces separate sections:
```json
{
  "packages": [
    { "name": "packages/scanner", "path": "packages/scanner", ... },
    { "name": "packages/visualizer", "path": "packages/visualizer", ... }
  ]
}
```

The visualizer can show cross-package dependencies.

### CI Integration

Scanner runs in CI. Produces codemap.json as artifact. Visualizer loads it in the browser. No special CI setup needed.

Potential: GitHub Action that scans on every push and deploys the visualizer to GitHub Pages.

---

## Data Flow (Inside Visualizer)

```
codemap.json
     │
     ▼
 DataLoader (validates schema, normalizes)
     │
     ├─▶ ViewRegistry (filters available views)
     │       │
     │       └─▶ ActiveView renders
     │              │
     │              ├─▶ GraphCanvas (React Flow)
     │              │      ├─ Custom Nodes (type-aware)
     │              │      └─ Custom Edges (animated)
     │              │
     │              └─▶ TourEngine (if tour active)
     │                     ├─▶ Camera control
     │                     ├─▶ Highlight control
     │                     └─▶ Narration panel
     │
     └─▶ SearchIndex (pre-built from all nodes)
            │
            └─▶ SearchResults overlay
```

---

## File Sizes and Performance Budgets

| Operation | Target | Strategy |
|-----------|--------|----------|
| Scanner (137 files) | < 3s | Parallel analyzers, no AST for simple scans |
| Scanner (1000 files) | < 15s | Parallel analyzers, lazy AST parsing |
| codemap.json size | < 500KB | Strip code content, keep metadata + structure |
| Visualizer first load | < 1s | Pre-built, code-split by view |
| View switch | < 200ms | Pre-computed layouts, cached nodes |
| Tour step transition | < 600ms | Animated camera pan + zoom |

---

## What We Build First (Phase 1 Architecture)

The smallest architecture that proves the contract works:

```
packages/
  scanner/
    src/
      index.ts                 # public API: scan(path) => CodeMap
      types.ts                 # CodeMap interface + all sub-types
      analyzers/
        file-tree.ts           # FileTreeAnalyzer
        imports.ts             # ImportGraphAnalyzer
        routes-nextjs.ts       # NextJsRoutesAnalyzer
        tour-generator.ts      # TourGeneratorAnalyzer
    package.json

  visualizer/
    src/
      App.tsx                  # Root: loads data, renders layout
      data/
        loader.ts              # Loads + validates codemap.json
      tour/
        TourEngine.ts          # Tour controller (plain JS class)
      views/
        SystemOverview.tsx     # First view: boxes + connections
      graph/
        GraphCanvas.tsx        # React Flow wrapper
        nodes/
          DefaultNode.tsx      # Base node component
        edges/
          AnimatedEdge.tsx     # Flowing dashed edge
      ui/
        TopBar.tsx
        Sidebar.tsx
        NarrationPanel.tsx
    package.json

  cli/
    src/
      index.ts                 # npx codemap entry point
    package.json
```

That's 4 analyzer files and ~10 visualizer files. Everything else grows from this spine.
