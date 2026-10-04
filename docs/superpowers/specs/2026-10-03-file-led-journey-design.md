# File-led learning journey

## User outcome

A beginner opens a file in an unfamiliar repository and can follow a short, source-linked learning trail. Each stop explains what the file does, why it matters, and what file to read next. The learner can return to an earlier stop without losing the explanation or making another AI request.

This is the first vertical slice of Walkthrough's larger promise: a patient senior engineer guiding a person through a large codebase. It does not claim a complete runtime call graph or automatic understanding of every language.

## Existing foundation

The scanner provides the file tree, entry points, and optional language-specific relationships. The local CLI serves contained source previews and a DeepSeek-backed `POST /explain` endpoint. The browser displays a selected file, an on-demand cited explanation, and `Read next` links. Clicking those links currently replaces the source view and loses the prior explanation.

## Experience

1. The learner finds a real file through orientation or search and opens it. This starts a journey at that file.
2. They explicitly click **Explain this file**. Walkthrough shows the code and a beginner-oriented explanation with source citations, a small exercise, known unknowns, and suggested next files. Source viewing alone sends nothing to the AI provider.
3. A **Read next** link adds a step to the journey. The next file opens at the cited line. The trail shows the file and the reason it was suggested.
4. The learner can move to any earlier step. Previously generated explanations remain available in browser memory for this session. Returning to an earlier step makes no AI request.
5. Following a different next file from an earlier step branches the journey and discards only the forward trail. The browser may retain cached explanations for files already explained.
6. A source citation opens its cited file and line without pretending that citation is an AI-selected next lesson. Same-file citations scroll to the line. Cross-file citations may open the file as a trail step labeled as a source citation.
7. Returning to repo overview and opening a new file starts a fresh trail. No journey data is persisted or uploaded beyond the existing explicit explanation request.

## Teaching contract

The provider should write for a beginner: purpose, role in the repo, important input/output or control flow, concrete source-backed connections, one safe thing to inspect or predict, and explicit gaps. It must use the supplied evidence only, not invent behavior. Existing server validation remains the authority for clickable paths and lines. The UI must distinguish source-backed facts from gaps.

## Boundaries and safety

- Reuse the current source reader, evidence limits, secret-file exclusions, loopback handler, and DeepSeek server-side credential.
- Do not execute cloned repository code, modify source files, or silently send files to DeepSeek.
- Keep the trail in memory. It should remain usable without a configured AI key, although explanations then show the existing setup error.
- Keep the journey useful for any file type. Deeper dependency edges remain conditional on analyzer support.
- No new editor framework, graph engine, or dependency is needed for this slice.

## Acceptance

- Starting from any scanned file shows a one-step trail.
- Following a suggested next file shows the right reason and line, and back/jump restores the prior explanation without a new request.
- Branching from an earlier step truncates forward navigation correctly.
- Same-file citations scroll without adding a duplicate step.
- New file selection from overview starts a fresh trail.
- Existing source and explanation security tests, build, typecheck, and scanner tests pass.
- A manual browser walkthrough on the Walkthrough repo demonstrates start → explain → next → back → branch, with a mock or live provider clearly identified.

## Deferred

Automatic multi-file journey generation, universal symbol resolution, verified exercises, persistent learning history, repo script execution, and a full in-browser editor. These should follow observed beginner use, not be assumed necessary now.
