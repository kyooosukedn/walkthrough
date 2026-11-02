> **Historical document.** This is the original product vision from when the project was called CodeMap. Not everything here shipped (e.g. the Data Flow view). For what exists today see [README.md](./README.md) and [ROADMAP.md](./ROADMAP.md).

# CodeMap — PRD

**One-liner:** Point it at any codebase. Get a guided, animated architecture walkthrough. Understand everything.

---

## What We're Building

A developer tool that scans any codebase and produces an interactive, animated, step-by-step visual walkthrough of its architecture. Not a static diagram. Not a dependency graph. A living, breathing guided tour.

Think Duolingo meets Figma's architecture diagrams. You open it, hit "Start Tour," and it walks you through: "Here's the entry point → Auth lives here → Data flows through this → The AI chain works like this." Each step animates, highlights connections, shows real code. You can explore freely or follow the guided path.

**Open source.** For the internet. For you.

---

## The Problem

Every developer has opened a new codebase and felt lost. READMEs are stale. Architecture docs are wrong. Comments lie. The only truth is the code itself, but reading 137 files top to bottom isn't understanding — it's survival.

Existing tools (Emerge, CodeCharta, Noodles) produce static diagrams or require heavy setup. None guide you. None make you feel it. None teach.

---

## How It Works

```
You run: npx codemap ./path/to/project
          ↓
Scanner reads your codebase (AST parsing, file analysis)
          ↓
Generates codemap.json (blueprint of everything)
          ↓
Opens browser → interactive React app loads the blueprint
          ↓
Guided animated tour walks you through the architecture
          ↓
Free explore mode when you're done with the tour
```

### Scanner

The scanner is language-aware but framework-flexible:

1. **File tree** — directory structure, file sizes, types
2. **Entry points** — `page.tsx`, `route.ts`, `layout.tsx`, `main.*`, `index.*`
3. **Dependencies** — import graph between files
4. **API routes** — REST endpoints, methods, handlers (Next.js, Express, FastAPI)
5. **Data model** — database tables, relationships, migrations (SQL, Prisma, Drizzle)
6. **Component tree** — React/Vue/Svelte component hierarchy
7. **Data flow** — request lifecycle: entry → middleware → handler → DB → response
8. **External services** — AI providers, payment (Stripe), auth, storage
9. **Config** — environment variables, feature flags, build config

Output: a single `codemap.json` file that contains everything the visualizer needs.

### Visualizer

React app (Vite) that reads `codemap.json` and renders:

**Guided Tour Mode (the magic):**
- Press "Start Tour" → animated step-by-step walkthrough
- Each step: a section of the architecture lights up, connections animate, a narrated explanation appears
- Steps are auto-generated from the blueprint but ordered by "how a developer would want to learn this"
- Order: Entry Point → Auth → Routes → Data Layer → External Services → Component Tree → Special Features
- Transitions between steps are smooth, animated, alive
- "Next Step" and "Previous Step" navigation (also keyboard arrows)

**Free Explore Mode:**
- Interactive node graph — drag, zoom, pan
- Click any node to inspect: code preview, connections, metadata
- Filter by type: show only API routes, only components, only DB tables
- Search across everything
- Minimap for large codebases

**Views (switch between):**
1. **System Overview** — high-level boxes (Frontend, Backend, DB, External Services) with animated connections
2. **Route Map** — every API endpoint + page route, their handlers, what they call
3. **Data Flow** — animated request lifecycle. Watch a request travel through the system
4. **Component Tree** — React/Vue/Svelte component hierarchy, interactive
5. **Database Schema** — ER diagram from migrations or ORM schema
6. **Service Map** — external services (AI providers, Stripe, auth) and when they're called
7. **File Explorer** — interactive tree with file sizes, types, change frequency

---

## The "Alive" Feel

This is what separates CodeMap from every other tool:

- **Nodes breathe** — subtle scale pulse on active/selected nodes
- **Connections flow** — animated particles/dashes traveling along edges showing data direction
- **Steps transition smoothly** — camera pans, zooms, highlights animate in
- **Hover reveals context** — hover a node → connected nodes glow, code snippet appears
- **Sound (optional)** — subtle UI sounds for transitions. Off by default.
- **Celebration** — when you finish the tour, a small animation (confetti? pulse wave?)
- **Dark by default** — architectures look better on dark backgrounds. Light mode available.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Scanner | Node.js + TypeScript | Runs anywhere, same ecosystem as most projects |
| AST Parsing | tree-sitter (via WASM) or ts-morph for TS | Real code understanding, not regex |
| Visualizer | React + Vite + TypeScript | Fast, interactive, modern |
| Graph Rendering | React Flow (xyflow) | Battle-tested, interactive node graphs, free |
| Animations | Framer Motion | Smooth, declarative, React-native |
| Layout | Tailwind CSS | Fast to build, looks good |
| Diagrams (ER, flow) | Built-in SVG or elkjs | Auto-layout, no external service |

---

## Architecture

```
codemap/
├── packages/
│   ├── scanner/              # The codebase analyzer
│   │   ├── src/
│   │   │   ├── index.ts      # CLI entry: npx codemap
│   │   │   ├── scanner.ts    # Orchestrates all analyzers
│   │   │   ├── analyzers/
│   │   │   │   ├── file-tree.ts
│   │   │   │   ├── imports.ts
│   │   │   │   ├── routes.ts       # Next.js, Express, FastAPI
│   │   │   │   ├── components.ts   # React/Vue/Svelte
│   │   │   │   ├── database.ts     # SQL migrations, Prisma
│   │   │   │   ├── services.ts     # External service calls
│   │   │   │   └── data-flow.ts    # Request lifecycle tracing
│   │   │   └── output/
│   │   │       └── json.ts         # codemap.json writer
│   │   └── package.json
│   │
│   └── visualizer/           # The React app
│       ├── src/
│       │   ├── App.tsx
│       │   ├── data/
│       │   │   └── loader.ts       # Loads codemap.json
│       │   ├── tour/
│       │   │   ├── TourEngine.tsx   # Step-by-step orchestrator
│       │   │   ├── steps.ts        # Auto-generated step sequence
│       │   │   └── narrator.tsx    # Explanation text per step
│       │   ├── views/
│       │   │   ├── SystemOverview.tsx
│       │   │   ├── RouteMap.tsx
│       │   │   ├── DataFlow.tsx
│       │   │   ├── ComponentTree.tsx
│       │   │   ├── DatabaseSchema.tsx
│       │   │   ├── ServiceMap.tsx
│       │   │   └── FileExplorer.tsx
│       │   ├── graph/
│       │   │   ├── GraphCanvas.tsx  # React Flow wrapper
│       │   │   ├── nodes/          # Custom node types
│       │   │   └── edges/          # Custom edge types (animated)
│       │   └── ui/                 # Shared components
│       └── package.json
│
├── package.json              # Monorepo root
├── PRD.md
├── DESIGN.md
└── README.md
```

---

## Scanner Output (codemap.json)

```json
{
  "meta": {
    "name": "stepwise",
    "scannedAt": "2026-05-06T...",
    "framework": "next.js",
    "language": "typescript"
  },
  "fileTree": { ... },
  "entryPoints": [
    { "file": "src/app/page.tsx", "type": "page", "route": "/" },
    { "file": "src/app/layout.tsx", "type": "layout" }
  ],
  "routes": [
    {
      "method": "GET",
      "path": "/api/projects",
      "file": "src/app/api/projects/route.ts",
      "calls": ["supabase.from('projects')"],
      "returns": "{ projects }"
    }
  ],
  "components": [
    {
      "name": "ProjectView",
      "file": "src/app/(app)/project/[id]/project-view.tsx",
      "imports": ["ChatPanel", "CodeBlock", "StepActions"],
      "props": ["project", "steps"]
    }
  ],
  "database": {
    "tables": [
      {
        "name": "projects",
        "columns": ["id", "user_id", "title", "idea", "status"],
        "relations": [{ "to": "steps", "type": "has_many" }]
      }
    ],
    "migrations": [ ... ]
  },
  "services": [
    { "name": "Supabase", "type": "database", "purpose": "auth + data" },
    { "name": "OpenAI/Groq/Gemini", "type": "ai", "purpose": "step generation + chat" },
    { "name": "Stripe", "type": "payment", "purpose": "pro subscriptions" }
  ],
  "tour": {
    "steps": [
      {
        "title": "Welcome to Stepwise",
        "description": "This is a Next.js app that helps developers build projects step by step.",
        "focus": ["src/app/page.tsx"],
        "highlight": ["entry"]
      }
    ]
  }
}
```

---

## CLI Usage

```bash
# Scan current directory, open visualizer
npx codemap

# Scan a specific project
npx codemap ./path/to/project

# Scan and output JSON only (no visualizer)
npx codemap --json

# Scan and output to specific file
npx codemap --output ./my-blueprint.json

# Open visualizer for existing blueprint
npx codemap --serve ./codemap.json

# Skip specific analyzers
npx codemap --skip components,database
```

---

## Guided Tour Steps (Auto-Generated)

The scanner auto-generates a tour sequence. For a typical full-stack app:

| Step | What It Shows | Animation |
|------|--------------|-----------|
| 1. Welcome | Project name, tech stack, purpose | Fade in overview |
| 2. Entry Point | Main page / layout / server entry | Highlight + zoom |
| 3. Auth Flow | Login → session → protected routes | Animated path |
| 4. Page Routes | All pages, their layout nesting | Tree expands |
| 5. API Layer | All endpoints, methods, what they call | Nodes light up |
| 6. Data Model | Tables, relations, migration history | ER diagram builds |
| 7. Core Logic | Business logic, data processing | Code snippets appear |
| 8. External Services | AI providers, payments, storage | Connections pulse |
| 9. Component Tree | UI component hierarchy | Tree draws itself |
| 10. Data Flow | Full request lifecycle animation | Particle travels the path |
| 11. You Made It | Summary, stats, celebration | 🎉 |

---

## Phases

### Phase 1: Foundation (Week 1)
- Scanner: file tree, imports, routes (Next.js + Express)
- Visualizer: React Flow canvas, basic node/edge rendering
- Tour engine: step navigation, camera movement
- One working view: System Overview
- CLI: `npx codemap`

### Phase 2: Depth (Week 2)
- Scanner: components, database, services, data flow
- All 7 views
- Animated edges (flowing particles)
- Search + filter
- Tour auto-generation

### Phase 3: Delight (Week 3)
- Sound effects (optional)
- Celebration animations
- Keyboard shortcuts
- Export tour as shareable URL
- Light mode
- Framework-specific scanners (FastAPI, Rails, Django)

---

## Success Criteria

- [ ] `npx codemap` works on any Node.js project in under 10 seconds
- [ ] Guided tour teaches a new developer the architecture in under 5 minutes
- [ ] Every view is interactive (click, drag, zoom, hover)
- [ ] Feels alive — animations, transitions, breathing nodes
- [ ] Works offline — no external CDN dependencies in production
- [ ] Open source, MIT licensed, contribution-ready

---

## What It's NOT

- Not an IDE plugin (could be later, but not v1)
- Not a code search tool (that's Sourcegraph)
- Not a metrics dashboard (that's CodeCharta)
- Not a static diagram generator (that's Mermaid/PlantUML)
- Not a call graph (that's Noodles)

**It's a teacher.** It teaches you the architecture. Step by step. With animations. Until you get it.

---

*First target: scan the Stepwise codebase and produce a tour that makes a new developer 100% understand it in 5 minutes.*
