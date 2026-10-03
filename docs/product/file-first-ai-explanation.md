# File-first AI explanation — first slice

Status: implemented on `feat/file-first-ai`; awaiting personal pilot and review.

## Outcome

A developer opens a file they found in any local checkout and asks Walkthrough to explain it as a skilled engineer would to a junior. The explanation covers purpose, important code and data flow, connections, useful next files, a small question or exercise, and what cannot be concluded from the available source. Every code-specific claim links to a file and line. Opening a file alone never sends source to an AI provider.

## First interaction

Keep the existing file-first path. The source preview adds **Explain this file** beside the file name, with text saying that a small selection of source files will be sent to the configured AI provider. Clicking it opens an explanation panel beside the source. Clicking a citation or recommended next file opens that file and scrolls to the cited line. The user can return to the repo overview. No separate editor extension or goal picker is needed.

## Evidence before narration

The local CLI gathers context within a fixed budget: the selected file, up to three direct import dependencies or importers when Walkthrough's existing JavaScript/TypeScript import graph has them, a matching test file, and a nearby README or manifest. Other languages still receive the selected file and path-based neighbors; the interface must say when relationship analysis is unavailable. A request reads only paths in the scanned file tree through the existing contained source reader. It excludes common secret and key files, binary data, and files outside the checkout. Limit the first request to six files and 48,000 source characters; show the actual sources used.

The AI receives numbered lines and returns structured sections with file/line citations. The CLI checks that cited paths were included and cited lines exist before showing them as links. Uncited interpretation is labeled as such; unknown behavior is stated as unknown. The result is an explanation of inspected evidence, never a claim to have executed or fully understood the repository.

## AI boundary

Use an on-demand `POST /explain` endpoint on the loopback CLI server. Keep API credentials server-side. For the first working provider, use the maintained official Anthropic SDK behind a small local provider interface; this machine has `ANTHROPIC_API_KEY` configured and the user previously asked about Claude. The model is configurable through `WALKTHROUGH_AI_MODEL` (or the existing Anthropic Sonnet model environment setting). Do not read or send source until the user clicks **Explain this file**. Do not log source, prompts, keys, or model output. Cap response tokens and request time. Reject cross-origin browser requests and non-JSON bodies.

This provider choice is proposed for the pilot, not a requirement that every future user use Claude. The provider interface should allow another service later. A local model is not installed here. Spawning a general coding agent would give the feature broader filesystem and tool access than the explanation needs, so the first slice uses a narrow SDK call instead.

## Acceptance

- A file found through Walkthrough's existing search opens in the source preview; **Explain this file** requires one deliberate click.
- With provider configuration, a real AI explanation appears next to the chosen file and cites exact included source lines. Related file links open the local preview.
- With no provider configuration or a failed request, the UI shows a useful error and keeps source browsing available.
- TypeScript/JavaScript uses known import edges; Python/Go/Rust or unsupported languages still receive bounded path-based context without fabricated import relationships.
- An attempted `.env`, key file, unscanned path, traversal, symlink escape, binary, or oversized file cannot be sent to the model.
- The existing scan and initial overview perform no AI call and run no repository code.
- A personal pilot on Walkthrough's own codebase can explain a selected file end to end. Medusa remains the large-repo follow-up after the first slice is stable.

## Boundaries

No chat, autonomous code editing, background indexing, vector database, automatic whole-repo upload, or generated runtime call graph in this slice. The existing architecture tour remains separate. Keep the personal `.vibe-wise/` notes out of commits.

## Reuse decision

Need: a source-backed AI explanation from a selected local file. Choice: reuse the current source preview and contained reader, existing import graph where available, and the official Anthropic SDK for the model call. Why: these provide most of the flow with one focused dependency and a narrow server boundary. Avoided: CodeTour as required playback (the pilot failed to start for the user), a new editor extension, general agent subprocesses, and a vector store before there is evidence they are needed.
