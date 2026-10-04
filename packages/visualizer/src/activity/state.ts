import type { ActivityEvent } from "../../../cli/src/activity/types.js";

export interface ActivityGap { after: number; before: number }
export interface ActivityState { sessionId: string | null; events: ActivityEvent[]; gaps: ActivityGap[] }

export const emptyActivityState: ActivityState = { sessionId: null, events: [], gaps: [] };
const MAX_VISIBLE_EVENTS = 200;

function gapsBetween(events: ActivityEvent[]): ActivityGap[] {
  const gaps: ActivityGap[] = [];
  let previous = 0;
  for (const event of events) {
    if (event.sequence > previous + 1) gaps.push({ after: previous, before: event.sequence });
    previous = event.sequence;
  }
  return gaps;
}

export function addActivityEvent(state: ActivityState, event: ActivityEvent): ActivityState {
  if (state.sessionId && state.sessionId !== event.sessionId) return state;
  if (state.events.some((existing) => existing.sequence === event.sequence)) return state;
  const events = [...state.events, event].sort((a, b) => a.sequence - b.sequence).slice(-MAX_VISIBLE_EVENTS);
  return { sessionId: event.sessionId, events, gaps: gapsBetween(events) };
}

export function safeSourcePath(path: string | undefined): string | null {
  if (!path || path.length > 512 || path.includes("\\") || path.startsWith("/") || /^[a-z]:/i.test(path) || /[\u0000-\u001f]/.test(path)) return null;
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  const name = parts[parts.length - 1].toLowerCase();
  if (/^\.env/.test(name)
    || [".npmrc", ".pypirc", ".netrc", ".dockercfg", ".git-credentials"].includes(name)
    || parts.some((part) => [".aws", ".ssh", ".kube", "secrets", "credentials"].includes(part.toLowerCase()))
    || /^(?:id_rsa|id_ed25519|id_ecdsa|known_hosts)$/.test(name)
    || /\.(?:pem|p12|pfx|key|keystore|jks)$/.test(name)
    || /(?:^|[._-])(?:secrets?|credentials?|passwords?|private[-_]?keys?)(?:[._-]|$)/.test(name)) return null;
  return path;
}

export function parseActivityEvent(data: string): ActivityEvent | null {
  try {
    const value: unknown = JSON.parse(data);
    if (!value || typeof value !== "object") return null;
    const event = value as Record<string, unknown>;
    if (event.version !== 1 || !Number.isSafeInteger(event.sequence) || (event.sequence as number) < 1) return null;
    if (typeof event.sessionId !== "string" || !/^[\w-]{1,128}$/.test(event.sessionId)) return null;
    if (typeof event.at !== "string" || Number.isNaN(Date.parse(event.at))) return null;
    if (event.host !== "claude" && event.host !== "codex") return null;
    if (!["session", "tool", "file", "message", "error"].includes(String(event.kind))) return null;
    if (!["started", "completed", "failed"].includes(String(event.phase))) return null;
    if (typeof event.title !== "string" || !event.title.trim() || event.title.length > 200) return null;
    if (event.detail !== undefined && (typeof event.detail !== "string" || event.detail.length > 2000)) return null;
    if (event.path !== undefined && typeof event.path !== "string") return null;
    return event as unknown as ActivityEvent;
  } catch { return null; }
}
