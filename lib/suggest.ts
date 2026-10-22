import { askAIForJSON, FriendlyError, MODELS } from "./ai";
import { phonesIn, pricesIn } from "./review";
import type { MemoryItem, TrendIdea, TrendPost, TrendSignals } from "./types";

const show = (it: MemoryItem) => ({ id: it.id, type: it.type, summary: it.text, quote: it.quote });

// ---- 1. Pick hashtags for the client's niche ----

const HASHTAG_SYSTEM = `You help a marketing agency find what's trending on INSTAGRAM for one of its clients.
From the client's confirmed brand memory, choose 4 Instagram hashtags that people in this client's niche and city
actively post under right now. Prefer specific, active niche tags over huge generic ones (#food, #love).
Include at most one seasonal or occasion tag if memory mentions a season, festival or campaign.
Return hashtags without "#", lowercase, letters and numbers only.`;

const HASHTAG_SCHEMA = {
  type: "object",
  properties: { hashtags: { type: "array", items: { type: "string" } } },
  required: ["hashtags"],
  additionalProperties: false,
};

export function cleanHashtags(list: string[]) {
  return [...new Set(list.map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, "")).filter((h) => h.length >= 2))].slice(0, 6);
}

export async function pickHashtags(clientName: string, category: string | undefined, approved: MemoryItem[]) {
  const out = await askAIForJSON<{ hashtags: string[] }>({
    model: MODELS.fast,
    system: HASHTAG_SYSTEM,
    user: `Client: ${clientName}${category ? ` (${category})` : ""}\n\nConfirmed memory:\n${JSON.stringify(approved.map(show), null, 2)}`,
    schema: HASHTAG_SCHEMA,
    maxTokens: 2000,
  });
  const tags = cleanHashtags(out?.hashtags ?? []).slice(0, 4);
  if (tags.length === 0) throw new FriendlyError("The AI couldn't pick hashtags. Add your own and try again.", 502);
  return tags;
}

// ---- 2. Turn real trend data into ideas that fit the client ----

const IDEA_SYSTEM = `You are Sorted's trend strategist for a marketing agency that runs clients' INSTAGRAM accounts.
You get: one client's APPROVED MEMORY (their own rules, offers, facts and decisions), trend SIGNALS measured from real
recent Instagram posts in their niche, and the TOP POSTS themselves (each with an id).

Write 4 post ideas for THIS client that ride a real trend in the data, strongest first. Each idea must:
- be built on what the TOP POSTS show (a format, hook style, audio or hashtag that is working right now);
- fit the client: follow every instruction and don't in APPROVED MEMORY, use their current offer or products where it
  makes sense, and never invent prices, discounts, phone numbers, addresses or products that aren't in memory;
- "proofPostIds": 2 or 3 ids from TOP POSTS that show this trend working. Use only ids that appear in TOP POSTS.
- "evidence": ids of the memory items that make this idea right for the client.
- "whyItFits": one or two sentences linking the trend to this client's brand, saying in plain words what the client
  told us (for example "Priya asked for maroon and gold"). Never write ids anywhere except the id fields.
- "conflictsWith": ids of any memory items this idea would break. Ideas that break the client's rules are useless, so
  aim for an empty list; if an idea needs one, replace it with a different idea.
- "hook": the first line or first 2 seconds. "captionStarter": the first sentence of the caption, in the client's voice.
- "hashtags": 3 to 6, from the data where possible, without "#". "audio": a trending audio from SIGNALS, or "".
- "format": Reel, Carousel, Story or Post. Prefer the format the data shows is winning.
- "plan": make it ready to shoot. For a Reel or Story, 4–6 shots with timings ("0–2s: close-up of …"), based on
  what the top posts do. For a Carousel, one line per slide ("Slide 1: …"), 4–7 slides, ending with a call to action.
  For a Post, 2–3 lines on the shot and layout. Follow the client's visual rules (colours, real photos, logo).
- "postWhen": if APPROVED MEMORY says when to post, use that and say so; otherwise use SIGNALS.bestHours; if neither,
  give a sensible day and time for this kind of business and say it's a suggestion.
- Don't repeat or lightly reword any idea in PREVIOUS IDEAS; find a different angle or trend.
- Cover clearly different angles across the ideas, for example: the product up close, behind the scenes or how it's
  made, the current offer, an occasion or the people who enjoy it. Use more than one format when the data supports it.
Make the ideas clearly different from each other. You only suggest; a human decides.`;

const IDEA_SCHEMA = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          trend: { type: "string" },
          format: { type: "string", enum: ["Reel", "Carousel", "Story", "Post"] },
          hook: { type: "string" },
          captionStarter: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
          audio: { type: "string" },
          plan: { type: "array", items: { type: "string" } },
          postWhen: { type: "string" },
          whyItFits: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          proofPostIds: { type: "array", items: { type: "string" } },
          conflictsWith: { type: "array", items: { type: "string" } },
        },
        required: ["title", "trend", "format", "hook", "captionStarter", "hashtags", "audio", "plan", "postWhen", "whyItFits", "evidence", "proofPostIds", "conflictsWith"],
        additionalProperties: false,
      },
    },
  },
  required: ["ideas"],
  additionalProperties: false,
};

export type RawIdea = Omit<TrendIdea, "id" | "proof" | "status"> & { proofPostIds: string[]; conflictsWith: string[] };

export async function writeIdeas(opts: {
  clientName: string;
  category?: string;
  approved: MemoryItem[];
  top: TrendPost[];
  signals: TrendSignals;
  previousTitles?: string[];
}): Promise<{ ideas: TrendIdea[]; dropped: string[] }> {
  const posts = opts.top.map((p) => ({
    id: p.id,
    kind: p.kind,
    postedAt: p.postedAt.slice(0, 10),
    likes: p.likes,
    comments: p.comments,
    plays: p.plays,
    audio: p.audio,
    hashtags: p.hashtags.slice(0, 12),
    caption: p.caption,
  }));
  const out = await askAIForJSON<{ ideas: RawIdea[] }>({
    model: MODELS.fast,
    system: IDEA_SYSTEM,
    user: [
      `Client: ${opts.clientName}${opts.category ? ` (${opts.category})` : ""}`,
      `\nAPPROVED MEMORY:\n${JSON.stringify(opts.approved.map(show), null, 2)}`,
      `\nSIGNALS:\n${JSON.stringify(opts.signals, null, 2)}`,
      `\nTOP POSTS (most engaging per hour first):\n${JSON.stringify(posts, null, 2)}`,
      `\nPREVIOUS IDEAS (don't repeat):\n${opts.previousTitles?.length ? opts.previousTitles.map((t) => `- ${t}`).join("\n") : "(none)"}`,
    ].join("\n"),
    schema: IDEA_SCHEMA,
    maxTokens: 16000,
    effort: "medium", // matching trends to a brand is a judgement call
  });
  if (!Array.isArray(out?.ideas)) throw new FriendlyError("The AI's answer was garbled. Please try again.", 502);

  return checkIdeas(out.ideas, opts.top, opts.approved);
}

const ID_IN_TEXT = /\b(?:memory\s+(?:item\s+)?)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const clean = (t: string) => (t ?? "").replace(ID_IN_TEXT, "").replace(/\(\s*\)|\s+([,.;])/g, "$1").replace(/\s{2,}/g, " ").trim();

// Plain-code safety checks: nothing invented reaches the team. Keeps the 3 strongest ideas that pass.
export function checkIdeas(raws: RawIdea[], top: TrendPost[], approved: MemoryItem[]): { ideas: TrendIdea[]; dropped: string[] } {
  const byId = new Map(top.map((p) => [p.id, p]));
  const memoryIds = new Set(approved.map((it) => it.id));
  const memoryText = approved.map((it) => `${it.quote} ${it.text}`).join(" ");
  const memPhones = new Set(phonesIn(memoryText).map((p) => p.key));
  const memPrices = new Set(pricesIn(memoryText).map((p) => p.value));
  const ideas: TrendIdea[] = [];
  const dropped: string[] = [];

  for (const raw of raws.slice(0, 6)) {
    if (ideas.length === 3) break;
    const proof = [...new Set(raw.proofPostIds ?? [])].map((id) => byId.get(id)).filter((p): p is TrendPost => Boolean(p)).slice(0, 3);
    // Check numbers only after removing internal ids, which can look like phone numbers.
    const text = clean(`${raw.title} ${raw.hook} ${raw.captionStarter} ${raw.whyItFits} ${(raw.plan ?? []).join(" ")} ${raw.postWhen ?? ""}`);
    const badPhone = phonesIn(text).find((p) => !memPhones.has(p.key));
    const badPrice = pricesIn(text).find((p) => !memPrices.has(p.value));
    if ((raw.conflictsWith ?? []).some((id) => memoryIds.has(id))) {
      dropped.push(`"${raw.title}" would break the client's own rules`);
    } else if (proof.length < 2) {
      dropped.push(`"${raw.title}" didn't have 2 real, well-performing posts behind it`);
    } else if (badPhone || badPrice) {
      dropped.push(`"${raw.title}" mentioned ${badPrice?.shown ?? badPhone?.shown}, which isn't in the client's memory`);
    } else {
      ideas.push({
        id: crypto.randomUUID(),
        title: clean(raw.title),
        trend: clean(raw.trend),
        format: raw.format,
        hook: clean(raw.hook),
        captionStarter: clean(raw.captionStarter),
        hashtags: cleanHashtags(raw.hashtags ?? []),
        audio: raw.audio ?? "",
        plan: (raw.plan ?? []).map(clean).filter(Boolean).slice(0, 7),
        postWhen: clean(raw.postWhen ?? ""),
        whyItFits: clean(raw.whyItFits),
        evidence: (raw.evidence ?? []).filter((id) => memoryIds.has(id)),
        proof,
        status: "new",
      });
    }
  }
  return { ideas, dropped };
}

