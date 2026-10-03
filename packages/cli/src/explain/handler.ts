import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import type { ImportGraph } from "@walkthrough/scanner";
import { buildEvidence, type EvidenceBundle } from "./context.js";
import type { Citation, ExplanationProvider, FileExplanation } from "./provider.js";
import { SourceError } from "../source.js";

interface ExplainDependencies {
  rootPath: string;
  allowedPaths: ReadonlySet<string>;
  imports: ImportGraph | undefined;
  provider: ExplanationProvider | undefined;
}

const MAX_BODY_BYTES = 4_096;

function send(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size <= MAX_BODY_BYTES) chunks.push(bytes);
  }
  if (size > MAX_BODY_BYTES) throw new SourceError("Request body is too large.", 413);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    throw new SourceError("Invalid JSON request body.");
  }
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Invalid model response.");
  return value.trim();
}

function citation(value: unknown, evidence: EvidenceBundle): Citation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<Citation>;
  const file = evidence.files.find((item) => item.path === candidate.path);
  if (!file || !Number.isInteger(candidate.startLine) || !Number.isInteger(candidate.endLine)) return undefined;
  const startLine = candidate.startLine as number;
  const endLine = candidate.endLine as number;
  if (startLine < 1 || endLine < startLine || endLine > file.lineCount || endLine - startLine > 30) return undefined;
  return { path: file.path, startLine, endLine };
}

/** Treat model output as untrusted data before it becomes a source link. */
export function validateExplanation(value: unknown, evidence: EvidenceBundle): FileExplanation {
  if (!value || typeof value !== "object") throw new Error("Invalid model response.");
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.sections) || raw.sections.length < 1 || raw.sections.length > 8) throw new Error("Invalid model response.");
  if (!Array.isArray(raw.nextFiles) || !Array.isArray(raw.unknowns)) throw new Error("Invalid model response.");
  const sections = raw.sections.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid model response.");
    const section = entry as Record<string, unknown>;
    if (!Array.isArray(section.citations)) throw new Error("Invalid model response.");
    return {
      heading: text(section.heading, 120),
      body: text(section.body, 4_000),
      citations: section.citations.slice(0, 8).map((item: unknown) => citation(item, evidence)).filter((item): item is Citation => !!item),
    };
  });
  const nextFiles = raw.nextFiles.slice(0, 8).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const file = entry as Record<string, unknown>;
    const link = citation({ path: file.path, startLine: file.line, endLine: file.line }, evidence);
    if (!link || typeof file.reason !== "string" || !file.reason.trim()) return [];
    return [{ path: link.path, reason: file.reason.slice(0, 500), line: link.startLine }];
  });
  return {
    title: text(raw.title, 200),
    sections,
    nextFiles,
    exercise: text(raw.exercise, 1_000),
    unknowns: raw.unknowns.slice(0, 8).map((item: unknown) => text(item, 500)),
  };
}

/** Create a loopback-only request handler; callers inject provider for deterministic tests. */
export function createExplainHandler(deps: ExplainDependencies): RequestListener {
  let busy = false;
  return (req, res) => {
    void (async () => {
      if (req.method !== "POST") return send(res, 405, { error: "Use POST to request an explanation." });
      const host = req.headers.host ?? "";
      if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(host)) return send(res, 403, { error: "Request host is not local." });
      if (req.headers.origin && req.headers.origin !== `http://${host}`) return send(res, 403, { error: "Cross-origin requests are not allowed." });
      if (req.headers["sec-fetch-site"] === "cross-site") return send(res, 403, { error: "Cross-origin requests are not allowed." });
      if (!req.headers["content-type"]?.toLowerCase().startsWith("application/json")) return send(res, 415, { error: "Send a JSON request." });
      if (!deps.provider) return send(res, 503, { error: "Configure ANTHROPIC_API_KEY and WALKTHROUGH_AI_MODEL to enable explanations." });
      if (busy) return send(res, 429, { error: "An explanation is already in progress." });

      let body: unknown;
      try {
        body = await readBody(req);
      } catch (error) {
        const source = error as SourceError;
        return send(res, source.status ?? 400, { error: source.message });
      }
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || typeof (body as { path?: unknown }).path !== "string") {
        return send(res, 400, { error: "Provide one scanned file path." });
      }
      const path = (body as { path: string }).path;
      if (!path || path.length > 2_048) return send(res, 400, { error: "Provide one scanned file path." });

      busy = true;
      try {
        const evidence = await buildEvidence(deps.rootPath, path, deps.allowedPaths, deps.imports);
        const response = await deps.provider.explain(evidence);
        return send(res, 200, validateExplanation(response, evidence));
      } catch (error) {
        if (error instanceof SourceError) return send(res, error.status, { error: error.message });
        return send(res, 502, { error: "AI explanation failed. Try again later." });
      } finally {
        busy = false;
      }
    })();
  };
}
