# Walkthrough — Roadmap

**Updated:** 2026-11-02 · **Status:** v0.1 release candidate

## v0.1 — "It works on real repos" (now)

| Feature | Status |
|---|---|
| Scanner → `codemap.json` → browser, one command | ✅ |
| First screen: start-here files, landmarks, file search, read-only preview | ✅ |
| Guided tour: structure → entry points → routes → modules → how they connect → config | ✅ |
| Import graph: JS/TS (incl. tsconfig aliases), Python, Go, monorepo packages | ✅ |
| Views: overview, routes (Next.js, Express), React components, database (Prisma/SQL) | ✅ |
| Local server hardened (loopback only, no path traversal, DNS-rebinding guard) | ✅ |
| Single self-contained npm package, Node 18+ | ✅ |
| Publish to npm as `code-walkthrough` | ⏳ needs owner's npm login |

Validated by hand on: vercel/commerce, express, full-stack-fastapi-template, gin, create-t3-app, medusa (25k files, ~4 s), and Walkthrough itself.

## Next

- Rust imports and Python web routes (FastAPI/Django/Flask)
- Medusa-style file-based API routes (`src/api/**/route.ts`)
- Smaller browser payload for very large repos (the map JSON for 25k files is ~15 MB)
- Share a tour as a static page (`--export`)

## Not planned (on purpose)

- A rewrite in Rust or another native language — scanning is not the bottleneck,
  and native binaries would break the zero-dependency `npx` install.
- AI agent observers / LLM explanations (explored in draft PRs #5–#9) — a different product.
