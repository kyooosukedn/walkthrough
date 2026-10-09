# Fast large-repo scan

## User outcome

A developer opening a large cloned repository reaches Walkthrough's first screen sooner, without losing files, import links, line counts, or source paths. This is the first measured performance slice before the owner's combined product trial.

## Evidence and scope

On 9 October 2026, the current scanner read a local Medusa checkout of 24,201 files and 18,432 import edges in 136.2 seconds under CPU profiling (212 MB heap, 297 MB RSS at completion). A subsequent warm phase run spent 48.2 seconds on file tree plus line counts and 37.6 seconds on imports plus entry points. Reading 22,257 text files serially took 46.2 seconds. Disk cache and profiler overhead make these separate runs unsuitable for a precise before/after percentage.

Use bounded asynchronous reads for line counts and import extraction. Keep result order deterministic. Replace each growing-array import-edge lookup with a map keyed by source and target, preserving the public edge shape and merged import specifiers. Leave directory traversal, cache design, browser payload, and language coverage for later measurements. Do not add a dependency or a Rust component.

## Behavior and constraints

- The `CodeMap` schema and CLI command stay unchanged.
- A file read failure is skipped as today; other files still appear in the map.
- Directory and file counts, line-count semantics, import targets, and edge ordering stay stable for a fixed checkout.
- The number of concurrent reads is bounded (16 by default) to avoid a large spike in file handles or memory.
- A targeted Medusa scan and the standard suite must pass. Report elapsed time, files, edges, and memory; compare only runs with the same checkout and command.

## Reuse decision

Need: read many independent local files efficiently. Choice: use Node's existing `fs/promises` with a small ordered bounded worker helper. Why: the scanner already uses Node, needs no queue persistence or retries, and handles only local filesystem reads. Avoided: `p-limit` adds a dependency for a short primitive; unbounded `Promise.all` risks excessive handles and memory; Rust would not address the observed serial I/O wait.
