# Fast Large-Repo Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut serial file-read latency in large repositories while preserving scanner results.

**Architecture:** One ordered bounded worker helper reads independent files. File-tree line counting and import extraction use it. Import-edge deduplication uses a map. Public scanner output and the CLI remain unchanged.

**Tech Stack:** Node.js `fs/promises`, TypeScript, Vitest.

**Spec:** [Fast large-repo scan design](../specs/2026-10-09-fast-large-repo-scan-design.md)

## Global Constraints

- Keep `CodeMap` schema and CLI command unchanged.
- Preserve deterministic file, line, node, and edge results for a fixed checkout.
- Bound reads to 16 in-flight operations; avoid new dependencies.
- Continue past unreadable files as the current scanner does.

## Review Focus

- Empty input must finish without worker errors.
- Slow and fast reads must return results in input order.
- A failed read must not stop unrelated files from being scanned.
- Duplicate specifiers for one source-target edge must be merged once.
- Large-repo speedup must not raise memory beyond a useful first-run level.

## Task 1: ordered bounded reads for file-tree counts

**Files:** `packages/scanner/src/analyzers/ordered-map.ts`, `.test.ts`, `file-tree.ts`, `file-tree.test.ts`.

- [x] Add a failing helper test for bounded concurrency, input ordering, and empty input.
- [x] Implement an ordered `mapBounded` helper using at most 16 concurrent workers; make the helper test pass.
- [x] Add a file-tree fixture that pins file and directory counts and line totals. Read failures remain caught per file.
- [x] Gather text file nodes synchronously from the tree, read them with `mapBounded`, and sum line counts in returned order. Preserve existing extensions and skip behavior.
- [x] Run scanner tests and typecheck; commit.

## Task 2: bounded import extraction and indexed deduplication

**Files:** `packages/scanner/src/analyzers/imports.ts`, `imports.test.ts`.

- [x] Add a failing test for overlapping bounded reads, duplicate specifier merging, and stable edge order.
- [x] Read parseable files through `mapBounded` and fold returned import lists in original file order.
- [x] Replace `edges.find` with a `Map` keyed by source and target; preserve edge arrays and specifier order.
- [x] Run scanner tests and typecheck; commit.

## Task 3: measured release check

**Files:** `docs/product/large-repo-performance.md`, possibly scanner tests if checks expose a bug.

- [x] Run full build, typecheck, and tests.
- [x] Run the same Medusa checkout scan at least twice after the change. Record elapsed time, 24,201-file and 18,432-edge baseline comparison, heap and RSS, and explain warm-cache limits.
- [x] Document the measured result, decision to defer caching/Rust, and the next bottleneck.
- [x] Open [draft PR #9](https://github.com/kyooosukedn/walkthrough/pull/9) stacked on teaching-notes PR #8 after diff review.
