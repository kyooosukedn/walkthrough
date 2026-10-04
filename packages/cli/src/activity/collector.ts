import { randomBytes, timingSafeEqual } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { isSensitivePath } from "../explain/context.js";
import type { ActivityStore } from "./store.js";
import type { ActivityEventInput } from "./types.js";

const MAX_BODY_BYTES = 8192;
const MAX_TITLE = 200;
const MAX_DETAIL = 2000;
const COOKIE_NAME = "walkthrough_activity";
const SECRET_TEXT = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*\S+|\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{12,}/i;
const INPUT_FIELDS = new Set(["version", "sessionId", "at", "host", "kind", "phase", "title", "path", "detail", "sequence"]);

export interface ActivityCollector {
  handler: RequestListener;
  /** Set this on the same-origin viewer response before EventSource connects. */
  viewerCookie(): string;
  close(): void;
}

function equalSecret(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function respond(res: ServerResponse, status: number, error: string): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify({ error }));
}

function isLocalRequest(req: IncomingMessage): boolean {
  const host = req.headers.host ?? "";
  const remote = req.socket.remoteAddress ?? "";
  if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(host) || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)) return false;
  if (req.headers.origin && req.headers.origin !== `http://${host}`) return false;
  return req.headers["sec-fetch-site"] !== "cross-site";
}

async function body(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size <= MAX_BODY_BYTES) chunks.push(bytes);
  }
  if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Event body is too large."), { status: 413 });
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("Invalid JSON event."); }
}

function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && !!value.trim() && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) && !SECRET_TEXT.test(value);
}

async function checkedPath(repoRoot: string, path: unknown): Promise<string | undefined> {
  if (path === undefined) return undefined;
  if (typeof path !== "string" || !path || path.length > 512 || isAbsolute(path) || /^[A-Za-z]:/.test(path) || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..") || isSensitivePath(path)) throw new Error("Unsafe source path.");
  const root = await realpath(repoRoot);
  let target: string;
  try { target = await realpath(resolve(root, path)); }
  catch { throw new Error("Source path does not exist."); }
  const within = relative(root, target);
  if (!within || within === ".." || within.startsWith(".." + sep) || isAbsolute(within)) throw new Error("Source path leaves checkout.");
  if (!(await stat(target)).isFile()) throw new Error("Source path is not a file.");
  return path;
}

async function validate(value: unknown, repoRoot: string): Promise<ActivityEventInput> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid event.");
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !INPUT_FIELDS.has(key))) throw new Error("Unsupported event field.");
  if (data.version !== 1 || !validText(data.sessionId, 128) || !/^[A-Za-z0-9_-]+$/.test(data.sessionId)) throw new Error("Invalid event version or session.");
  if (typeof data.at !== "string" || data.at.length > 40 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(data.at) || Number.isNaN(Date.parse(data.at))) throw new Error("Invalid event timestamp.");
  if (data.host !== "claude" && data.host !== "codex") throw new Error("Invalid event host.");
  if (!["session", "tool", "file", "message", "error"].includes(data.kind as string)) throw new Error("Invalid event kind.");
  if (!["started", "completed", "failed"].includes(data.phase as string)) throw new Error("Invalid event phase.");
  if (!validText(data.title, MAX_TITLE) || (data.detail !== undefined && !validText(data.detail, MAX_DETAIL))) throw new Error("Unsafe event text.");
  const path = await checkedPath(repoRoot, data.path);
  return { version: 1, sessionId: data.sessionId, at: data.at, host: data.host, kind: data.kind as ActivityEventInput["kind"], phase: data.phase as ActivityEventInput["phase"], title: data.title, ...(path && { path }), ...(data.detail !== undefined && { detail: data.detail as string }) };
}

/** HTTP handler for an explicitly started, loopback-bound observer session. */
export function createActivityCollector({ repoRoot, token, store }: { repoRoot: string; token: string; store: ActivityStore }): ActivityCollector {
  if (!token || token.length < 8) throw new Error("Collector token must have at least eight characters.");
  const viewerSecret = randomBytes(32).toString("hex");
  const streams = new Set<ServerResponse>();
  let sessionId: string | undefined;
  const handler: RequestListener = (req, res) => { void (async () => {
    if (!isLocalRequest(req)) return respond(res, 403, "Local requests only.");
    if (req.url === "/activity/events" && req.method === "POST") {
      if (!equalSecret(req.headers.authorization, `Bearer ${token}`)) return respond(res, 401, "Unauthorized.");
      if (!req.headers["content-type"]?.toLowerCase().startsWith("application/json")) return respond(res, 415, "JSON required.");
      try {
        const input = await validate(await body(req), repoRoot);
        if (sessionId && sessionId !== input.sessionId) return respond(res, 400, "Wrong session.");
        sessionId = input.sessionId;
        const event = store.append(input);
        res.writeHead(201, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(JSON.stringify(event));
      } catch (error) { return respond(res, (error as { status?: number }).status ?? 400, (error as Error).message); }
    }
    if (req.url === "/activity/stream" && req.method === "GET") {
      const cookie = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
      if (!equalSecret(cookie, viewerSecret)) return respond(res, 401, "Unauthorized.");
      const last = req.headers["last-event-id"];
      const after = typeof last === "string" && /^\d+$/.test(last) && Number.isSafeInteger(Number(last)) ? Number(last) : 0;
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "X-Content-Type-Options": "nosniff" });
      res.flushHeaders();
      streams.add(res);
      const unsubscribe = store.subscribe((event) => { res.write(`id: ${event.sequence}\nevent: activity\ndata: ${JSON.stringify(event)}\n\n`); });
      for (const event of store.replay(after)) res.write(`id: ${event.sequence}\nevent: activity\ndata: ${JSON.stringify(event)}\n\n`);
      const heartbeat = setInterval(() => { res.write(": keepalive\n\n"); }, 20_000);
      req.on("close", () => { clearInterval(heartbeat); unsubscribe(); streams.delete(res); });
      return;
    }
    return respond(res, 404, "Not found.");
  })().catch(() => { if (!res.headersSent) respond(res, 500, "Activity collector failed."); else res.end(); }); };
  return {
    handler,
    viewerCookie() { return `${COOKIE_NAME}=${viewerSecret}; Path=/activity/stream; HttpOnly; SameSite=Strict; Max-Age=3600`; },
    close() { for (const stream of streams) stream.end(); streams.clear(); },
  };
}
