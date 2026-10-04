import { Fragment, useEffect, useState } from "react";
import type { ActivityEvent } from "../../../cli/src/activity/types.js";
import { addActivityEvent, emptyActivityState, parseActivityEvent, safeSourcePath, type ActivityState } from "./state.js";
import "./activity.css";

export type ActivityConnection = "connecting" | "connected" | "reconnecting" | "unavailable";
export interface ActivityPanelProps { onOpenSource: (path: string) => void }

export function connectActivityStream(
  onEvent: (event: ActivityEvent) => void,
  onConnection: (connection: ActivityConnection) => void,
  factory: (url: string) => EventSource = (url) => new EventSource(url),
): () => void {
  const source = factory("/activity/stream");
  source.onopen = () => onConnection("connected");
  source.onerror = () => onConnection("reconnecting");
  source.addEventListener("activity", (message) => {
    const event = parseActivityEvent((message as MessageEvent).data);
    if (event) onEvent(event);
  });
  return () => source.close();
}

export function ActivityPanel({ onOpenSource }: ActivityPanelProps) {
  const [state, setState] = useState<ActivityState>(emptyActivityState);
  const [connection, setConnection] = useState<ActivityConnection>("connecting");

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      setConnection("unavailable");
      return;
    }
    return connectActivityStream(
      (event) => setState((current) => addActivityEvent(current, event)),
      setConnection,
    );
  }, []);

  return <ActivityTimeline state={state} connection={connection} onOpenSource={onOpenSource} />;
}

const connectionCopy: Record<ActivityConnection, string> = {
  connecting: "Connecting to activity…",
  connected: "Connected to live activity",
  reconnecting: "Connection lost. Reconnecting; saved activity remains below.",
  unavailable: "Live activity is unavailable in this browser.",
};

export function ActivityTimeline({ state, connection = "connected", onOpenSource }: {
  state: ActivityState;
  connection?: ActivityConnection;
  onOpenSource: (path: string) => void;
}) {
  const gapBefore = new Set(state.gaps.map((gap) => gap.before));
  return (
    <section className="activity-panel" aria-labelledby="activity-heading">
      <header className="activity-header">
        <div><h1 id="activity-heading">Agent activity</h1><p>Actions reported by this observed session.</p></div>
        <span className={`activity-connection activity-connection--${connection}`} role="status" aria-live="polite">{connectionCopy[connection]}</span>
      </header>
      {state.events.length === 0 ? (
        <div className="activity-empty" role="status">
          <strong>Waiting for the first action</strong>
          <p>Actions will appear here when the agent starts work. Keep this page open to follow along.</p>
        </div>
      ) : (
        <ol className="activity-list" aria-label="Agent activity, oldest first">
          {state.events.map((event) => <Fragment key={event.sequence}>
            {gapBefore.has(event.sequence) && <li className="activity-gap" key={`gap-${event.sequence}`}>Earlier activity is no longer available in this session.</li>}
            <li><ActivityItem event={event} onOpenSource={onOpenSource} /></li>
          </Fragment>)}
        </ol>
      )}
    </section>
  );
}

const phaseLabel = { started: "Started", completed: "Completed", failed: "Failed" } as const;
const hostLabel = { claude: "Claude Code", codex: "Codex CLI" } as const;

export function ActivityItem({ event, onOpenSource }: { event: ActivityEvent; onOpenSource: (path: string) => void }) {
  const path = safeSourcePath(event.path);
  return (
    <article className={`activity-item activity-item--${event.phase}`}>
      <div className="activity-item-meta">
        <span>{event.kind === "message" ? "Agent said" : "Observed"}</span>
        <span>{hostLabel[event.host]}</span>
        <time dateTime={event.at}>{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
        <span className={`activity-phase activity-phase--${event.phase}`}>{phaseLabel[event.phase]}</span>
      </div>
      <h2>{event.title}</h2>
      {event.detail && <p>{event.detail}</p>}
      {path && <button type="button" className="activity-source" onClick={() => onOpenSource(path)}>Open current file: <span>{path}</span></button>}
    </article>
  );
}
