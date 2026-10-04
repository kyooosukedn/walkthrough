// Observational hook: all failures are silent so Claude's work continues.
const observerUrl = process.env.WALKTHROUGH_ACTIVITY_URL;
const token = process.env.WALKTHROUGH_ACTIVITY_TOKEN;

if (observerUrl && token) {
  try {
    const base = new URL(observerUrl);
    if (base.protocol === "http:" && ["127.0.0.1", "localhost"].includes(base.hostname) && base.port && !base.username && !base.password && !base.search && !base.hash) {
      let input = "";
      for await (const chunk of process.stdin) {
        input += chunk;
        if (input.length > 262_144) break;
      }
      if (input.length <= 262_144) {
        const { normalizeClaudeHook, normalizeClaudeTeachingNote } = await import("../dist/activity/adapters/claude.js");
        const { TEACHING_NOTE_INSTRUCTION } = await import("../dist/activity/teaching-note.js");
        const hookInput = JSON.parse(input);
        const repoRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
        const teach = process.env.WALKTHROUGH_TEACH === "1";
        if (teach && hookInput.hook_event_name === "SessionStart") {
          process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: TEACHING_NOTE_INSTRUCTION } }) + "\n");
        }
        const send = async (event) => {
          await fetch(new URL("/activity/events", base), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(event),
            signal: AbortSignal.timeout(400),
          });
        };
        const event = normalizeClaudeHook(hookInput, repoRoot);
        if (event) await send(event);
        const note = normalizeClaudeTeachingNote(hookInput, repoRoot, teach);
        if (note) await send(note);
      }
    }
  } catch {
    // Hook must never block Claude or surface collector failures in its transcript.
  }
}
