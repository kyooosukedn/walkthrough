# Source-linked agent teaching notes

## User outcome

A beginner watching an observed Claude Code or Codex CLI session can see a short explanation after an agent response: what a cited file does or why the agent says it changed that file. They can open the current file and check the claim. The note must be visibly attributed to the agent, never to Walkthrough's event observer.

## First slice

`walkthrough observe <repo> --host <claude|codex> --teach` opts in. The already-running host is asked to add one short `WALKTHROUGH_NOTE: repo/relative/path | explanation` line at the end of its visible answer. Claude receives a static `SessionStart` hook context; Codex receives the instruction appended to the explicit task prompt. Neither path starts a second model session or needs a separate API key.

Only that marked line is read from Claude's `Stop.last_assistant_message` or Codex's completed `agent_message` item. Raw answers, reasoning items, prompts, command output, and source contents do not enter the activity stream. The adapter accepts one note per completed response, at most 600 characters, when the cited file exists inside the checkout and is not a common secret path. The collector applies its own existing text and path checks again. If the host omits the marker, cites an invalid file, or returns unsafe text, the ordinary observed timeline continues without a note.

The browser displays the result as **Agent said**, adds "Check this claim in the current file," and opens the verified file through the existing source preview. The file link verifies location and current contents; it does not prove the agent's causal explanation or provide a per-action diff. This slice teaches after a completed response, not while a tool is running.

## Constraints

- Teach mode is explicit. Ordinary observation keeps its existing privacy boundary and behavior.
- One local collector session and bounded in-memory replay remain unchanged.
- No new model provider, package dependency, public endpoint, or cloud storage.
- Both hosts must use the same note marker and parser. Missing or malformed notes fail closed.
- The host's user-visible reply is untrusted. Do not display arbitrary response text, private reasoning, or unchecked file paths.

## Success check

In a fixture repo, a teaching-mode host response containing a valid note produces one **Agent said** card with a working source link; a normal observed run produces none. Unsafe text, secret paths, paths outside the checkout, and reasoning items never become teaching notes. Existing file/source/Explain behavior and normal activity tests still pass.
