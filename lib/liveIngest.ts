import { checkRequest } from "./check";
import { displayName } from "./clientProfiles";
import { extractItems } from "./extract";
import { githubEnabled, readMemory, updateMemory } from "./github";
import type { Alert, InboundMessage, Source } from "./types";

// One live message from a connected channel (Telegram, WhatsApp) for a client that has been explicitly linked:
// it's saved with its timestamp, turned into unconfirmed memory, checked against confirmed memory, and logged
// (success or failure) in that client's memory file. Only this client's file is ever touched.

const tz = { timeZone: "Asia/Kolkata" } as const;
const MAX_LOG = 200;

export async function ingestLiveMessage(m: {
  client: string; // the linked client's key
  channel: InboundMessage["channel"];
  messageId: string; // unique per channel, e.g. "telegram:<chatId>:<messageId>"
  chatTitle: string;
  sender: string;
  text: string;
  sentAt: Date;
}): Promise<InboundMessage> {
  if (!githubEnabled()) throw new Error("GitHub saving isn't set up, so there's nowhere to store client memory.");
  const source: Source = m.channel === "telegram" ? "Telegram (live)" : "WhatsApp (live)";
  const label = m.channel === "telegram" ? "Telegram" : "WhatsApp";
  const entry: InboundMessage = {
    id: m.messageId,
    channel: m.channel,
    chatTitle: m.chatTitle,
    sender: m.sender,
    text: m.text.slice(0, 4000),
    sentAt: m.sentAt.toISOString(),
    receivedAt: new Date().toISOString(),
    status: "processed",
    note: "",
    itemsAdded: 0,
    conflict: false,
  };

  const existing = (await readMemory(m.client))?.memory;
  if (existing?.seenMessageIds?.includes(m.messageId)) return { ...entry, status: "skipped", note: "Already processed." };

  try {
    // Format it like a chat-export line so live messages are read the same way as uploads.
    const date = m.sentAt.toLocaleDateString("en-GB", { ...tz, day: "numeric", month: "short", year: "numeric" });
    const line = `${m.sentAt.toLocaleDateString("en-GB", tz)}, ${m.sentAt.toLocaleTimeString("en-GB", { ...tz, hour: "2-digit", minute: "2-digit" })} - ${m.sender} (${displayName(m.client)}): ${m.text}`;
    const confirmed = (existing?.items ?? []).filter((it) => it.confirmed);

    const [items, check] = await Promise.all([
      extractItems(m.client, line, source, { existing: confirmed, messageRef: m.messageId }),
      confirmed.length > 0 ? checkRequest(m.client, m.text, confirmed) : Promise.resolve(null),
    ]);
    const alert: Alert | null =
      check?.status === "conflict"
        ? { id: crypto.randomUUID(), message: m.text, from: m.sender, channel: m.channel, date, reason: check.reason, conflictsWith: check.conflictsWith, alternative: check.alternative, dismissed: false }
        : null;
    entry.itemsAdded = items.length;
    entry.conflict = Boolean(alert);
    entry.note = items.length
      ? `${items.length} new detail${items.length === 1 ? "" : "s"} to review${alert ? "; conflict flagged" : ""}.`
      : alert
        ? "Conflict flagged; no new details."
        : "Nothing to remember in this message.";

    await updateMemory(
      m.client,
      (mem) => {
        if (mem.seenMessageIds?.includes(m.messageId)) return null;
        return {
          ...mem,
          items: [...mem.items, ...items],
          alerts: alert ? [...(mem.alerts ?? []), alert] : (mem.alerts ?? []),
          messages: [...(mem.messages ?? []), entry].slice(-MAX_LOG),
          seenMessageIds: [...(mem.seenMessageIds ?? []), m.messageId].slice(-1000),
        };
      },
      `${label} from ${displayName(m.client)}: ${items.length} new item(s)${alert ? ", CONFLICT alert" : ""}`,
    );
    return entry;
  } catch (err) {
    // Make the failure visible in the client's workspace instead of losing it silently.
    const failed: InboundMessage = { ...entry, status: "failed", note: `Couldn't process: ${(err as Error).message}`.slice(0, 300) };
    console.error(`${label} ingest failed for ${m.client}:`, err);
    try {
      await updateMemory(
        m.client,
        (mem) => (mem.messages?.some((x) => x.id === m.messageId) ? null : { ...mem, messages: [...(mem.messages ?? []), failed].slice(-MAX_LOG) }),
        `${label} message from ${displayName(m.client)} failed to process`,
      );
    } catch (logErr) {
      console.error("Couldn't record the failure either:", logErr);
    }
    return failed;
  }
}
