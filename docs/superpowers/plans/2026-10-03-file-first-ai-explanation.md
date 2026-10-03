# File-first AI Explanation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Proposed. Apply only after the learner confirms the implementation checkpoint in VibeWise mode.

**Goal:** A person who opens a file in Walkthrough can ask AI for a source-linked explanation and follow cited files without leaving the browser.

**Architecture:** The existing local CLI builds a small, validated evidence bundle from scanned files. An on-demand loopback endpoint sends that bundle to an AI provider and validates citation paths and lines. The existing source preview gains a side panel for the explanation and file navigation.

**Tech Stack:** Node.js, TypeScript, React, Node test runner, official Anthropic SDK. No new front-end package or index/database.

**Spec:** `docs/product/file-first-ai-explanation.md`

## Global Constraints

- Never send source to AI during scan, first paint, or ordinary file preview.
- Read only scanned UTF-8 paths inside the checkout through `readSource`.
- Exclude common secret/key paths and cap context at six files and 48,000 characters.
- Keep credentials and model calls on the loopback CLI server; reject cross-origin or non-JSON requests.
- Cite only source paths and lines supplied in the evidence bundle; call uncertain interpretations uncertain.
- Preserve non-JavaScript/TypeScript orientation and fallback behavior.

## Review Focus

1. A `.env` or key file selected through search must be refused before any AI call; test in Task 1.
2. A Python, Go, or Rust file with no import edges must still yield useful selected-file context; test in Task 1.
3. A symlink or unscanned path must not be read by context collection; test in Task 1 using `readSource`.
4. A web page on another origin must not trigger a paid AI request against the loopback server; test in Task 2.
5. A model citation to an absent path or line must never become a clickable source claim; test in Task 2 and browser QA in Task 3.

---

### Task 1: Build bounded source evidence

**Files:** Create `packages/cli/src/explain/context.ts` and `packages/cli/src/explain/context.test.ts`. Reuse `packages/cli/src/source.ts`; do not duplicate its path containment.

**Interfaces:**

```ts
export interface EvidenceFile { path: string; content: string; lineCount: number }
export interface EvidenceBundle { selectedPath: string; files: EvidenceFile[] }
export async function buildEvidence(
  rootPath: string,
  selectedPath: string,
  allowedPaths: ReadonlySet<string>,
  imports: ImportGraph | undefined,
): Promise<EvidenceBundle>;
```

Candidate order: selected file; up to three import dependencies/importers ranked by direct graph edge; one matching test path; one nearby README or manifest. Deduplicate paths and never exceed six files or 48,000 source characters. For languages without edges, consider same-stem tests and nearby README/manifest only; do not label siblings as callers. Exclude `.env*`, private keys/certificates, credential/config secret names, and source files whose contents match common private-key headers. Return a specific safe error when selected file is excluded. Use line-numbered evidence for the provider, while preserving original line numbers.

- [ ] Write focused `node:test` cases for selected TypeScript file plus direct import, selected Python file without graph, context budget, `.env` rejection, unscanned path, and symlink escape. Start with this assertion shape:

```ts
const bundle = await buildEvidence(root, "src/main.py", allowed, undefined);
assert.equal(bundle.files[0].path, "src/main.py");
assert.ok(bundle.files.every((file) => allowed.has(file.path)));
```

- [ ] Run `npm run build:cli` and `node --test packages/cli/dist/explain/context.test.js`; confirm new tests fail before implementation.
- [ ] Implement `buildEvidence` using the existing `readSource` for every candidate. Keep stable ranking and explicit size caps.
- [ ] Run the targeted tests, then `npm run typecheck --workspace=walkthrough-cli`.
- [ ] Commit Task 1 as `feat: collect bounded evidence for file explanations`.

### Task 2: Add narrow AI endpoint and validated output

**Files:** Create `packages/cli/src/explain/provider.ts`, `packages/cli/src/explain/handler.ts`, `packages/cli/src/explain/handler.test.ts`; modify `packages/cli/src/index.ts`, `packages/cli/package.json`, and `package-lock.json`.

**Interfaces:**

```ts
export interface Citation { path: string; startLine: number; endLine: number }
export interface ExplanationSection { heading: string; body: string; citations: Citation[] }
export interface FileExplanation {
  title: string;
  sections: ExplanationSection[];
  nextFiles: Array<{ path: string; reason: string; line: number }>;
  exercise: string;
  unknowns: string[];
}
export interface ExplanationProvider {
  explain(evidence: EvidenceBundle): Promise<FileExplanation>;
}
```

Use the official Anthropic SDK with a structured tool schema for `FileExplanation`; configure key server-side from `ANTHROPIC_API_KEY` and model from `WALKTHROUGH_AI_MODEL` or `ANTHROPIC_DEFAULT_SONNET_MODEL`. Do not make a provider call when either is absent. Use bounded output tokens and a request timeout. The provider prompt asks for junior-friendly purpose, architecture role, data flow, related files, a small exercise, and explicit unknowns. The handler validates all citation paths and line ranges against the evidence bundle and drops or rejects invalid links rather than rendering them as facts.

`POST /explain` accepts only `application/json` with `{ "path": "relative/scanned/file" }` and a small body limit. Reject browser origins outside the server's loopback URL and never add permissive CORS headers. Return JSON on success and safe error text on failure; do not echo prompts, keys, or source in errors. Run at most one model request per server instance at a time for the first pilot.

- [ ] Add `@anthropic-ai/sdk` to the CLI workspace with npm. Record resolved version in the lockfile.
- [ ] Write tests with a fake `ExplanationProvider`: successful explanation, missing key/model, invalid JSON/body, foreign origin, refused secret path, provider failure, and fabricated citation. A spy must assert zero provider calls for rejected requests.
- [ ] Run `npm run build:cli` and the new handler test; confirm expected failures before implementation.
- [ ] Implement the provider adapter, citation validator, and endpoint. Keep HTTP plumbing separate from the SDK call so tests never use the network.
- [ ] Run targeted tests and `npm test`; inspect output for secrets or source leakage.
- [ ] Commit Task 2 as `feat: explain scanned files through bounded AI endpoint`.

### Task 3: Make explanation usable beside code

**Files:** Create `packages/visualizer/src/explain/FileExplanationPanel.tsx` and `packages/visualizer/src/ui/SourcePreview.tsx`; modify `packages/visualizer/src/App.tsx` and `packages/visualizer/src/index.css`; update `README.md` and `docs/CODEBASE_GUIDE.md`.

**Interfaces:** `SourcePreview` receives `path`, `onBack`, and `onOpenSource(path, line?)`. It fetches `/source` as today. Its explicit button posts `{ path }` to `/explain` and displays `FileExplanationPanel`. A citation calls `onOpenSource(path, startLine)`; the preview scrolls to that numbered line after source loads. The action label and adjacent disclosure say that selected source snippets go to the configured AI provider. Loading, missing configuration, request failure, and no-citation states are visible without losing the code.

- [ ] Move the existing raw-source preview out of `App.tsx` without changing file search or return navigation. Build and compare existing behavior.
- [ ] Add the explicit Explain action, line numbers, source-linked sections, next-file navigation, and error states. Use plain text for model prose; never inject model HTML.
- [ ] Run `npm run typecheck`, `npm run build`, and `npm test`.
- [ ] Run the local CLI on Walkthrough itself. In a real browser, find `packages/visualizer/src/App.tsx`, open it, click Explain, follow a citation, and return. Check keyboard focus, narrow layout, and that ordinary preview makes no model call. Use a fake provider for repeatable browser QA, then one live provider call to confirm the configured integration.
- [ ] Update docs with provider setup, exact source-sharing boundary, and the limits of language-specific links. Commit Task 3 as `feat: teach selected files in browser`.

## Self-review

The spec's file-first path maps to Task 3; bounded context and cross-language fallback to Task 1; provider, citation, privacy, and failure behavior to Task 2; browser verification to Task 3. The first slice does not promise complete semantic understanding of every repository. The five Review Focus cases each have an owning test or QA step above. Interface names and fields are consistent across tasks; no prerequisite step relies on the external CodeTour extension.

## Execution handoff

After the learner confirms the specific code changes in VibeWise's Implementation checkpoint, execute Tasks 1–3 in order using `superpowers:executing-plans`. Do not add `.vibe-wise/` to a commit without the learner requesting that.
