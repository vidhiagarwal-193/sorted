import { FriendlyError } from "@/lib/ai";
import { checkRequest } from "@/lib/check";
import type { MemoryItem } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const req = typeof body?.request === "string" ? body.request.trim() : "";
    const client = typeof body?.client === "string" ? body.client.trim() : "";
    const items: MemoryItem[] = Array.isArray(body?.items) ? body.items : [];

    if (!req) throw new FriendlyError("Type or paste the new request first.");
    if (req.length > 4000) throw new FriendlyError("That request is very long. Paste just the request itself.");
    if (!items.some((it) => it?.confirmed)) {
      throw new FriendlyError("Confirm at least one item on the brief card first. Only confirmed items are checked.");
    }

    return Response.json(await checkRequest(client, req, items));
  } catch (err) {
    if (err instanceof FriendlyError) return Response.json({ error: err.message }, { status: err.status });
    console.error(err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
