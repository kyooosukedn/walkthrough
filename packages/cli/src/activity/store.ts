import type { ActivityEvent, ActivityEventInput } from "./types.js";

export interface ActivityStore {
  append(input: ActivityEventInput): ActivityEvent;
  replay(afterSequence?: number): ActivityEvent[];
  subscribe(listener: (event: ActivityEvent) => void): () => void;
}

export function createActivityStore({ maxEvents }: { maxEvents: number }): ActivityStore {
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1) throw new RangeError("maxEvents must be a positive integer.");
  const events: ActivityEvent[] = [];
  const listeners = new Set<(event: ActivityEvent) => void>();
  let sequence = 0;
  return {
    append(input) {
      const event: ActivityEvent = { ...input, sequence: ++sequence };
      events.push(event);
      if (events.length > maxEvents) events.shift();
      for (const listener of listeners) {
        try { listener(event); } catch { /* A disconnected viewer must not break collection. */ }
      }
      return event;
    },
    replay(afterSequence = 0) { return events.filter((event) => event.sequence > afterSequence); },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
