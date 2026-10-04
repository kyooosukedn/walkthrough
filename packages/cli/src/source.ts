import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const MAX_SOURCE_BYTES = 512 * 1024;

export class SourceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "SourceError";
  }
}

/** Read a scanned text file without following links outside the checkout. */
export async function readSource(rootPath: string, path: string, allowedPaths: ReadonlySet<string>): Promise<string> {
  if (!path || isAbsolute(path) || path.includes("\\") || path.includes("\0") || path.split("/").some((segment) => !segment || segment === "." || segment === "..") || /^[a-z]:/i.test(path)) {
    throw new SourceError("Invalid source path.");
  }
  if (!allowedPaths.has(path)) throw new SourceError("File was not in this scan.", 404);

  const root = await realpath(rootPath);
  let target: string;
  try {
    target = await realpath(resolve(root, path));
  } catch {
    throw new SourceError("Source file no longer exists.", 404);
  }
  const within = relative(root, target);
  if (!within || within === ".." || within.startsWith(".." + sep) || isAbsolute(within)) {
    throw new SourceError("Source path leaves the checkout.");
  }
  const info = await stat(target);
  if (!info.isFile()) throw new SourceError("Source path is not a file.");
  if (info.size > MAX_SOURCE_BYTES) throw new SourceError("File is too large to preview.", 413);
  const bytes = await readFile(target);
  if (bytes.includes(0)) throw new SourceError("Binary file cannot be previewed.", 415);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new SourceError("File is not valid UTF-8 text.", 415);
  }
}
