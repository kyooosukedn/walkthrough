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
        const { normalizeClaudeHook } = await import("../dist/activity/adapters/claude.js");
        const event = normalizeClaudeHook(JSON.parse(input), process.env.CLAUDE_PROJECT_DIR || process.cwd());
        if (event) {
          await fetch(new URL("/activity/events", base), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(event),
            signal: AbortSignal.timeout(400),
          });
        }
      }
    }
  } catch {
    // Hook must never block Claude or surface collector failures in its transcript.
  }
}
