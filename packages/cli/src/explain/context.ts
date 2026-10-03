import type { ImportGraph } from "@walkthrough/scanner";
import { posix } from "node:path";
import { readSource, SourceError } from "../source.js";

export interface EvidenceFile { path: string; content: string; lineCount: number }
export interface EvidenceBundle { selectedPath: string; files: EvidenceFile[] }

const MAX_FILES = 6;
const MAX_CHARACTERS = 48_000;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const DOC_NAMES = ["README.md", "README.rst", "README.txt", "readme.md"];
const MANIFEST_NAMES = ["package.json", "pyproject.toml", "go.mod", "Cargo.toml"];

/** Conservative blocklist for material that must not be sent to an AI provider. */
export function isSensitivePath(path: string): boolean {
  const name = posix.basename(path).toLowerCase();
  const segments = path.toLowerCase().split("/");
  return /^\.env/.test(name)
    || [".npmrc", ".pypirc", ".netrc", ".dockercfg", ".git-credentials"].includes(name)
    || segments.some((segment) => [".aws", ".ssh", ".kube", "secrets", "credentials"].includes(segment))
    || /^(?:id_rsa|id_ed25519|id_ecdsa|known_hosts)$/.test(name)
    || /\.(?:pem|p12|pfx|key|keystore|jks)$/.test(name)
    || /(?:^|[._-])(?:secrets?|credentials?|passwords?|private[-_]?keys?)(?:[._-]|$)/.test(name);
}

function hasPrivateKey(content: string): boolean {
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content);
}

function sameStemTest(selectedPath: string, allowedPaths: ReadonlySet<string>): string | undefined {
  const ext = posix.extname(selectedPath);
  const stem = posix.basename(selectedPath, ext);
  const selectedDir = posix.dirname(selectedPath);
  const names = new Set([`${stem}.test${ext}`, `${stem}.spec${ext}`, `test_${stem}${ext}`, `${stem}_test${ext}`]);
  return [...allowedPaths]
    .filter((path) => path !== selectedPath && posix.extname(path) === ext && names.has(posix.basename(path)))
    .sort((a, b) => {
      const aNearby = posix.dirname(a) === selectedDir ? 0 : 1;
      const bNearby = posix.dirname(b) === selectedDir ? 0 : 1;
      return aNearby - bNearby || a.localeCompare(b);
    })[0];
}

function nearbyDocument(selectedPath: string, allowedPaths: ReadonlySet<string>): string | undefined {
  let dir = posix.dirname(selectedPath);
  while (true) {
    for (const name of DOC_NAMES) {
      const candidate = dir === "." ? name : `${dir}/${name}`;
      if (allowedPaths.has(candidate)) return candidate;
    }
    if (dir === ".") break;
    dir = posix.dirname(dir);
  }
  return MANIFEST_NAMES.find((name) => allowedPaths.has(name));
}

export async function buildEvidence(
  rootPath: string,
  selectedPath: string,
  allowedPaths: ReadonlySet<string>,
  imports: ImportGraph | undefined,
): Promise<EvidenceBundle> {
  if (isSensitivePath(selectedPath)) throw new SourceError("This file may contain secrets and cannot be sent to AI.", 403);

  const candidates = [selectedPath];
  if (imports && SOURCE_EXTENSIONS.has(posix.extname(selectedPath))) {
    const dependencies = imports.edges.filter((edge) => edge.from === selectedPath).map((edge) => edge.to).sort();
    const importers = imports.edges.filter((edge) => edge.to === selectedPath).map((edge) => edge.from).sort();
    candidates.push(...[...new Set([...dependencies, ...importers])].slice(0, 3));
  }
  const test = sameStemTest(selectedPath, allowedPaths);
  if (test) candidates.push(test);
  const doc = nearbyDocument(selectedPath, allowedPaths);
  if (doc) candidates.push(doc);

  const files: EvidenceFile[] = [];
  let remaining = MAX_CHARACTERS;
  for (const path of [...new Set(candidates)]) {
    if (files.length === MAX_FILES || remaining === 0) break;
    if (isSensitivePath(path)) continue;
    try {
      const fullContent = await readSource(rootPath, path, allowedPaths);
      if (hasPrivateKey(fullContent)) {
        if (path === selectedPath) throw new SourceError("This file may contain a private key and cannot be sent to AI.", 403);
        continue;
      }
      const content = fullContent.slice(0, remaining);
      if (!content) continue;
      files.push({ path, content, lineCount: content.split(/\r?\n/).length });
      remaining -= content.length;
    } catch (error) {
      if (path === selectedPath) throw error;
      // A related file can disappear or become unreadable after the scan.
    }
  }
  return { selectedPath, files };
}
