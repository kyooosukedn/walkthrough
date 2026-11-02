# First-run journey

The [project decision](https://app.notion.com/p/3edf02c30c8a81aca002c71caccb00b0) defines the first 20 minutes. This file records the build contract.

## User outcome

A developer who cloned an unfamiliar repository can find its key docs, manifests, source roots, tests, and plausible starting points before deciding what code to follow. The first screen must help even when no language-specific analyzer applies.

## First screen

Show repo name, detected language/frameworks, file count, and four source-backed lists: docs, manifests, test locations, and source roots. Show a few suggested starting files from entry points and routes. Give the learner a filename/path search. Paths must come from the scanned file tree; an analyzer claim without a matching file is not shown as a starting point. Keep the existing graph tour as an optional exploration route.

Label coverage plainly: structure is available from the file tree; symbols and workflow links are only available when their analyzers provide evidence. Do not imply a runtime trace. For an empty or unsupported repo, show its structure and an honest explanation rather than a blank diagram or fabricated workflow.

## Boundaries

Scanning does not execute repository code or upload source. Source viewing must read only a scanned file inside the selected checkout. File paths in the map stay relative and use forward slashes. The opening screen does not promise a generated learning path; a separate build slice will create and play one source-linked path.

## Acceptance

- TypeScript, Python, Go, and mixed/unsupported fixtures all show a nonempty orientation when relevant files exist.
- Suggested files and search results resolve to actual scanned files.
- Missing framework/entry-point support is explicit.
- A learner can inspect a file, return to orientation, or choose the existing tour.
- No repository script runs during orientation.
