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

export async function writeMemory(memory: ClientMemory, commitMessage: string) {
  // Look up the latest version first, so GitHub knows which version we're replacing.
  const existing = await readMemory(memory.client);
  const res = await fetch(fileUrl(memory.client), {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({
      message: commitMessage,
      content: Buffer.from(JSON.stringify(memory, null, 2)).toString("base64"),
      sha: existing?.sha,
    }),
  });
  if (!res.ok) throw new Error(`GitHub write failed: ${res.status} ${await res.text()}`);
}
