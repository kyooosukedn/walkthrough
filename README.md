# ◆ Walkthrough

**Understand any codebase in 5 minutes.**

Walkthrough scans a project and produces an interactive, animated, step-by-step architecture tour. Not a static diagram. Not a dependency graph. A guided walkthrough of how the codebase actually fits together.

```bash
npx github:kyooosukedn/walkthrough ./path/to/your/project
```

Your browser opens. You press "Start Guided Tour". Nodes light up, connections flow, and the architecture walks past you step by step: entry points → routes → data model → core logic → data flow.

| Welcome | Tour start | Mid-tour |
|---|---|---|
| ![Welcome screen](docs/demo-01-welcome.webp) | ![Guided tour starting](docs/demo-02-tour-start.webp) | ![Tour in progress](docs/demo-03-tour-deep.webp) |

*(Scanned project: a real 836-file / 131k-LOC Expo + legacy-Java codebase, 1.3 s scan.)*

You've been there: first day on a codebase, 200 files, no map. READMEs describe what the product does, not how the code is shaped. Dependency graphs show everything and explain nothing.

Walkthrough is the tool I wished existed when opening an unfamiliar codebase for the first time. It's built for **humans learning a codebase** — onboarding, taking over a project, evaluating a repo before contributing.

## How it works

```
You run:  walkthrough ./my-project
              ↓
Scanner reads your codebase (file tree, imports, entry points,
framework detection — AST-level analysis, no execution)
              ↓
Generates codemap.json (pure data — the contract)
              ↓
Opens browser → interactive React app loads the blueprint
              ↓
Guided animated tour walks you through the architecture
```

Three packages, one contract:

- **`@walkthrough/scanner`** — analyzes codebases, emits `codemap.json`. Usable standalone in CI or scripts.
- **`@walkthrough/visualizer`** — data-driven React app (React Flow + elkjs). Renders any valid `codemap.json`, even hand-written.
- **`walkthrough-cli`** — wires them together. One command, browser opens.

The scanner and visualizer never speak directly. The JSON is the entire contract — versioned, progressive (a minimal file-tree-only map is valid), schema-typed on both sides.

## Performance

Single-threaded Node, no cache, cold start included (Windows 11, Ryzen 7 5700U):

| Project | Files | Lines | Scan time |
|---|---|---|---|
| Small Next.js app | 69 | 2,560 | 363 ms |
| Go codebase | 224 | 52,190 | 483 ms |
| Expo + legacy Java monorepo | 836 | 131,118 | 1,279 ms |

~1.5 s for 131k LOC. Import resolution handles relative paths, tsconfig `paths` aliases (`@/`-style, including commented JSONC tsconfigs), `export … from`, side-effect and dynamic imports.

## What works today (v0.1)

- [x] Routes view (Next.js App Router + Pages Router analyzers)
- [x] Import graph with alias resolution
- [x] Entry-point detection
- [x] Framework detection (Next.js, React, Angular, Vue, SvelteKit, Expo, React Native, NestJS, Nuxt, Astro, Express, Fastify, Hono, Vite)
- [x] Auto-generated guided tour with narration, camera moves, animated edges
- [x] System overview view + free explore mode
- [x] Served locally by the CLI; `--json` / `--no-serve` for scripting

## What's next (in public)

- [ ] Express routes analyzer
- [ ] Component tree view (React analyzer)
- [ ] Database schema view (SQL/Prisma/Drizzle analyzers)
- [ ] Code-splitting the visualizer bundle (currently 1.86 MB)
- [ ] npm publish (`npx walkthrough`)

This repo is built in the open. See [DECISIONS.md](./DECISIONS.md) for the tradeoffs and rejected alternatives behind the current shape.

## Development

```bash
git clone https://github.com/kyooosukedn/walkthrough
cd walkthrough
npm install
npm run build
npm test
node packages/cli/dist/index.js ./some-project
```

## License

MIT
