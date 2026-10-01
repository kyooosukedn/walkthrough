# Path 2 — Storybook: interactions panel drops steps after a handled error

| | |
| --- | --- |
| Repository | [storybookjs/storybook](https://github.com/storybookjs/storybook) (TypeScript, huge framework monorepo) |
| Pinned commit | `d1b14a14bdb6103a9cca69a62658ca475d64825f` |
| Task | Issue [#21746](https://github.com/storybookjs/storybook/issues/21746) — *Interactions panel does not show steps after a handled error in `play`* |
| Task status at authoring | Open, unassigned, labeled `good first issue`, `help wanted`, last updated 2026-09-25. Three prior PRs all closed unmerged; **no open PR claims it.** |
| Local scan | `codemaps/storybook-codemap.json` — 8,438 files, frameworks: next.js, react, vite |
| Time budget | ~12 min for 7 steps + exercise |

⚠️ **Structural note:** the issue predates Storybook 9, which absorbed the old `addon-interactions` into `code/core`. The links below are the *current* locations of that logic, verified at the pinned commit. Part of this path's test value is exactly this: the issue text points at paths that no longer exist, and a newcomer must relocate the logic. The path does that relocation for them.

## Steps

### 1. Get oriented in the monorepo (2 min)

Storybook 9 keeps the whole app in [`code/core`](https://github.com/storybookjs/storybook/tree/d1b14a14bdb6103a9cca69a62658ca475d64825f/code/core). Play-function instrumentation — the machinery behind the interactions panel — lives in [`code/core/src/instrumenter/`](https://github.com/storybookjs/storybook/tree/d1b14a14bdb6103a9cca69a62658ca475d64825f/code/core/src/instrumenter) (`instrumenter.ts`, `preview-api.ts`, `EVENTS.ts`, and a co-located `instrumenter.test.ts`).

### 2. The entry point that wraps story code (1 min)

- [`code/core/src/instrumenter/instrumenter.ts#L749`](https://github.com/storybookjs/storybook/blob/d1b14a14bdb6103a9cca69a62658ca475d64825f/code/core/src/instrumenter/instrumenter.ts#L749) — `instrument<TObj>(...)` recursively wraps an object so every instrumented call is tracked.

### 3. The error path (3 min — the heart of this task)

- [`instrumenter.ts#L563-L580`](https://github.com/storybookjs/storybook/blob/d1b14a14bdb6103a9cca69a62658ca475d64825f/code/core/src/instrumenter/instrumenter.ts#L563-L580) — `handleException` builds the exception record (with `processError` diffing for chai `AssertionError`) and marks the originating call `status: CallStates.ERROR`.

Read this carefully against the issue: when a `play` function `try/catch`es an instrumented call's rejection, the call was **already** marked `ERROR` before user code catches it. The panel's rendering after that is what the issue reports as broken.

### 4. The propagation rule (1 min)

- Immediately below, the *"Exceptions inside callbacks should bubble up to the parent call"* logic (~[`L589-L600`](https://github.com/storybookjs/storybook/blob/d1b14a14bdb6103a9cca69a62658ca475d64825f/code/core/src/instrumenter/instrumenter.ts#L589-L600)) — how errors attach to ancestor calls via `callRefsByResult`.

### 5. Promises and status transitions (2 min)

- [`instrumenter.ts#L659-L676`](https://github.com/storybookjs/storybook/blob/d1b14a14bdb6103a9cca69a62658ca475d64825f/code/core/src/instrumenter/instrumenter.ts#L659-L676) — an instrumented call that returns a Promise goes `ACTIVE` → `DONE`, and a rejection goes to `handleException`. This is the exact branch a handled error flows through.

### 6. From instrumenter to the panel (2 min)

- [`instrumenter.ts#L678-L695`](https://github.com/storybookjs/storybook/blob/d1b14a14bdb6103a9cca69a62658ca475d64825f/code/core/src/instrumenter/instrumenter.ts#L678-L695) — `update()` emits `EVENTS.CALL` on the channel; the manager-side log the user sees in the panel is just the ordered set of these calls.
- For contrast, how `play` steps compose: [`code/core/src/preview-api/modules/store/csf/stepRunners.ts#L27-L38`](https://github.com/storybookjs/storybook/blob/d1b14a14bdb6103a9cca69a62658ca475d64825f/code/core/src/preview-api/modules/store/csf/stepRunners.ts#L27-L38) — `composeStepRunners`.

### 7. The existing tests (1 min)

- [`code/core/src/instrumenter/instrumenter.test.ts`](https://github.com/storybookjs/storybook/blob/d1b14a14bdb6103a9cca69a62658ca475d64825f/code/core/src/instrumenter/instrumenter.test.ts) — your exercise adds a case here, modeled on the existing ones.

## Exercise (the micro-task)

**Predict first** (facilitator notes the prediction, verbatim): *when a `play` function catches an instrumented call's rejection and continues, what status does the caught call end up with, and do subsequent calls still appear in the log?*

Then encode the answer as a characterization test in `instrumenter.test.ts`: a story whose play function awaits an instrumented call that throws, catches it, then performs one more instrumented call. Assert what actually happens today (caught call `ERROR`, later call present with its own status).

## Deterministic success check

```bash
# from repo root (facilitator has already run: yarn install)
yarn test code/core/src/instrumenter
```

- Your new test passes against unmodified source (it documents current behavior) → session check met.
- The check is binary: the suite exits 0, or it doesn't.

## Going further (optional, post-session)

That characterization test is the seed of the real fix discussion for #21746: change the assertion to the *desired* behavior and you have a failing test a maintainer can evaluate. Post-session only — the session itself does not require fixing the panel.

## What this path deliberately does not cover

The manager-side React UI of the panel, vitest-utils internals, and the network channel. The bug's decision point is fully visible from the instrumenter side.
