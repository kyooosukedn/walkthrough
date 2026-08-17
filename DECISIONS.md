# Decisions

The tradeoffs behind Walkthrough's shape, and what was rejected. Written as they happened; updated when reversed.

## 1. The `codemap.json` contract is the architecture

**Decision:** Scanner and visualizer are separate packages that never import each other. A pure-data JSON file is the entire interface, versioned in `meta.version`.

**Why:** The scanner becomes usable headless (CI, docs generation, other tools). The visualizer renders any valid map, including hand-written ones. Either side can break compat knowingly via the version check instead of accidentally via a shared type import that drifts.

**Rejected:** A shared types package both sides import. Feels type-safe, actually couples release cycles — the visualizer would need scanner updates for schema changes even when rendering behavior is unchanged.

**Consequence:** The schema must stay boring. Adding fields is free; renaming is a major version. Progressive sections (`routes`, `components`, `database` all optional) so a file-tree-only map from day one still renders on a day-400 visualizer.

## 2. Analyzer registry, not hardcoded pipeline

**Decision:** Analyzers implement `{ name, detect(project), analyze(project) }` and register. The scanner runs all whose `detect()` returns true.

**Why:** Community analyzers (`@walkthrough/analyzer-rails`, `-django`) become possible without core changes. Framework detection stays cheap (package.json deps + tsconfig presence) rather than speculative parsing.

**Rejected:** A hardcoded analyzer sequence per framework. Faster to write, impossible to extend without forking.

## 3. Regex import extraction, not a full TS AST parse (for now)

**Decision:** Import statements are extracted with a regex covering `import … from`, `export … from`, side-effect `import "…"`, dynamic `import(…)`, and `require(…)`. Resolution probes extensions against the scanned file set, with tsconfig `paths` alias support.

**Why:** 131k LOC scans in ~1.3 s with zero native dependencies. The regex is deliberately narrow (no cross-line matching, quote-aware character classes) and misses almost nothing that matters for a topology view.

**Rejected for now:** `ts-morph`/typescript-program-based extraction. Precise, but 10–30× slower startup and a heavyweight dependency for the CLI's first-run experience. **Revisit when:** a real codebase demonstrates missed edges that change the graph's shape. The honest cost: exotic syntax (multiline imports with comments mid-clause) can be missed. The graph is a map, not a compiler.

**Lesson from the field (2026-08-17):** tsconfig is JSONC, and a naive comment-stripping regex corrupts files whose string values contain `/*` — which is every `paths` glob (`"@/*"`). The stripper is now string-literal-aware. Cost: 30 lines. If it had shipped naive, every commented Next.js tsconfig would have silently produced zero alias edges.

## 4. Layout per view, computed once

**Decision:** Different views use different layout algorithms (force-directed for system overview, layered/elk for route maps). Layout is computed on load, then nodes are freely draggable; hints can be cached in the map later.

**Why:** One layout for all graphs fits none. Hierarchical data (routes) deserves hierarchy; messy system overviews deserve clustering.

**Rejected:** Single dagre pass for everything (looked acceptable in demos, collapsed on real codebases).

## 5. The tour is a controller, not a component

**Decision:** `TourEngine` is a plain-JS controller emitting commands (camera, highlights, dimming) that React components subscribe to.

**Why:** Tour logic (step order, transitions, narration timing) is testable without rendering. The UI layer stays dumb.

## 6. Renamed from "codemap" — deliberately

**Decision:** The project was born as `codemap`. Before launch, [JordanCoin/codemap](https://github.com/JordanCoin/codemap) (658★) was verified to own the name: an established Go tool for structural code analysis aimed at *coding agents*.

**Why rename:** Brand confusion at launch is a self-inflicted wound ("this exists already" is the first comment any Show HN post would get). **Why "walkthrough":** their tool gives agents ground truth; this one gives humans a guided tour. Different job, name that says so.

**Positioning:** complement, not competitor. Their `--deps`/`--importers` output is deeper dependency ground truth than this scanner's; a future analyzer could consume it as an input. Humans get the tour.

## 7. Ship v0.1 with two views, iterate in public

**Decision:** Launch with system overview + tour working, routes/component views as visible roadmap checkboxes.

**Why:** The core promise (guided tour of architecture) is already delivered. Public commit history on the remaining analyzers is a stronger authenticity signal than a "complete" tool that appears from nowhere — especially in an era when hiring managers probe whether you actually built the thing. Missing features, shipped openly, are proof of work.
