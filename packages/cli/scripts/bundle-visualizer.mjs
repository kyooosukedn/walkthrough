// Copies the visualizer build into the CLI package so `npx walkthrough-cli`
// works standalone. Runs after `tsc` in the cli build script.
import { cpSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "visualizer", "dist");
const target = join(here, "..", "dist", "visualizer");

if (!existsSync(source)) {
  console.error("visualizer dist not found — run `npm run build` at the repo root first");
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`bundled visualizer → ${target}`);
