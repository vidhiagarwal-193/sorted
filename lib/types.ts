// The four groups on the brief card.
export const ITEM_TYPES = ["preference", "dont", "offer", "decision"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const TYPE_LABELS: Record<ItemType, string> = {
  preference: "Preferences",
  dont: "Don'ts",
  offer: "Current offer",
  decision: "Decisions",
};

// One thing the client told us, plus where it came from.
export type MemoryItem = {
  id: string;
  type: ItemType;
  text: string; // short summary, e.g. "No discounts in posts"
  quote: string; // the client's exact words
  date: string; // e.g. "3 Sep 2026"
  source: "WhatsApp" | "Email";
  original: string; // the full original message line, shown when you click a warning
  confirmed: boolean; // only confirmed items are used by the conflict check
};

// Everything we remember about one client. Saved as clients/<slug>.json in GitHub.
export type ClientMemory = {
  client: string;
  items: MemoryItem[];
  updatedAt: string;
};

export type CheckResult = {
  status: "ok" | "conflict";
  reason: string;
  conflictsWith: string[]; // ids of the memory items it clashes with
};
