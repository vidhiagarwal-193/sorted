import { clientSlug, githubEnabled, readMemory, writeMemory } from "@/lib/github";
import type { ClientMemory } from "@/lib/types";

// GET /api/memory?client=Client%20A  -> the saved memory (or an empty one)
export async function GET(request: Request) {
  const client = new URL(request.url).searchParams.get("client")?.trim() ?? "";
  if (!clientSlug(client)) return Response.json({ error: "Missing client name." }, { status: 400 });

  if (!githubEnabled()) {
    return Response.json({ memory: { client, items: [], updatedAt: "" }, saving: false });
  }
  try {
    const saved = await readMemory(client);
    return Response.json({ memory: saved?.memory ?? { client, items: [], updatedAt: "" }, saving: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Couldn't load this client's memory from GitHub." }, { status: 502 });
  }
}

// PUT /api/memory  { memory, commitMessage }  -> commits clients/<slug>.json
export async function PUT(request: Request) {
  if (!githubEnabled()) return Response.json({ saved: false });

  const body = await request.json().catch(() => null);
  const memory = body?.memory as ClientMemory | undefined;
  if (!memory || !clientSlug(memory.client ?? "") || !Array.isArray(memory.items)) {
    return Response.json({ error: "Nothing valid to save." }, { status: 400 });
  }
  const commitMessage = String(body?.commitMessage || `Update memory for ${memory.client}`).slice(0, 200);

  try {
    await writeMemory({ ...memory, updatedAt: new Date().toISOString() }, commitMessage);
    return Response.json({ saved: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Couldn't save to GitHub. Your changes are still on this page." }, { status: 502 });
  }
}
