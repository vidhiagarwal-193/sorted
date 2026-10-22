import type { ClientMemory } from "./types";

// Saves each client's memory as clients/<slug>.json in a separate data repo.
// Every save is a commit, so the repo history is the decision log.
// Other small JSON files (e.g. telegram/chats.json) use the same helpers.

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

const memoryPath = (client: string) => `clients/${clientSlug(client)}.json`;
const fileUrl = (path: string) => `https://api.github.com/repos/${repo()}/contents/${path}`;

function headers() {
  return {
    Authorization: `Bearer ${token()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// Returns a JSON file and its version id (sha), or null if it doesn't exist yet.
export async function readJson<T>(path: string): Promise<{ data: T; sha: string } | null> {
  const res = await fetch(fileUrl(path), { headers: headers(), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return { data: JSON.parse(Buffer.from(body.content, "base64").toString("utf8")), sha: body.sha };
}

// Reads the latest version, applies `change`, and saves it as one commit.
// If someone else saved in between (GitHub says 409), it re-reads and tries again.
// `change` can return null to mean "nothing to save".
export async function updateJson<T>(path: string, empty: T, change: (current: T) => T | null, commitMessage: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const existing = await readJson<T>(path);
    const current = existing?.data ?? empty;
    const next = change(current);
    if (next === null) return current;
    const res = await fetch(fileUrl(path), {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({
        message: commitMessage.slice(0, 200),
        content: Buffer.from(JSON.stringify(next, null, 2)).toString("base64"),
        sha: existing?.sha,
      }),
    });
    if (res.ok) return next;
    if ((res.status === 409 || res.status === 422) && attempt < 4) continue;
    throw new Error(`GitHub write failed: ${res.status} ${await res.text()}`);
  }
}

export async function readMemory(client: string): Promise<{ memory: ClientMemory; sha: string } | null> {
  const r = await readJson<ClientMemory>(memoryPath(client));
  return r ? { memory: r.data, sha: r.sha } : null;
}

export async function updateMemory(
  client: string,
  change: (memory: ClientMemory) => ClientMemory | null,
  commitMessage: string,
): Promise<ClientMemory> {
  return updateJson<ClientMemory>(
    memoryPath(client),
    emptyMemory(client),
    (current) => {
      const next = change(current);
      return next ? { ...next, client, updatedAt: new Date().toISOString() } : null;
    },
    commitMessage,
  );
}
