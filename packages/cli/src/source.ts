import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const MAX_SOURCE_BYTES = 512 * 1024;

export class SourceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "SourceError";
  }
}

const SECRET_NAMES = new Set([
  ".npmrc", ".pypirc", ".netrc", ".pgpass", ".envrc", ".htpasswd", ".git-credentials",
  "credentials", "credentials.json", "service-account.json", "secrets.env",
  "id_rsa", "id_dsa", "id_ed25519", "id_ecdsa",
]);
const SECRET_EXT = /\.(pem|key|p12|pfx|jks|keystore)$/i;
const SAFE_ENV = /^\.env\.(example|sample|template|dist|defaults)$/i;

/** Files the preview never shows: env files, private keys, credential stores. */
export function isSecretFile(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (/^\.env($|\.)/i.test(name)) return !SAFE_ENV.test(name);
  return SECRET_NAMES.has(name.toLowerCase()) || SECRET_EXT.test(name) || /\.env$/i.test(name);
}

/** Read a scanned text file without following links outside the checkout. */
export async function readSource(rootPath: string, path: string, allowedPaths: ReadonlySet<string>): Promise<string> {
  if (!path || isAbsolute(path) || path.includes("\\") || path.includes("\0") || path.split("/").some((segment) => !segment || segment === "." || segment === "..") || /^[a-z]:/i.test(path)) {
    throw new SourceError("Invalid source path.");
  }
  if (!allowedPaths.has(path)) throw new SourceError("File was not in this scan.", 404);
  if (isSecretFile(path)) throw new SourceError("Hidden: this file may contain secrets.", 403);

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
