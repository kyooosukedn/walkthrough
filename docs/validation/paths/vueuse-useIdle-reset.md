# Path 1 — vueuse: `useIdle` doesn't update `lastActive` on `reset()`

| | |
| --- | --- |
| Repository | [vueuse/vueuse](https://github.com/vueuse/vueuse) (TypeScript, Vue composables library) |
| Pinned commit | `efdd69a1481205051e85d9c815eaa5840237f2d1` |
| Task | Issue [#5610](https://github.com/vueuse/vueuse/issues/5610) — *BUG: `useIdle` — `lastActive` is not updated upon `reset()`* |
| Task status at authoring | Open, unassigned, labeled `good first issue`, last updated 2026-09-20. No open PR claims it (#5611, #5627 closed unmerged 2026-09-08). |
| Local scan | `codemaps/vueuse-codemap.json` — 1,581 files, frameworks: vue, vite |
| Time budget | ~12 min for 7 steps + exercise |

All source links below are pinned to the commit above so they cannot drift while the sprint runs.

## Steps

### 1. Read the public contract first (2 min)

Everything `useIdle` promises to callers is one interface:

- [`packages/core/useIdle/index.ts#L34-L38`](https://github.com/vueuse/vueuse/blob/efdd69a1481205051e85d9c815eaa5840237f2d1/packages/core/useIdle/index.ts#L34-L38) — `UseIdleReturn`: `idle`, `lastActive`, `reset` (plus `Stoppable`'s `start`/`stop`).

The issue lives exactly on the seam between two of these promises: `reset()` restarts idleness but not `lastActive`.

### 2. See the state the function owns (1 min)

- [`index.ts#L58-L62`](https://github.com/vueuse/vueuse/blob/efdd69a1481205051e85d9c815eaa5840237f2d1/packages/core/useIdle/index.ts#L58-L62) — `idle`, `lastActive = timestamp()`, `isPending`, and a raw `timer` handle.

Note `lastActive` is set exactly once here, at creation time.

### 3. Find the bug (2 min)

- [`index.ts#L64-L68`](https://github.com/vueuse/vueuse/blob/efdd69a1481205051e85d9c815eaa5840237f2d1/packages/core/useIdle/index.ts#L64-L68) — `reset()` sets `idle.value = false` and restarts the timer. **It never writes `lastActive`.**

Compare with the issue's repro: a component calling `reset()` on `mouseenter` shows a fresh idle countdown but a stale "seconds since active" readout.

### 4. Find where `lastActive` *does* update (2 min)

- [`index.ts#L70-L76`](https://github.com/vueuse/vueuse/blob/efdd69a1481205051e85d9c815eaa5840237f2d1/packages/core/useIdle/index.ts#L70-L76) — `onEvent` sets `lastActive.value = timestamp()` then calls `reset()`. It is wrapped in `createFilterWrapper(eventFilter, …)` with the default `throttleFilter(50)` (see options at [`L51-L57`](https://github.com/vueuse/vueuse/blob/efdd69a1481205051e85d9c815eaa5840237f2d1/packages/core/useIdle/index.ts#L51-L57)).

So activity events update `lastActive`; a manual `reset()` call bypasses `onEvent` entirely.

### 5. Trace how events reach `onEvent` (1 min)

- [`index.ts#L78-L96`](https://github.com/vueuse/vueuse/blob/efdd69a1481205051e85d9c815eaa5840237f2d1/packages/core/useIdle/index.ts#L78-L96) — listeners for `defaultEvents` ([`L10`](https://github.com/vueuse/vueuse/blob/efdd69a1481205051e85d9c815eaa5840237f2d1/packages/core/useIdle/index.ts#L10)), the `isPending` gate at [`L84-L85`](https://github.com/vueuse/vueuse/blob/efdd69a1481205051e85d9c815eaa5840237f2d1/packages/core/useIdle/index.ts#L84-L85), and the `visibilitychange` branch.

### 6. Lifecycle (skim, 1 min)

- [`index.ts#L101-L113`](https://github.com/vueuse/vueuse/blob/efdd69a1481205051e85d9c815eaa5840237f2d1/packages/core/useIdle/index.ts#L101-L113) — `start()`/`stop()` and what they imply for `reset()` being safe to call while stopped.

### 7. The tests (3 min)

- [`packages/core/useIdle/index.browser.test.ts#L134-L145`](https://github.com/vueuse/vueuse/blob/efdd69a1481205051e85d9c815eaa5840237f2d1/packages/core/useIdle/index.browser.test.ts#L134-L145) — existing test "`should update lastActive timestamp on activity`": your new test will mirror this.
- [`index.browser.test.ts#L147-L154`](https://github.com/vueuse/vueuse/blob/efdd69a1481205051e85d9c815eaa5840237f2d1/packages/core/useIdle/index.browser.test.ts#L147-L154) — existing test for `reset()` (idle side only).

## Exercise (the micro-task)

1. In `packages/core/useIdle/index.browser.test.ts`, add one test next to L147:

   ```ts
   it('should update lastActive on reset', async () => {
     vi.useFakeTimers()
     const timeout = 1000
     const { lastActive, reset } = useIdle(timeout)
     const initialTime = lastActive.value
     vi.advanceTimersByTime(500)
     reset()
     expect(lastActive.value).toBeGreaterThan(initialTime)
     vi.useRealTimers()
   })
   ```

2. Run it against the *unmodified* source — **it should fail.** That is the bug, reproduced deterministically.

## Deterministic success check

```bash
# from repo root (facilitator has already run: pnpm install && pnpm exec playwright install chromium)
pnpm vitest run --project="browser (chromium)" packages/core/useIdle
```

- **Before fix:** your new test fails, existing tests pass.
- **After fix** (add `lastActive.value = timestamp()` inside `reset()` at `index.ts#L64-L68`): your test passes, all other `useIdle` tests still pass.

Pass/fail is machine-checked; no judgment call involved.

## Going further (optional, post-session)

The failing test + one-line fix is a complete PR for issue #5610. Two prior PRs (#5611, #5627) were closed unmerged with no maintainer rejection on record — reading their diffs first is cheap insurance.

## What this path deliberately does not cover

`useIntervalFn`, the shared `createFilterWrapper`/`throttleFilter` internals, and SSR behavior. Not needed for this task.
