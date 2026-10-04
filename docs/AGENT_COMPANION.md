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
