import { askAIForJSON, FriendlyError, MODELS } from "./ai";
import { displayName } from "./clientProfiles";
import { phonesIn, pricesIn } from "./review";
import type { CheckResult, MemoryItem } from "./types";

const SYSTEM = `You help a marketing agency that runs clients' INSTAGRAM accounts avoid doing work
that contradicts what a client said before.
You get the client's confirmed memory (a list of items with ids) and a new message or request.
Treat the request as a planned Instagram post, Reel, Story or campaign.
Decide whether it contradicts any memory item.

Rules:
- Only flag a real contradiction, where doing the request would break something the client said.
- A request that is merely new, unrelated, or just small talk is "ok".
- If the client is clearly CHANGING their own earlier rule on purpose ("from now on…", "instead of…",
  "we've changed our mind"), that is an update, not a conflict: answer "ok" and say it updates the old rule.
- "reason" is one plain sentence a busy account manager can read in two seconds.
  If ok, say briefly why it fits. If conflict, name what it clashes with.
- "conflictsWith" lists the ids of the clashing items (empty if ok).
- "alternative": on a conflict, one sentence suggesting a version of the request that keeps its goal but fits what the
  client said, using only offers, prices and facts in the memory (for example, a value offer instead of a discount).
  If ok, use "".
- You only flag. A human decides.`;

const SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ok", "conflict"] },
    reason: { type: "string" },
    conflictsWith: { type: "array", items: { type: "string" } },
    alternative: { type: "string" },
  },
  required: ["status", "reason", "conflictsWith", "alternative"],
  additionalProperties: false,
};

// Compares a request with the client's confirmed memory items.
export async function checkRequest(client: string, request: string, items: MemoryItem[]): Promise<CheckResult> {
  const confirmed = items.filter((it) => it?.confirmed);
  const memory = confirmed.map((it) => ({ id: it.id, type: it.type, text: it.text, quote: it.quote, date: it.date }));

  const result = await askAIForJSON<CheckResult>({
    model: MODELS.smart,
    system: SYSTEM,
    user: `Client: ${displayName(client)}\n\nConfirmed memory:\n${JSON.stringify(memory, null, 2)}\n\nNew request:\n${request}`,
    schema: SCHEMA,
    maxTokens: 8000,
  });

  if (result?.status !== "ok" && result?.status !== "conflict") {
    throw new FriendlyError("The AI's answer was garbled. Please try again.", 502);
  }

  // Plain-code safety check: only keep ids that are really in the memory.
  const ids = new Set(confirmed.map((it) => it.id));
  const conflictsWith = (result.conflictsWith ?? []).filter((id) => ids.has(id));
  const status = result.status === "conflict" && conflictsWith.length > 0 ? "conflict" : "ok";
  // The suggestion may only use prices and numbers the client actually gave.
  const memoryText = confirmed.map((it) => `${it.quote} ${it.text}`).join(" ");
  let alternative = status === "conflict" ? (result.alternative ?? "").trim() : "";
  if (
    phonesIn(alternative).some((p) => !phonesIn(memoryText).some((m) => m.key === p.key)) ||
    pricesIn(alternative).some((p) => !pricesIn(memoryText).some((m) => m.value === p.value))
  ) {
    alternative = "";
  }
  return { status, reason: result.reason, conflictsWith, alternative };
}
