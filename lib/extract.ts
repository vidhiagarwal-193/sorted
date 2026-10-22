import { askAIForJSON, FriendlyError, MODELS } from "./ai";
import { displayName } from "./clientProfiles";
import { ITEM_TYPES, type ItemType, type MemoryItem, type Source } from "./types";

const SYSTEM = `You read chat and email history between a marketing agency and one of its clients.
The agency runs this client's INSTAGRAM account, so think in Instagram terms.
Pull out what the CLIENT wants the agency to remember, in five types:
- preference: what they want on Instagram: formats (Reels, carousels, Stories), posting days and times,
  caption tone, emoji rules, hashtags, colours and grid look, photo or video style, collabs and influencers
- dont: things they never want posted or done
- offer: their current product, price or promotion that posts should feature
- decision: something agreed or finalised ("final", "go with", "approved")
- fact: business facts the client gave: phone or WhatsApp numbers, address, email, website, opening hours,
  product names and their prices. Keep each fact as its own item and copy every number exactly.

Rules:
- Only include things the client said or clearly agreed to. Ignore small talk.
- Only include LASTING instructions, offers, final decisions and facts. A request for one specific post or task
  ("let's do a Diwali post", "can you make a reel about X") is NOT a memory item.
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

// Reads messages and returns new (unconfirmed) memory items. Returns [] if nothing is worth remembering.
export async function extractItems(client: string, text: string, source: Source): Promise<MemoryItem[]> {
  // Number every line so the AI can tell us exactly where each quote came from.
  const lines = text.split(/\r?\n/);
  const numbered = lines.map((l, i) => `L${i + 1}: ${l}`).join("\n");

  const result = await askAIForJSON<Extracted>({
    model: MODELS.fast,
    system: SYSTEM,
    user: `Client name: ${displayName(client)}\nSource: ${source}\n\n${numbered}`,
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
    }));
}
