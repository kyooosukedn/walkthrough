# Walkthrough codebase guide

This guide describes the code running today. Start with one question: **How does a local repository become the first screen in the browser?**

## The path through the code

```text
packages/cli/src/index.ts
  → scan(targetPath)
packages/scanner/src/scanner.ts
  → file tree, imports, entry points, supported analyzers
  → deriveOrientation(fileTree)
  → CodeMap JSON
packages/cli/src/index.ts
  → writes codemap.json and serves /codemap.json
packages/visualizer/src/data/context.tsx
  → loads CodeMap
packages/visualizer/src/App.tsx
  → WelcomeScreen or optional graph/tour
packages/visualizer/src/ui/WelcomeScreen.tsx
  → landmarks, entry-file suggestions, path search
packages/visualizer/src/ui/SourcePreview.tsx
  → source and explicit Explain action
packages/visualizer/src/journey/state.ts
  → selected-file trail, backward jumps, and branches
packages/cli/src/explain/context.ts → handler.ts → provider.ts
  → bounded source evidence, local request checks, DeepSeek call
```

The scanner and browser share a JSON contract. The scanner's types live in [`packages/scanner/src/types.ts`](../packages/scanner/src/types.ts); the browser mirrors them in [`packages/visualizer/src/types.ts`](../packages/visualizer/src/types.ts). Only `meta` and `fileTree` are required. Everything else is optional, so an unfamiliar language can still show structure.

## Where the new first screen gets its facts

[`file-tree.ts`](../packages/scanner/src/analyzers/file-tree.ts) walks the checkout and ignores build outputs and dependencies. [`orientation.ts`](../packages/scanner/src/analyzers/orientation.ts) classifies paths **already found in that tree** into docs, manifests, test files, and source roots. It does not read or execute those files. [`entry-points.ts`](../packages/scanner/src/analyzers/entry-points.ts) suggests conventional starting files for JavaScript/TypeScript, Python, Go, and Rust. The browser filters those suggestions against actual scanned paths so a stale package entry does not become a clickable claim.

[`WelcomeScreen.tsx`](../packages/visualizer/src/ui/WelcomeScreen.tsx) renders the groups, a small set of suggestions, and path search. Search filters the in-memory file list and caps visible matches. Clicking a file switches [`App.tsx`](../packages/visualizer/src/App.tsx) to a read-only preview. [`source.ts`](../packages/cli/src/source.ts) permits only scanned paths inside the checkout, rejects binary and large files, and returns plain UTF-8 text. The local server binds to loopback in [`index.ts`](../packages/cli/src/index.ts).

[`SourcePreview.tsx`](../packages/visualizer/src/ui/SourcePreview.tsx) fetches source on opening a file. Its **Explain this file** button is the only trigger for `POST /explain`. [`context.ts`](../packages/cli/src/explain/context.ts) reads a bounded set of scanned paths through the same contained source reader and excludes common secret files. [`handler.ts`](../packages/cli/src/explain/handler.ts) checks the local request, calls the configured provider, and validates every clickable file/line citation against the actual evidence. [`provider.ts`](../packages/cli/src/explain/provider.ts) calls DeepSeek's JSON chat endpoint. The key stays in the CLI process. Without `DEEPSEEK_API_KEY`, preview still works and Explain shows a setup message. A matching test or nearby README helps orient languages without import analysis; the tool does not claim a complete call graph for those languages.

The selected file starts a learning trail in [`App.tsx`](../packages/visualizer/src/App.tsx). [`journey/state.ts`](../packages/visualizer/src/journey/state.ts) handles following a suggested file, jumping back, and branching from an earlier step. The browser keeps successful explanations in memory by file path, so returning to a step does not ask DeepSeek again. A citation to the current file moves to its line without adding a duplicate step. Only **Explain this file** makes a new AI request.

Other analyzers are deeper but narrower. [`nextjs-routes.ts`](../packages/scanner/src/analyzers/nextjs-routes.ts) and [`express-routes.ts`](../packages/scanner/src/analyzers/express-routes.ts) detect some JavaScript routes; [`react-components.ts`](../packages/scanner/src/analyzers/react-components.ts) and [`database.ts`](../packages/scanner/src/analyzers/database.ts) add specialized views. [`tour-generator.ts`](../packages/scanner/src/analyzers/tour-generator.ts) creates the older architecture tour. None of these is a universal or exact runtime call graph.

## Try it yourself

From the repo root:

```powershell
npm install
npm run build
npm test
node packages/cli/dist/index.js . --port 3102
```

On the first screen, search for `orientation.ts`, open it, and find `deriveOrientation`. Then open `scanner.ts` and find the call that puts its result into `map.orientation`. That one call connects the filesystem scan to the browser. Go back and search for `source.ts`; its path checks explain why the preview can show local source without reading an arbitrary file.

## What is still missing

This screen helps you find files, follow a source-linked trail, and get a cited explanation plus one small exercise at each file. It does not yet verify your exercise or trace a complete backend or frontend workflow. The first-run decision is in [`docs/product/first-run-journey.md`](./product/first-run-journey.md); the file-led journey is specified in [`docs/superpowers/specs/2026-10-03-file-led-journey-design.md`](./superpowers/specs/2026-10-03-file-led-journey-design.md).
