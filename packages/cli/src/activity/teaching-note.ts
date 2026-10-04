import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { isSensitivePath } from "../explain/context.js";
import { MAX_SOURCE_BYTES } from "../source.js";

export const TEACHING_NOTE_INSTRUCTION = "Walkthrough teaching mode: after a response about a repository file, add one final line in this exact format: WALKTHROUGH_NOTE: repo/relative/file.ext | One plain-language sentence explaining what this file does or why you changed it for the task. Cite only an existing file you checked. Keep the sentence under 300 characters. Do not include code, secrets, private reasoning, or a note when no file supports it.";

const NOTE_LINE = /^WALKTHROUGH_NOTE: ([^|\r\n]{1,512}) \| ([^\r\n]{1,600})$/gm;
const SECRET_TEXT = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b[A-Z0-9_-]*(?:API[_-]?KEY|SECRET(?:[_-]?ACCESS)?[_-]?KEY|ACCESS[_-]?TOKEN|PASSWORD|PRIVATE[_-]?KEY|SECRET)\s*[:=]\s*\S+|\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{12,}/i;

/** Extract only an explicitly marked user-visible teaching line; never forward the full answer. */
export function parseTeachingNote(message: string, repoRoot: string): { path: string; detail: string } | null {
  if (typeof message !== "string") return null;
  const tail = message.slice(-4_000).trimEnd();
  const matches = [...tail.matchAll(NOTE_LINE)];
  if (matches.length !== 1 || !tail.endsWith(matches[0][0])) return null;
  const fenceCount = (tail.slice(0, matches[0].index).match(/^\s*```/gm) ?? []).length;
  if (fenceCount % 2 !== 0) return null;
  const path = matches[0][1].trim();
  const detail = matches[0][2].trim();
  if (!path || !detail || detail.length > 600 || /[\u0000-\u001f\u007f]/.test(detail) || SECRET_TEXT.test(detail)) return null;
  if (path.length > 512 || isAbsolute(path) || /^[A-Za-z]:/.test(path) || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..") || isSensitivePath(path)) return null;
  try {
    const root = realpathSync(repoRoot);
    const target = realpathSync(resolve(root, path));
    const within = relative(root, target);
    if (!within || within === ".." || within.startsWith(".." + sep) || isAbsolute(within) || isSensitivePath(within.split(sep).join("/"))) return null;
    const info = statSync(target);
    if (!info.isFile() || info.size > MAX_SOURCE_BYTES) return null;
    const bytes = readFileSync(target);
    if (bytes.includes(0)) return null;
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { path, detail };
  } catch { return null; }
}
