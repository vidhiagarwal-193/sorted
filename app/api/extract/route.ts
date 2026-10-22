import { askAIForJSON, FriendlyError, MODELS } from "@/lib/ai";
import { ITEM_TYPES, type ItemType, type MemoryItem } from "@/lib/types";

const MAX_CHARS = 1_000_000; // about 1 MB of text

const SYSTEM = `You read chat and email history between a marketing agency and one of its clients.
Pull out what the CLIENT wants the agency to remember, in four types:
- preference: things they like or want (colours, tone, style, platforms, timing)
- dont: things they never want
- offer: their current product, price or promotion that posts should feature
- decision: something agreed or finalised ("final", "go with", "approved")

Rules:
- Only include things the client said or clearly agreed to. Ignore small talk.
- "quote" must be copied word for word from the message, so it can be found in the text.
- "line" is the L-number of the message the quote is from.
- "date" is the message's date written like "3 Sep 2026". If there is no date, use "".
- If a later message changes an earlier one, keep only the newer one and say what changed in "text".
- "text" is a short plain summary, at most 12 words.
- If there is nothing worth remembering, return an empty list.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...ITEM_TYPES] },
          text: { type: "string" },
          quote: { type: "string" },
          date: { type: "string" },
          line: { type: "integer" },
        },
        required: ["type", "text", "quote", "date", "line"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

type Extracted = { items: { type: ItemType; text: string; quote: string; date: string; line: number }[] };

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const text: string = typeof body?.text === "string" ? body.text.trim() : "";
    const source = body?.source === "Email" ? "Email" : "WhatsApp";
    const client = typeof body?.client === "string" ? body.client.trim() : "";

    if (!client) throw new FriendlyError("Pick or type a client name first.");
    if (!text) throw new FriendlyError("There's no text to read. Upload a chat file or paste an email.");
    if (text.length > MAX_CHARS) throw new FriendlyError("That's too much text (over 1 MB). Try a shorter export.");

    // Number every line so the AI can tell us exactly where each quote came from.
    const lines = text.split(/\r?\n/);
    const numbered = lines.map((l, i) => `L${i + 1}: ${l}`).join("\n");

    const result = await askAIForJSON<Extracted>({
      model: MODELS.fast,
      system: SYSTEM,
      user: `Client name: ${client}\nSource: ${source}\n\n${numbered}`,
      schema: SCHEMA,
      maxTokens: 16000,
    });

    if (!Array.isArray(result?.items)) throw new FriendlyError("The AI's answer was garbled. Please try again.", 502);

    // Plain-code safety check: keep only items whose quote really appears in the text.
    const items: MemoryItem[] = result.items
      .filter((it) => ITEM_TYPES.includes(it.type) && it.quote && text.includes(it.quote))
      .map((it) => ({
        id: crypto.randomUUID(),
        type: it.type,
        text: it.text,
        quote: it.quote,
        date: it.date,
        source,
        original: lines.find((l, i) => i + 1 === it.line && l.includes(it.quote)) ?? lines.find((l) => l.includes(it.quote)) ?? it.quote,
        confirmed: false,
      }));

    if (items.length === 0) {
      throw new FriendlyError(
        "I couldn't find any preferences, don'ts, offers or decisions in that text. Try a longer chat.",
        422,
      );
    }

    return Response.json({ items });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  if (err instanceof FriendlyError) return Response.json({ error: err.message }, { status: err.status });
  console.error(err);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
