// NEP-297 `EVENT_JSON:` log lines emitted by pontis-core (ADR 0002).

import { z } from "zod";

const PREFIX = "EVENT_JSON:";

const EnvelopeSchema = z.object({
  standard: z.literal("pontis"),
  version: z.string(),
  event: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

export interface CoreEvent {
  /** Position of the log line within its receipt; with the receipt ID it is the event's identity. */
  logIndex: number;
  name: string;
  version: string;
  data: Record<string, unknown>;
}

/** Pontis events found in one receipt's logs. Other logs and malformed event lines are skipped. */
export function parseEvents(logs: readonly string[]): CoreEvent[] {
  const events: CoreEvent[] = [];
  logs.forEach((line, logIndex) => {
    if (!line.startsWith(PREFIX)) return;
    let json: unknown;
    try {
      json = JSON.parse(line.slice(PREFIX.length));
    } catch {
      return;
    }
    const envelope = EnvelopeSchema.safeParse(json);
    if (!envelope.success) return;
    const { event, version, data } = envelope.data;
    events.push({ logIndex, name: event, version, data });
  });
  return events;
}
