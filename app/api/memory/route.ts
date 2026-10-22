import { clientSlug, emptyMemory, githubEnabled, readMemory, updateMemory } from "@/lib/github";
import { applyOp, type MemoryOp } from "@/lib/types";

// GET /api/memory?client=Client%20A  -> the saved memory (or an empty one)
export async function GET(request: Request) {
  const client = new URL(request.url).searchParams.get("client")?.trim() ?? "";
  if (!clientSlug(client)) return Response.json({ error: "Missing client name." }, { status: 400 });

  if (!githubEnabled()) return Response.json({ memory: emptyMemory(client), saving: false });
  try {
    const saved = await readMemory(client);
    return Response.json({ memory: saved?.memory ?? emptyMemory(client), saving: true });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Couldn't load this client's memory from GitHub." }, { status: 502 });
  }
}

const COMMIT_LABEL: Record<MemoryOp["op"], string> = {
  add: "Add unconfirmed items",
  confirm: "Confirm",
  discard: "Discard",
  dismissAlert: "Dismiss alert",
  addReview: "Save content review",
};

// POST /api/memory  { client, change, note }  -> applies one change to the latest memory and commits it
export async function POST(request: Request) {
  if (!githubEnabled()) return Response.json({ saved: false });

  const body = await request.json().catch(() => null);
  const client = typeof body?.client === "string" ? body.client.trim() : "";
  const change = body?.change as MemoryOp | undefined;
  if (!clientSlug(client) || !change || !(change.op in COMMIT_LABEL)) {
    return Response.json({ error: "Nothing valid to save." }, { status: 400 });
  }
  const note = typeof body?.note === "string" ? `: ${body.note}` : "";

  try {
    const memory = await updateMemory(client, (m) => applyOp(m, change), `${COMMIT_LABEL[change.op]}${note} (${client})`);
    return Response.json({ saved: true, memory });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Couldn't save to GitHub. Your changes are still on this page." }, { status: 502 });
  }
}
