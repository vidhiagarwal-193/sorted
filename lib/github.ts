import type { ClientMemory } from "./types";

// Saves each client's memory as clients/<slug>.json in a separate data repo.
// Every save is a commit, so the repo history is the decision log.

const token = () => process.env.GITHUB_TOKEN;
const repo = () => process.env.GITHUB_DATA_REPO; // e.g. "your-username/client-memory-data"

export const githubEnabled = () => Boolean(token() && repo());

// "Client A" -> "client-a"
export function clientSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export const emptyMemory = (client: string): ClientMemory => ({ client, items: [], alerts: [], updatedAt: "" });

function fileUrl(client: string) {
  return `https://api.github.com/repos/${repo()}/contents/clients/${clientSlug(client)}.json`;
}

function headers() {
  return {
    Authorization: `Bearer ${token()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// Returns the saved memory and its version id (sha), or null if the file doesn't exist yet.
export async function readMemory(client: string): Promise<{ memory: ClientMemory; sha: string } | null> {
  const res = await fetch(fileUrl(client), { headers: headers(), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const json = Buffer.from(data.content, "base64").toString("utf8");
  return { memory: JSON.parse(json), sha: data.sha };
}

// Reads the latest memory, applies `change`, and saves it as one commit.
// If someone else saved in between (GitHub says 409), it re-reads and tries again.
// `change` can return null to mean "nothing to save".
export async function updateMemory(
  client: string,
  change: (memory: ClientMemory) => ClientMemory | null,
  commitMessage: string,
): Promise<ClientMemory> {
  for (let attempt = 1; ; attempt++) {
    const existing = await readMemory(client);
    const current = existing?.memory ?? emptyMemory(client);
    const next = change(current);
    if (!next) return current;

    const saved = { ...next, client, updatedAt: new Date().toISOString() };
    const res = await fetch(fileUrl(client), {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({
        message: commitMessage.slice(0, 200),
        content: Buffer.from(JSON.stringify(saved, null, 2)).toString("base64"),
        sha: existing?.sha,
      }),
    });
    if (res.ok) return saved;
    if ((res.status === 409 || res.status === 422) && attempt < 3) continue;
    throw new Error(`GitHub write failed: ${res.status} ${await res.text()}`);
  }
}
