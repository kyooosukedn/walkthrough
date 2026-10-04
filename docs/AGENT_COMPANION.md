# Walkthrough in Codex or Claude Code

Start with a file you found in a large repository. Walkthrough scans the local checkout, collects a small set of source excerpts, and gives your assistant enough evidence to explain that file and suggest where to read next. The lesson appears in the assistant chat. The browser app remains a separate place to browse the map and source.

## Local setup

From the Walkthrough checkout:

```bash
npm install
npm run build
npm link --workspace=walkthrough-cli
```

The link makes `walkthrough` available in your terminal. Check it with `walkthrough --help`. No DeepSeek API key is needed for lessons in Codex or Claude Code; you need access to the assistant you choose.

For Codex, copy `.agents/skills/repo-guide` into your user skills directory (`~/.codex/skills/repo-guide`). Start a new chat in the repository you want to learn and ask: `$repo-guide Explain src/example.ts to me as a beginner.` Replace the path with a file that exists there. You can also keep the skill in a repository's `.agents/skills/` directory for project-local use.

For Claude Code, launch it with this checkout as a local plugin: `claude --plugin-dir <path-to-walkthrough>`. In a chat about your target repository, use `/walkthrough:repo-guide` and name a repo-relative file. The plugin points to the same skill instructions as Codex.

You can inspect exactly what Walkthrough gives the assistant before asking for a lesson:

```bash
walkthrough ./path/to/repo --lesson-context src/example.ts
```

The output is JSON. It includes selected source, up to three related import files for JavaScript or TypeScript, a matching test and nearby README when found, plus basic repo orientation. It never executes the scanned repository. Import links are static hints. For Python, Go, Rust, and other languages, the first version usually supplies the selected file, a conventionally named test, and nearby docs; deeper cross-file tracing comes later.

The context is limited to six files and 48,000 source characters. Common secret paths and private-key content are blocked, but the filter cannot identify every secret inside ordinary source. Review the packet before using it with sensitive code. The assistant host receives these excerpts under its own account and data policy. In this mode Walkthrough makes no separate DeepSeek request and writes no `codemap.json`.

The browser's **Explain this file** button still uses the optional DeepSeek integration. A direct browser-to-Codex or browser-to-Claude handoff is a separate feature; this companion teaches in chat today.

## Watch an agent work in the browser

Build Walkthrough from this checkout with `npm install` and `npm run build`. The CLI package now contains the observer plugin, so a package install will work once the CLI and its scanner dependency are published to npm. Then start a new, explicitly observed session:

```bash
node packages/cli/dist/index.js observe ./path/to/project --host claude
node packages/cli/dist/index.js observe ./path/to/project --host codex --prompt "Find the main entry point and explain it"
```

The first command opens interactive Claude Code in the target directory. The second runs one non-interactive Codex CLI task. Both require their respective CLI installed and signed in. Walkthrough opens a local browser page; click **Watch agent activity**. Keep the Walkthrough terminal open while you watch. A browser refresh replays up to 500 retained events. Closing the browser does not interrupt the agent.

For Codex, use a Git checkout as the target. `codex exec` exits before starting a turn when its checkout check fails; the feed reports that exit, but cannot show the host's private stderr.

Each card says what the host reported doing and whether it completed or failed. **Observed** means a host event or tool result, not an independent test of correctness. **Agent said** is reserved for host-authored messages when an adapter supplies them. Open a linked file to see its *current* contents; this is not a per-action diff. New files created during the session are available after the collector accepts the file event. The collector, feed, and source preview run on loopback and stay in memory; Walkthrough does not send activity to a cloud service or need a DeepSeek key for this view.

This first release observes sessions started by these commands. It cannot attach to an existing Codex Desktop chat or arbitrary agent process. It omits raw prompts, command text and output, full environment variables, private reasoning, and files outside the checkout. Claude hooks report tool events from Claude Code; Codex events come from `codex exec --json` and therefore cannot make the session interactive. The Claude observer plugin is included in the CLI package; it does not require a separate plugin install. Ordinary `walkthrough <repo>` scans without starting an agent or showing the activity tab.
