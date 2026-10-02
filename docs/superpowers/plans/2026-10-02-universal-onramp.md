# Universal On-Ramp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the first Walkthrough screen useful for an arbitrary local repository and let a learner inspect the files it names.

**Architecture:** Derive a compact orientation section from the existing file tree; retain the progressive CodeMap contract. The React opening screen consumes that section and displays source-backed suggestions and path search. The local CLI serves selected text files through a contained, read-only endpoint.

**Tech Stack:** Node.js, TypeScript, React, Vitest, Vite; no new dependency.

**Spec:** `docs/product/first-run-journey.md`

## Global Constraints

- Every readable repo gets structure-level orientation; deeper semantic coverage remains optional.
- Scan must not execute repo code or upload source.
- Source paths remain relative, forward-slash paths and must resolve inside checkout.
- Existing tour remains available as optional exploration.

## Review Focus

- A symlink or `..` path cannot make local source endpoint read outside checkout (Task 3).
- A missing entry-point target cannot appear as a suggested file (Task 2).
- An empty, Python, Go, or mixed repo cannot produce a blank first screen (Tasks 1–2).
- Large file trees must not require rendering every file on initial paint (Task 2).
- Binary or oversized files must return a readable refusal rather than raw bytes (Task 3).

---

### Task 1: Orientation contract

**Files:** Create `packages/scanner/src/analyzers/orientation.ts` and `packages/scanner/src/analyzers/orientation.test.ts`; modify `packages/scanner/src/types.ts`, `packages/scanner/src/scanner.ts`, and `packages/visualizer/src/types.ts`.

**Interfaces:** `deriveOrientation(fileTree: FileTreeNode): RepoOrientation` returns arrays of relative paths for docs, manifests, test roots, and source roots. `CodeMap.orientation?: RepoOrientation` carries them to UI.

- [ ] Write fixture tests: TypeScript, Python, Go, mixed/unknown, and empty trees. Assert only existing paths appear; cap displayed groups.
- [ ] Run `npm test --workspace=@walkthrough/scanner -- orientation.test.ts`; confirm failures.
- [ ] Implement deterministic tree classification without reading or executing source; add optional schema field to both type packages and scanner merge.
- [ ] Run targeted tests, scanner typecheck, and full scanner tests.
- [ ] Commit the contract and tests.

### Task 2: Opening screen and search

**Files:** Modify `packages/visualizer/src/ui/WelcomeScreen.tsx`, `packages/visualizer/src/App.tsx`, and `packages/visualizer/src/index.css`; optionally create focused UI components beside `WelcomeScreen.tsx`.

**Interfaces:** `WelcomeScreen` receives `CodeMap`, source-backed suggestions, and callbacks for tour/explore. It filters file-tree paths in memory only after input, and caps visible results. It opens a local source preview by relative path.

- [ ] Add a UI test or build-time fixture proving the four orientation groups and mixed/unknown empty state render without a tour.
- [ ] Replace generic-tour-first copy with repo facts, grouped paths, suggested start files, and filename search.
- [ ] Filter suggestions against actual file-tree paths; show structure-only coverage when semantic data is absent.
- [ ] Keep graph-tour and explore actions; verify keyboard access and narrow-width layout.
- [ ] Run visualizer typecheck and build; commit the screen.

### Task 3: Contained source preview

**Files:** Create `packages/cli/src/source.ts` and `packages/cli/src/source.test.ts`; modify `packages/cli/src/index.ts` and the visualizer preview component.

**Interfaces:** `readSource(rootPath, relativePath)` returns UTF-8 text under a size limit, or a typed error. `GET /source?path=<relative>` exposes it only on local CLI server.

- [ ] Test ordinary file, missing file, `..` traversal, absolute path, symlink escape, binary file, and oversized file.
- [ ] Run targeted test and confirm failures.
- [ ] Implement containment using resolved and real paths; serve plain text with `nosniff`; avoid HTML interpolation.
- [ ] Add preview with return-to-orientation; show a clear error when running visualizer without CLI endpoint.
- [ ] Run CLI tests/typecheck, full build, and scanner tests; commit.

## Self-review

Spec coverage: repo facts and coverage (Task 1–2), search and suggestions (Task 2), inspect/return (Task 3), no code execution (Task 1–3). The editor learning path is a separate board task. No new library is needed: existing scanner tree and React are the smallest fit; CodeTour remains the candidate for the later editor path.

## Execution record

- Task 1: scanner orientation derived from the existing tree; Python, Go, mixed, empty, and ordering tests pass.
- Task 2: first screen, path search, and unsupported state implemented; typecheck, production build, and live browser QA pass. Browser QA on this checkout found an incorrect `layout.ts` suggestion, which was fixed with a regression test.
- Task 3: read-only local source endpoint and preview implemented; traversal, unscanned path, symlink escape, binary, and oversized-file checks pass. Live browser QA confirmed README preview and return to overview.
- Build order was corrected so the CLI bundles the current visualizer. The CLI binds to loopback because it now serves source text.
