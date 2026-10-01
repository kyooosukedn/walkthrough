# Sprint 1 preparation report

Date: 2026-10-01. Everything in this directory is concierge validation material: hand-authored, facilitator-delivered, nothing published, nothing installed by users.

## What was verified (machine- or evidence-checked, 2026-10-01)

**Repo + task currency** - for each of the three selected tasks, checked: issue open, zero assignees, updated <= 12 days ago, and **no open PR cross-references it** (via GitHub issue timelines):

- vueuse #5610 (updated 2026-09-20; PRs #5611/#5627 closed unmerged, no open claim)
- storybook #21746 (updated 2026-09-25; PRs #34354/#34900/#36275 all closed unmerged, no open claim)
- medusa #17069 (filed/updated 2026-09-30; zero cross-referenced PRs ever)

**Code state at pinned SHAs** - cloned each repo at `--depth 1`, confirmed the bug site in source:

- vueuse `efdd69a1`: `reset()` at `packages/core/useIdle/index.ts#L64-L68` writes neither `lastActive`; existing tests at `index.browser.test.ts#L134-L154` give the model for the new test.
- storybook `d1b14a14`: issue describes old `addon-interactions` paths that no longer exist; logic relocated to `code/core/src/instrumenter/instrumenter.ts` (`handleException` L563-580, promise path L659-676) - path updated to current reality.
- medusa `a9c14c09`: `edit-promotion-details-form.tsx` still has `onSuccess`-only `mutateAsync` (exactly L95 as the issue says); reference pattern confirmed at `edit-product-form.tsx#L77-L80` (`toast` from `@medusajs/ui`).

**Walkthrough scans ran locally** on all three clones (1,581 / 8,438 / 24,200 files; framework detection: vue+vite, next.js+react+vite, express+react+vite). Codemaps under `validation-targets/codemaps/` (outside this repo - see Uncertainty 4).

**Check commands exist** in each repo's own scripts (vueuse `pnpm vitest --project="browser (chromium)"`; storybook root `yarn test`; medusa dashboard `typecheck` via `tsgo`) - none invented.

**Build baseline** (separate, already in draft PR #1): fresh install, build, typecheck, 17 tests, CLI scan, package dry-run pass. Not redone on this branch.

## What remains uncertain (be honest here)

1. **The three success-check commands were not executed end-to-end** (no `pnpm install`/`yarn install` was run against the clones in this preparation pass). Facilitators must run each check once during setup; a first-session surprise here invalidates T-metrics. Highest risk: storybook root vitest invocation (`yarn test <path>` filter behavior) and vueuse playwright-chromium download.
2. **Storybook's characterization exercise asserts current behavior** of a 2023-era issue on SB9 code. Whether maintainers still consider #21746 reproducible is unverified - the maintainer draft asks exactly this.
3. **vueuse PRs #5611/#5627 closed unmerged with no recorded maintainer objection**; reason unknown. If the closes imply a rejected direction, that exercise needs a swap. Mitigated by reading both diffs before any session.
4. **Codemaps and clones live outside this repo** (`../validation-targets/`), so the paths' claim "informed by Walkthrough output" is documented but the artifacts are not in version control. Shipping them would bloat the repo; the report records their provenance instead.
5. **Task scarcity observed during selection** (~28 repos checked: good-first queues empty, claimed by open PRs, or stale within days) - the sprint tests the *onboarding* half of the hypothesis; task *supply* is a separate, real constraint that surfaced during selection and belongs in the week-2 review.

## First decision gate (before any outreach is sent)

**Gate: maintainer acknowledgment for at least two of the three repos, plus one dry-run of a full 15-minute protocol on a friendly pilot (not counted in metrics).**

If either half fails, fix before recruiting: paths whose target repo declines get replaced from the selection evidence (medusa's queue alone had 5 other fresh unclaimed tasks on 2026-10-01), and a protocol that the pilot facilitator cannot run cleanly is a measurement instrument problem, not a hypothesis result.

After that, the sprint's go/no-go thresholds are in `metrics-sheet.md` (>= 5/10 completions, >= 2 maintainers, >= 3 unprompted repeat-intent).

## Selection evidence (audit trail)

Checked 2026-10-01 via GitHub API: hono, zod, tRPC, TanStack (query/form/router), documenso, cal.com, unjs (ofetch/h3), refined-github, dub, formbricks, payload, medusa, directus, msw, Effect, vueuse, excalidraw, hoppscotch, backstage, grafana, strapi, langfuse, vercel/ai, openai-node, prisma, pinia, n8n, slidev, storybook, chartjs, mermaid, DefinitelyTyped + a language-wide search of issues created since 2026-09-20.

Rejected for: queue empty or all assigned (most), open PRs already claiming the only fresh tasks (excalidraw x2, hoppscotch, backstage, hono x3, tRPC x2, cal.com x2), stale > 4 months (cal.com #25422), or issue no longer matching repo structure without relocation work the path would have to do itself (accepted for storybook only, deliberately, as the hostile-room case).
