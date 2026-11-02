import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Folders that hold dependencies, build output or caches — never project code.
 * One list shared by every analyzer that walks the disk.
 */
export const IGNORE_DIRS = new Set([
  // JS
  "node_modules", ".next", ".nuxt", ".svelte-kit", "dist", "build", "out", "coverage",
  ".cache", ".turbo", ".vercel", ".yarn", ".pnpm-store", ".parcel-cache",
  // Python
  "__pycache__", ".venv", "venv", "site-packages", ".tox", ".nox",
  ".mypy_cache", ".pytest_cache", ".ruff_cache", ".eggs",
  // Go / PHP vendored deps, Rust / JVM build output
  "vendor", "target", ".gradle",
  // VCS / editors
  ".git", ".hg", ".svn", ".idea",
]);

/** True if this directory should not be walked. */
export function shouldSkipDir(name: string, fullPath: string): boolean {
  if (IGNORE_DIRS.has(name)) return true;
  // Any virtualenv, whatever it's called (env/, .env-py311/, ...)
  return existsSync(join(fullPath, "pyvenv.cfg"));
}
