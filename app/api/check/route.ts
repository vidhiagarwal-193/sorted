import { askAIForJSON, FriendlyError, MODELS } from "@/lib/ai";
import type { CheckResult, MemoryItem } from "@/lib/types";

const SYSTEM = `You help a marketing agency avoid doing work that contradicts what a client said before.
You get the client's confirmed memory (a list of items with ids) and a new request.
Decide whether the new request contradicts any memory item.

Rules:
- Only flag a real contradiction, where doing the request would break something the client said.
- A request that is merely new or unrelated is "ok".
- "reason" is one plain sentence a busy account manager can read in two seconds.
  If ok, say briefly why it fits. If conflict, name what it clashes with.
- "conflictsWith" lists the ids of the clashing items (empty if ok).
- You only flag. A human decides.`;

const SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ok", "conflict"] },
    reason: { type: "string" },
    conflictsWith: { type: "array", items: { type: "string" } },
  },
  required: ["status", "reason", "conflictsWith"],
  additionalProperties: false,
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const req = typeof body?.request === "string" ? body.request.trim() : "";
    const client = typeof body?.client === "string" ? body.client.trim() : "";
    const items: MemoryItem[] = Array.isArray(body?.items) ? body.items : [];
    const confirmed = items.filter((it) => it?.confirmed);

    if (!req) throw new FriendlyError("Type or paste the new request first.");
    if (req.length > 4000) throw new FriendlyError("That request is very long. Paste just the request itself.");
    if (confirmed.length === 0) {
      throw new FriendlyError("Confirm at least one item on the brief card first. Only confirmed items are checked.");
    }

    const memory = confirmed.map((it) => ({ id: it.id, type: it.type, text: it.text, quote: it.quote, date: it.date }));

    const result = await askAIForJSON<CheckResult>({
      model: MODELS.smart,
      system: SYSTEM,
      user: `Client: ${client}\n\nConfirmed memory:\n${JSON.stringify(memory, null, 2)}\n\nNew request:\n${req}`,
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

    return Response.json({ status, reason: result.reason, conflictsWith } satisfies CheckResult);
  } catch (err) {
    if (err instanceof FriendlyError) return Response.json({ error: err.message }, { status: err.status });
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
