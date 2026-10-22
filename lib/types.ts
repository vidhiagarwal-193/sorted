// The four groups on the brief card.
export const ITEM_TYPES = ["preference", "dont", "offer", "decision", "fact"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const TYPE_LABELS: Record<ItemType, string> = {
  preference: "Preferences",
  dont: "Don'ts",
  offer: "Current offer",
  decision: "Decisions",
  fact: "Key facts",
};

export type Source = "WhatsApp" | "Email" | "WhatsApp (live)";

// One thing the client told us, plus where it came from.
export type MemoryItem = {
  id: string;
  type: ItemType;
  text: string; // short summary, e.g. "No discounts in posts"
  quote: string; // the client's exact words
  date: string; // e.g. "3 Sep 2026"
  source: Source;
  original: string; // the full original message line, shown when you click a warning
  confirmed: boolean; // only confirmed items are used by the conflict check
};

// A live WhatsApp message that contradicts confirmed memory.
export type Alert = {
  id: string;
  message: string; // what the client just sent
  from: string; // sender's WhatsApp name
  date: string;
  reason: string;
  conflictsWith: string[]; // ids of memory items
  dismissed: boolean;
};

// Everything we remember about one client. Saved as clients/<slug>.json in GitHub.
export type ClientMemory = {
  client: string;
  items: MemoryItem[];
  alerts?: Alert[];
  seenMessageIds?: string[]; // WhatsApp message ids already processed (Meta can send one twice)
  reviews?: ReviewRecord[]; // content reviews, newest last; never overwritten
  updatedAt: string;
};

// ---- Content review ----

export type Verdict = "good_to_go" | "minor_changes" | "needs_revision" | "needs_verification";
export type Severity = "critical" | "important" | "suggestion";
export type Certainty = "confirmed" | "needs_verification";
export type FindingCategory = "instruction" | "missing" | "brand" | "copy" | "visual" | "video" | "carousel" | "fact";
export type AreaStatus = "ok" | "issue" | "unknown";

export type Finding = {
  id: string;
  severity: Severity;
  certainty: Certainty; // confirmed problem, or something a human needs to check
  category: FindingCategory;
  title: string; // what the issue is
  location: string; // where: "Slide 2", "0:04", "Caption", "Whole creative"
  why: string; // why it matters
  fix: string; // specific suggested correction
  evidence: string[]; // ids of the memory items behind it (checked against real memory)
};

export type ReviewResult = {
  verdict: Verdict;
  headline: string; // one sentence the team can read in seconds
  areas: Record<"instructions" | "brand" | "messaging" | "facts" | "objective", { status: AreaStatus; note: string }>;
  findings: Finding[];
  missing: { detail: string; required: boolean; why: string }[];
  positives: { point: string; evidence: string[] }[];
  fixes: string[]; // prioritised checklist
  textFound: string; // all readable text the AI saw in the creative
  checked: string[]; // what was actually analysed
  limitations: string[]; // what could not be analysed
  previous?: { title: string; status: "resolved" | "still_present" | "unclear" }[]; // when re-reviewing a revision
};

export type CreativeKind = "image" | "carousel" | "video";

export type ReviewContext = {
  format: string; // e.g. "Instagram feed post", "Instagram Reel"
  campaign: string;
  purpose: string;
  caption: string;
  newInstructions: string;
  stage: "first_draft" | "revision";
};

export type ReviewRecord = {
  id: string;
  creativeId: string; // same for every version of one creative
  version: number;
  createdAt: string;
  creative: { kind: CreativeKind; files: string[]; analysedAs: string }; // file names, never the files themselves
  context: ReviewContext;
  memoryUsed: { confirmed: number; itemIds: string[]; memoryUpdatedAt: string };
  result: ReviewResult;
};

export type CheckResult = {
  status: "ok" | "conflict";
  reason: string;
  conflictsWith: string[]; // ids of the memory items it clashes with
};

// Small changes the dashboard asks the server to apply to the latest saved memory.
export type MemoryOp =
  | { op: "add"; items: MemoryItem[] }
  | { op: "confirm"; id: string }
  | { op: "discard"; id: string }
  | { op: "dismissAlert"; id: string }
  | { op: "addReview"; review: ReviewRecord };

export function applyOp(memory: ClientMemory, change: MemoryOp): ClientMemory {
  switch (change.op) {
    case "add":
      return { ...memory, items: [...memory.items, ...change.items] };
    case "confirm":
      return { ...memory, items: memory.items.map((it) => (it.id === change.id ? { ...it, confirmed: true } : it)) };
    case "discard":
      return { ...memory, items: memory.items.filter((it) => it.id !== change.id) };
    case "dismissAlert":
      return {
        ...memory,
        alerts: (memory.alerts ?? []).map((a) => (a.id === change.id ? { ...a, dismissed: true } : a)),
      };
    case "addReview":
      return { ...memory, reviews: [...(memory.reviews ?? []), change.review] };
  }
}
