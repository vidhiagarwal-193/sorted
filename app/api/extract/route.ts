import { FriendlyError } from "@/lib/ai";
import { extractItems } from "@/lib/extract";

const MAX_CHARS = 1_000_000; // about 1 MB of text

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const text: string = typeof body?.text === "string" ? body.text.trim() : "";
    const source = body?.source === "Email" ? "Email" : "WhatsApp";
    const client = typeof body?.client === "string" ? body.client.trim() : "";

    if (!client) throw new FriendlyError("Pick or type a client name first.");
    if (!text) throw new FriendlyError("There's no text to read. Upload a chat file or paste an email.");
    if (text.length > MAX_CHARS) throw new FriendlyError("That's too much text (over 1 MB). Try a shorter export.");

    const items = await extractItems(client, text, source);
    if (items.length === 0) {
      throw new FriendlyError(
        "I couldn't find any preferences, don'ts, offers or decisions in that text. Try a longer chat.",
        422,
      );
    }
    return Response.json({ items });
  } catch (err) {
    if (err instanceof FriendlyError) return Response.json({ error: err.message }, { status: err.status });
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
