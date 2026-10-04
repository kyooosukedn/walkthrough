import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActivityEvent } from "../../../cli/src/activity/types.js";
import { addActivityEvent, emptyActivityState, parseActivityEvent, safeSourcePath } from "./state.js";
import { ActivityItem, ActivityTimeline, connectActivityStream } from "./ActivityPanel.js";

const event = (sequence: number, extra: Partial<ActivityEvent> = {}): ActivityEvent => ({
  version: 1,
  sessionId: "test-session",
  sequence,
  at: "2026-10-04T12:00:00.000Z",
  host: "claude",
  kind: "tool",
  phase: "completed",
  title: `Ran check ${sequence}`,
  ...extra,
});

describe("activity stream state", () => {
  it("orders replay and live events by collector sequence and deduplicates reconnect replay", () => {
    let state = emptyActivityState;
    for (const item of [event(3), event(1), event(2), event(2)]) state = addActivityEvent(state, item);
    expect(state.events.map(({ sequence }) => sequence)).toEqual([1, 2, 3]);
  });

  it("shows a retained-history gap without inventing missing actions", () => {
    const state = addActivityEvent(addActivityEvent(emptyActivityState, event(8)), event(9));
    expect(state.gaps).toEqual([{ after: 0, before: 8 }]);
    expect(renderToStaticMarkup(<ActivityTimeline state={state} onOpenSource={() => {}} />)).toContain("Earlier activity is no longer available");
  });

  it("rejects malformed stream data and foreign session events", () => {
    expect(parseActivityEvent('{"sequence":1}')).toBeNull();
    expect(parseActivityEvent("not json")).toBeNull();
    const state = addActivityEvent(emptyActivityState, event(1));
    expect(addActivityEvent(state, event(2, { sessionId: "other-session" }))).toBe(state);
  });

  it("connects to the same-origin stream, reports reconnect, and closes cleanly", () => {
    const callbacks: Record<string, (message: MessageEvent) => void> = {};
    const source = {
      onopen: null as null | (() => void), onerror: null as null | (() => void),
      readyState: 0,
      addEventListener: vi.fn((name: string, listener: (message: MessageEvent) => void) => { callbacks[name] = listener; }),
      close: vi.fn(),
    };
    const factory = vi.fn(() => source);
    const onEvent = vi.fn();
    const onConnection = vi.fn();
    const stop = connectActivityStream(onEvent, onConnection, factory as unknown as (url: string) => EventSource);
    expect(factory).toHaveBeenCalledWith("/activity/stream");
    source.onopen?.();
    callbacks.activity({ data: JSON.stringify(event(1)) } as MessageEvent);
    source.onerror?.();
    source.readyState = 2;
    source.onerror?.();
    expect(onEvent).toHaveBeenCalledWith(event(1));
    expect(onConnection.mock.calls.map(([value]) => value)).toEqual(["connected", "reconnecting", "unavailable"]);
    stop();
    expect(source.close).toHaveBeenCalledOnce();
  });
});

describe("activity timeline", () => {
  it("labels facts and agent text distinctly with status and host", () => {
    const state = addActivityEvent(addActivityEvent(emptyActivityState, event(1)), event(2, {
      kind: "message", host: "codex", phase: "failed", title: "I could not complete the check",
    }));
    const html = renderToStaticMarkup(<ActivityTimeline state={state} onOpenSource={() => {}} />);
    expect(html).toContain("Observed");
    expect(html).toContain("Agent said");
    expect(html).toContain("Completed");
    expect(html).toContain("Failed");
    expect(html).toContain("Claude Code");
    expect(html).toContain("Codex CLI");
  });

  it("offers current file only for a safe repo-relative path and calls the source callback", () => {
    const onOpenSource = vi.fn();
    const item = ActivityItem({ event: event(1, { kind: "file", path: "src/app.ts" }), onOpenSource });
    const html = renderToStaticMarkup(item);
    expect(html).toContain("Open current file");
    const children = item.props.children as unknown[];
    const button = children.find((child: any) => child?.props?.onClick) as { props: { onClick: () => void } };
    button.props.onClick();
    expect(onOpenSource).toHaveBeenCalledWith("src/app.ts");
    expect(renderToStaticMarkup(<ActivityItem event={event(2, { path: "../secret.env" })} onOpenSource={onOpenSource} />)).not.toContain("Open current file");
    expect(safeSourcePath("C:/secret.txt")).toBeNull();
    expect(safeSourcePath("src/.env")).toBeNull();
    expect(safeSourcePath("src/credentials.json")).toBeNull();
    expect(safeSourcePath("src/../config.ts")).toBeNull();
    expect(safeSourcePath("src\\config.ts")).toBeNull();
  });
});
