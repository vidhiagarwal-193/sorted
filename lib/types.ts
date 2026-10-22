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

export type Source = "WhatsApp" | "Email" | "WhatsApp (live)" | "Telegram (live)";

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
  basis?: "explicit" | "inferred"; // the client said it, or the AI inferred it (inferred items need extra care)
  replaces?: string[]; // ids of earlier items this one corrects or changes
  supersededBy?: string; // set when a newer confirmed item replaced this one (kept for the record)
  messageRef?: string; // the live message it came from, e.g. "telegram:12345:678"
};

// A live message received from a connected channel, kept so the team can see what arrived and what happened.
export type InboundMessage = {
  id: string; // e.g. "telegram:<chatId>:<messageId>"
  channel: "telegram" | "whatsapp";
  chatTitle: string;
  sender: string;
  text: string;
  sentAt: string; // ISO time from the channel
  receivedAt: string;
  status: "processed" | "skipped" | "failed";
  note: string; // what happened, or the error
  itemsAdded: number;
  conflict: boolean;
};

// A live WhatsApp message that contradicts confirmed memory.
export type Alert = {
  id: string;
  message: string; // what the client just sent
  from: string; // sender's WhatsApp name
  date: string;
  reason: string;
  conflictsWith: string[]; // ids of memory items
  alternative?: string;
  dismissed: boolean;
};

// Everything we remember about one client. Saved as clients/<slug>.json in GitHub.
export type ClientMemory = {
  client: string;
  items: MemoryItem[];
  alerts?: Alert[];
  seenMessageIds?: string[]; // WhatsApp message ids already processed (Meta can send one twice)
  messages?: InboundMessage[]; // live messages received (newest last, the last 200 kept)
  reviews?: ReviewRecord[]; // content reviews, newest last; never overwritten
  trends?: TrendSnapshot[]; // Trend Radar results, newest last; the last 5 are kept
  updatedAt: string;
};

// ---- Trend Radar ----

// One real Instagram post or Reel from Apify, cleaned up.
export type TrendPost = {
  id: string;
  url: string;
  kind: "reel" | "post" | "carousel";
  postedAt: string; // ISO time
  likes: number;
  comments: number;
  plays: number; // 0 when Instagram doesn't share it
  audio: string; // "Song · Artist", or "" for original audio
  hashtags: string[];
  caption: string; // trimmed
  owner: string;
  thumbnail: string; // may expire or be blocked by Instagram
  score: number; // engagement per hour since posting
};

export type TrendSignals = {
  audio: { name: string; posts: number }[]; // non-original audio used by 2+ top posts
  hashtags: { tag: string; posts: number }[]; // hashtags on 3+ top posts
  reelShare: number; // 0..1, share of top posts that are Reels
  bestHours?: string; // when most top posts went up, e.g. "6–9 pm IST" ("" if no clear pattern)
};

export type TrendIdea = {
  id: string;
  title: string;
  trend: string; // what's taking off
  format: "Reel" | "Carousel" | "Story" | "Post";
  hook: string;
  captionStarter: string;
  hashtags: string[];
  audio: string;
  plan?: string[]; // shot list for a Reel or Story ("0–2s: …"), slide plan for a carousel
  postWhen?: string; // when to post, from the client's memory or the data
  whyItFits: string;
  evidence: string[]; // memory item ids (checked against real memory)
  proof: TrendPost[]; // real posts behind the idea (checked against the Apify data)
  status: "new" | "approved" | "dismissed";
};

export type TrendSnapshot = {
  id: string;
  createdAt: string;
  source?: "scan" | "reel"; // "reel" = an idea adapted from a Reel the team shared
  reelUrl?: string;
  hashtags: string[];
  skippedHashtags: string[]; // asked for but returned no recent posts
  postsAnalysed: number;
  windowDays: number;
  signals: TrendSignals;
  ideas: TrendIdea[];
  limitations: string[];
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
  suggestedCaption?: string; // a corrected caption in the client's voice ("" if there was no copy to fix)
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
  alternative?: string; // on a conflict: a version of the request that fits the client ("" if none)
};

// Small changes the dashboard asks the server to apply to the latest saved memory.
export type MemoryOp =
  | { op: "add"; items: MemoryItem[] }
  | { op: "confirm"; id: string }
  | { op: "discard"; id: string }
  | { op: "dismissAlert"; id: string }
  | { op: "addReview"; review: ReviewRecord }
  | { op: "addTrends"; snapshot: TrendSnapshot }
  | { op: "setIdea"; snapshotId: string; ideaId: string; status: TrendIdea["status"] };

export function applyOp(memory: ClientMemory, change: MemoryOp): ClientMemory {
  switch (change.op) {
    case "add":
      return { ...memory, items: [...memory.items, ...change.items] };
    case "confirm": {
      // Confirming a correction retires the instructions it replaces (kept, with their dates, but no longer used).
      const replaces = new Set(memory.items.find((it) => it.id === change.id)?.replaces ?? []);
      return {
        ...memory,
        items: memory.items.map((it) =>
          it.id === change.id ? { ...it, confirmed: true } : replaces.has(it.id) ? { ...it, confirmed: false, supersededBy: change.id } : it,
        ),
      };
    }
    case "discard":
      return { ...memory, items: memory.items.filter((it) => it.id !== change.id) };
    case "dismissAlert":
      return {
        ...memory,
        alerts: (memory.alerts ?? []).map((a) => (a.id === change.id ? { ...a, dismissed: true } : a)),
      };
    case "addReview":
      return { ...memory, reviews: [...(memory.reviews ?? []), change.review] };
    case "addTrends":
      return { ...memory, trends: [...(memory.trends ?? []), change.snapshot].slice(-5) };
    case "setIdea":
      return {
        ...memory,
        trends: (memory.trends ?? []).map((t) =>
          t.id !== change.snapshotId
            ? t
            : { ...t, ideas: t.ideas.map((i) => (i.id === change.ideaId ? { ...i, status: change.status } : i)) },
        ),
      };
  }
}

// ---- Analyse a Reel link (part of Trend Radar) ----

export type FitLevel = "strong" | "good" | "possible" | "not_suitable";

export type ReelMatch = {
  clientKey: string;
  clientName: string;
  score: number; // 0–100, the AI's fit rating; the level is set from it by plain code
  level: FitLevel;
  crossIndustry: boolean; // the Reel comes from a different industry than this client
  why: string; // reasoning: audience, format, brand fit, goals, restrictions
  adaptation: {
    title: string;
    concept: string;
    hook: string;
    execution: string[]; // shot by shot
    cta: string;
    captionStarter: string;
    hashtags: string[];
    keepFromOriginal: string; // the essence of the trend that's preserved
  } | null; // null when it isn't a fit
  watchOut: string; // risks or client rules to respect ("" if none)
  evidence: string[]; // that client's memory item ids
};

export type ReelAnalysis = {
  id: string;
  createdAt: string;
  url: string;
  source: {
    owner: string;
    caption: string;
    audio: string;
    durationSec: number;
    plays: number;
    likes: number;
    postedAt: string;
    thumbnail: string;
  };
  analysedAs: string; // what the AI actually saw, e.g. "the full 60s video with sound"
  reel: {
    summary: string;
    hook: string;
    format: string;
    beats: string[]; // what happens, in order
    audioRole: string;
    tone: string;
    whyItWorks: string;
  };
  matches: ReelMatch[]; // best first
  noFit: string; // "" when at least one client is a good fit; otherwise why nothing fits
  limitations: string[];
};
