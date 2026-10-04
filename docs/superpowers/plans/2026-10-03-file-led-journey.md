# File-led Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let a beginner follow source-linked explanations from a selected file and revisit previous stops without losing explanations or making repeat AI requests.

**Architecture:** Keep a small journey state in the visualizer's `App`, separate from the existing architecture tour. Each step stores a scanned file path, optional line, and why it was opened. Cache validated explanation responses by path in browser memory. Reuse the current contained source and DeepSeek endpoint; improve its teaching prompt without changing the response schema.

**Tech Stack:** React 19, TypeScript, Vite, Vitest already used in the monorepo, existing Walkthrough CLI and DeepSeek provider.

**Spec:** `docs/superpowers/specs/2026-10-03-file-led-journey-design.md`

## Global Constraints

- AI calls remain explicit; source preview alone sends no source to DeepSeek.
- No repository code execution, persistent journey data, new editor framework, or new graph engine.
- Only server-validated citations and next-file links are clickable.
- Works with any scanned file type; don't assert unsupported language relationships.
- Preserve `.vibe-wise/` and other unrelated local files.

## Review Focus

- Clicking a citation for the current file should scroll, not duplicate the step.
- Returning to an earlier step should display its cached explanation and never auto-request AI.
- Following a new next-file link from an earlier step should cut the old forward path.
- A stale AI response after navigation should not attach to the newly opened file.
- When DeepSeek is unconfigured, the trail and source preview still work and Explain shows the existing setup error.

---

### Task 1: Journey state with unit tests

**Files:**
- Create: `packages/visualizer/src/journey/state.ts`
- Create: `packages/visualizer/src/journey/state.test.ts`
- Modify: `packages/visualizer/package.json`
- Modify: `package.json`

**Interfaces:**
- Produce `JourneyStep { path: string; line?: number; reason?: string }` and `Journey { steps: JourneyStep[]; activeIndex: number }`.
- Produce pure functions `startJourney(path, line?)`, `followJourney(journey, step)`, and `jumpJourney(journey, index)`.
- `followJourney` appends after `activeIndex`, truncates the forward trail, and updates `activeIndex`; if target path equals the active step's path, update its line without appending.
- `jumpJourney` returns the same journey for an out-of-bounds index.

- [x] Write Vitest cases for one-step start, append, same-file line update, backward jump, branch truncation, and invalid jump.
- [x] Run the focused test and observe it fail before implementation.
- [x] Implement the pure state functions, keeping state free of React and network calls.
- [x] Declare the existing Vitest version in the visualizer dev dependencies, add a visualizer `test` script, and include it in root `npm test`.
- [x] Run the focused test and verify it passes.

### Task 2: Preserve learning trail and explanation responses

**Files:**
- Modify: `packages/visualizer/src/App.tsx`
- Modify: `packages/visualizer/src/ui/SourcePreview.tsx`
- Modify: `packages/visualizer/src/explain/FileExplanationPanel.tsx`
- Modify: `packages/visualizer/src/index.css`

**Interfaces:**
- `App` owns `Journey | null` and an in-memory `Record<string, FileExplanation>` cache.
- `SourcePreview` receives current step, trail, jump/follow callbacks, cached explanation, and an `onExplanation(path, response)` callback.
- `FileExplanationPanel` distinguishes `Read next` from citation callbacks so reason text enters the trail only for next-file suggestions.

- [x] Wire opening a file from overview to `startJourney` and returning to overview to a fresh-start state.
- [x] Wire `Read next` to `followJourney`, using the server-validated path, reason, and line. Wire same-file citations to line navigation and cross-file citations to a trail step labeled `Source citation`.
- [x] Render the trail above source/explanation columns with active step, reasons, and keyboard-accessible buttons for prior steps.
- [x] Cache successful explanations by path. Pass cached data into `SourcePreview`; don't auto-explain a newly followed file. Preserve the current abort-on-navigation guard and ensure a late response cannot populate another file.
- [x] Run visualizer typecheck and build; fix any interface or accessibility errors.
- [x] Manually verify start, next, back, and branch in a browser with a deterministic mock explanation if no live DeepSeek key is configured. Never present a mock as live AI validation.

### Task 3: Teach the beginner, document the experience, and verify

**Files:**
- Modify: `packages/cli/src/explain/provider.ts`
- Modify: `packages/cli/src/explain/provider.test.ts`
- Modify: `README.md`
- Modify: `docs/CODEBASE_GUIDE.md`

**Interfaces:**
- Keep the existing JSON response schema and server validation unchanged.
- Prompt for purpose, architectural role, data/control flow, related files, a small prediction/inspection exercise, and unknowns in plain language. Every code claim needs supplied-file citations.

- [x] Add/adjust provider test assertions so a mocked request proves the prompt asks for beginner-level teaching and supplied-source citations, without checking exact prose.
- [x] Run the provider test and see the new assertion fail before changing the prompt.
- [x] Revise the prompt and update README and codebase guide to describe the file-led journey and its limits.
- [x] Run `npm run build`, `npm run typecheck`, and `npm test` once after the final edits; investigate any failure.
- [x] Inspect `git diff` for unrelated changes and report explicitly whether live DeepSeek was tested.
