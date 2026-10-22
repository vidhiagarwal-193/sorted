import { askAIForJSON, FriendlyError, MODELS } from "./ai";
import { displayName } from "./clientProfiles";
import { ITEM_TYPES, type ItemType, type MemoryItem, type Source } from "./types";

const SYSTEM = `You read chat and email history between a marketing agency and one of its clients.
The agency runs this client's INSTAGRAM account, so think in Instagram terms.
Pull out what the CLIENT wants the agency to remember, in five types:
- preference: what they want on Instagram: tone of voice, target audience, formats (Reels, carousels, Stories),
  posting days and times, caption style, emoji rules, hashtags, colours and grid look, photo or video style, collabs,
  recurring instructions, and feedback on past work ("make the text bigger next time")
- dont: content restrictions: things they never want posted, said or done
- offer: their current product, price, promotion or campaign requirement that posts should feature
- decision: something agreed, approved or finalised ("final", "go with", "approved", "yes, post it")
- fact: business facts the client gave: products and services, phone or WhatsApp numbers, address, email, website,
  opening hours, prices. Keep each fact as its own item and copy every number exactly.

Rules:
- Only include things the client said or clearly agreed to. Ignore small talk.
- Only include LASTING instructions, offers, final decisions and facts. A request for one specific post or task
  ("let's do a Diwali post", "can you make a reel about X") is NOT a memory item.
- "quote" must be copied word for word from the message, so it can be found in the text.
- "line" is the L-number of the message the quote is from.
- "date" is the message's date written like "3 Sep 2026". If there is no date, use "".
- If a later message changes an earlier one, keep only the newer one and say what changed in "text".
- "text" is a short plain summary, at most 12 words.
- "basis": "explicit" when the client directly said it; "inferred" only when it is clearly implied by what they
  wrote (for example, they always write casually). Never present a guess as explicit. When unsure, leave it out.
- "replaces": if CURRENT MEMORY is given and this message corrects, changes or cancels one of those items
  ("from now on 8pm, not 7pm", "actually we're fine with discounts this month"), list that item's id. Otherwise [].
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
          basis: { type: "string", enum: ["explicit", "inferred"] },
          replaces: { type: "array", items: { type: "string" } },
        },
        required: ["type", "text", "quote", "date", "line", "basis", "replaces"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

type Extracted = {
  items: { type: ItemType; text: string; quote: string; date: string; line: number; basis: "explicit" | "inferred"; replaces: string[] }[];
};

// Reads messages and returns new (unconfirmed) memory items. Returns [] if nothing is worth remembering.
// `existing` (the client's confirmed memory) lets live messages be recognised as corrections of earlier instructions.
export async function extractItems(
  client: string,
  text: string,
  source: Source,
  opts: { existing?: MemoryItem[]; messageRef?: string } = {},
): Promise<MemoryItem[]> {
  // Number every line so the AI can tell us exactly where each quote came from.
  const lines = text.split(/\r?\n/);
  const numbered = lines.map((l, i) => `L${i + 1}: ${l}`).join("\n");

  const result = await askAIForJSON<Extracted>({
    model: MODELS.fast,
    system: SYSTEM,
    user: [
      `Client name: ${displayName(client)}`,
      `Source: ${source}`,
      opts.existing?.length
        ? `CURRENT MEMORY (confirmed earlier):\n${JSON.stringify(opts.existing.map((it) => ({ id: it.id, type: it.type, summary: it.text, quote: it.quote, date: it.date })), null, 2)}`
        : "",
      `NEW MESSAGES:\n${numbered}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema: SCHEMA,
    maxTokens: 16000,
  });

  if (!Array.isArray(result?.items)) throw new FriendlyError("The AI's answer was garbled. Please try again.", 502);

  // Plain-code safety check: keep only items whose quote really appears in the text.
  return result.items
    .filter((it) => ITEM_TYPES.includes(it.type) && it.quote && text.includes(it.quote))
    .map((it) => ({
      id: crypto.randomUUID(),
      type: it.type,
      text: it.text,
      quote: it.quote,
      date: it.date,
      source,
      original:
        lines.find((l, i) => i + 1 === it.line && l.includes(it.quote)) ??
        lines.find((l) => l.includes(it.quote)) ??
        it.quote,
      confirmed: false,
      basis: it.basis === "inferred" ? "inferred" : "explicit",
      replaces: (it.replaces ?? []).filter((id) => opts.existing?.some((e) => e.id === id)),
      ...(opts.messageRef ? { messageRef: opts.messageRef } : {}),
    }));
}
