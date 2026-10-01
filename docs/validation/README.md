# Validation sprint 1 - first-contribution paths (weeks 1-2)

**Hypothesis under test:** a guided, source-linked path helps a newcomer make a first contribution to an unfamiliar TypeScript repository.

This directory contains everything needed to run a two-week, manual (concierge) validation. Nothing here is a product: no npm package is published, no CLI is installed by users, and no claim of demand is made. Paths are hand-authored markdown informed by Walkthrough scans, delivered by a facilitator.

## Contents

| File | What it is |
| --- | --- |
| `paths/vueuse-useIdle-reset.md` | Path 1 - library bug, small file, one-line fix + test |
| `paths/storybook-interactions-handled-errors.md` | Path 2 - framework monorepo, code relocated since the issue was filed |
| `paths/medusa-promotion-edit-onerror.md` | Path 3 - platform admin app, follow-the-house-pattern fix |
| `user-test-script.md` | 15-minute observed-session protocol |
| `metrics-sheet.md` + `metrics-template.csv` | What we record per session; thresholds |
| `outreach/newcomer-outreach.md` | Draft recruitment messages - **do not send before maintainers are asked** |
| `outreach/maintainer-outreach.md` | Draft maintainer asks - **do not send yet** |
| `REPORT.md` | What was verified, what is uncertain, decision gate |

## Why these three repositories

Selection criteria: TypeScript-first, actively maintained, open newcomer-labeled (or equivalently scoped) issue, updated within ~2 weeks, unassigned, and **no open PR claiming it** (checked via issue cross-references, 2026-10-01). The three span the difficulty spectrum a first-time contributor actually meets:

| Repo | Shape | Task kind | Why it's here |
| --- | --- | --- | --- |
| vueuse | mid-size library | one-line fix + test | Clean room: single file, deterministic test, canonical first-PR shape |
| storybook | 9k-file framework monorepo | characterization test | Hostile room: the issue's file paths no longer exist; relocation is half the work |
| medusa | 24k-file platform app | copy-the-house-pattern fix | Realistic room: fix is trivial once you find the pattern 6 levels deep in routes |

Selection evidence and the ~28 repositories that were rejected (queues drained, claimed by open PRs, or stale) are in `REPORT.md`.

## How a session runs (short version)

1. Facilitator preps the clone at the pinned SHA: install + any test prerequisites (per-path deterministic success check section).
2. 15 minutes, observed, following `user-test-script.md`: newcomer first tries the task with their usual approach, *then* gets the path.
3. Facilitator records metrics into a copy of `metrics-template.csv`.

## Ground rules

- The paths are **concierge artifacts**, not generated-by-the-tool output; the sprint explicitly tests hand-authored paths first (see `PROJECT_DIRECTION_PLAN.md`, weeks 1-2).
- Every source link is pinned to a commit SHA. If a repo moves (as storybook already did), the path degrades loudly - that staleness risk is itself one of the measured risks.
- No outreach is sent from this branch. Sending requires maintainer contact first (plan step 3), per the drafts' own warnings.
