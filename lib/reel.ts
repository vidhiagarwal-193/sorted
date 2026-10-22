import { askAIForJSON, FriendlyError, MODELS, type MediaPart } from "./ai";
import type { ReelDetails } from "./apify";
import { phonesIn, pricesIn } from "./review";
import type { FitLevel, MemoryItem, ReelAnalysis, ReelMatch } from "./types";

// "Analyse a Reel link": the AI watches one Reel and, like a creative strategist, works out which of the agency's
// clients could use it and how, including clients in a completely different industry.

export type ClientContext = {
  key: string;
  name: string;
  category?: string;
  description?: string;
  items: MemoryItem[]; // confirmed memory only
  history: string[]; // recent content: approved ideas, reviewed creatives
};

const SYSTEM = `You are the creative strategist at a marketing agency that runs INSTAGRAM for small local businesses.
A teammate found a Reel they like and wants to know which of the agency's clients could use it, and how.

First, study the Reel itself (the video, sound, caption and stats you are given): its hook in the first 2 seconds,
format, story beats in order, the role of the audio (trending song, voiceover, sound effects), tone (funny, emotional,
satisfying, educational…), and why it works with viewers.

Then judge it for EVERY client listed. Think like a strategist, not a keyword matcher:
- Ignore whether the hashtags or industry match. Ask whether the CONCEPT, humour, storytelling, format, hook, audio or
  visual structure could be carried over. A cake shop's "expectation vs reality" joke could work for a boutique; a
  recipe's "watch it come together" rhythm could become "watch an outfit come together".
- Use each client's brand memory: audience, products, offers, voice, visual rules, things they never want, goals, and
  recent content (avoid repeating it). A client's "dont" or decision overrides everything: if adapting the Reel would
  break one, say so in "watchOut" and lower the score, or mark it not suitable.
- "score" 0–100 is how well an adapted version would work for that client: 75+ a strong fit you'd pitch today,
  55–74 good, 35–54 possible with effort, below 35 not suitable. Be honest; don't force matches. It's fine for every
  client to score low.
- "crossIndustry": true when the Reel comes from a different industry than the client.
- "why": 2–3 specific sentences on audience fit, format, creative potential, brand fit and goals, naming what the
  client actually told us. Never write ids in text.
- "adaptation" for clients scoring 35+: a title, the concept, a hook for the first 2 seconds, "execution" as 4–6 shots
  with timings, a call to action, a caption starter in the client's voice, 3–6 hashtags, and "keepFromOriginal": the
  essence of the trend you're keeping. Use only offers, prices, products and facts from that client's memory.
  For clients below 35, set adaptation to null.
- "evidence": ids of that client's memory items you relied on.
- "noFit": if no client scores 35 or more, explain plainly why the Reel doesn't suit any of them and whether a
  meaningful adaptation is possible at all. Otherwise "".
- "limitations": anything you could not see or hear (for example, no video given, only a thumbnail).
You only advise. A person decides.`;

const ADAPTATION = {
  anyOf: [
    {
      type: "object",
      properties: {
        title: { type: "string" },
        concept: { type: "string" },
        hook: { type: "string" },
        execution: { type: "array", items: { type: "string" } },
        cta: { type: "string" },
        captionStarter: { type: "string" },
        hashtags: { type: "array", items: { type: "string" } },
        keepFromOriginal: { type: "string" },
      },
      required: ["title", "concept", "hook", "execution", "cta", "captionStarter", "hashtags", "keepFromOriginal"],
      additionalProperties: false,
    },
    { type: "null" },
  ],
};

const SCHEMA = {
  type: "object",
  properties: {
    reel: {
      type: "object",
      properties: {
        summary: { type: "string" },
        hook: { type: "string" },
        format: { type: "string" },
        beats: { type: "array", items: { type: "string" } },
        audioRole: { type: "string" },
        tone: { type: "string" },
        whyItWorks: { type: "string" },
      },
      required: ["summary", "hook", "format", "beats", "audioRole", "tone", "whyItWorks"],
      additionalProperties: false,
    },
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          clientKey: { type: "string" },
          score: { type: "integer" },
          crossIndustry: { type: "boolean" },
          why: { type: "string" },
          adaptation: ADAPTATION,
          watchOut: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          conflictsWith: { type: "array", items: { type: "string" } },
        },
        required: ["clientKey", "score", "crossIndustry", "why", "adaptation", "watchOut", "evidence", "conflictsWith"],
        additionalProperties: false,
      },
    },
    noFit: { type: "string" },
    limitations: { type: "array", items: { type: "string" } },
  },
  required: ["reel", "matches", "noFit", "limitations"],
  additionalProperties: false,
};

type AIResult = {
  reel: ReelAnalysis["reel"];
  matches: (Omit<ReelMatch, "clientName" | "level"> & { conflictsWith: string[] })[];
  noFit: string;
  limitations: string[];
};

// The level always follows the score with the same fixed rules.
export function levelFor(score: number): FitLevel {
  return score >= 75 ? "strong" : score >= 55 ? "good" : score >= 35 ? "possible" : "not_suitable";
}

const ID_IN_TEXT = /\b(?:memory\s+(?:item\s+)?)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const clean = (t: string) => (t ?? "").replace(ID_IN_TEXT, "").replace(/\s+([,.;])/g, "$1").replace(/\s{2,}/g, " ").trim();

export async function analyseReel(opts: {
  details: ReelDetails | null; // null when the team uploaded the video or pasted a caption instead
  caption: string; // pasted caption, or the Reel's own
  media: MediaPart[];
  analysedAs: string;
  clients: ClientContext[];
}): Promise<Omit<ReelAnalysis, "id" | "createdAt" | "url" | "source">> {
  const d = opts.details;
  const clientsForAI = opts.clients.map((c) => ({
    clientKey: c.key,
    name: c.name,
    business: [c.category, c.description].filter(Boolean).join(". "),
    memory: c.items.map((it) => ({ id: it.id, type: it.type, summary: it.text, quote: it.quote })),
    recentContent: c.history.slice(0, 8),
  }));
  const user = [
    `THE REEL (analysed as: ${opts.analysedAs})`,
    d
      ? `By @${d.owner || "unknown"} · ${d.durationSec ? `${d.durationSec}s · ` : ""}${d.plays ? `${d.plays} plays · ` : ""}${d.likes} likes · ${d.comments} comments · posted ${d.postedAt.slice(0, 10)}\nAudio: ${d.audio || "unknown"}\nHashtags: ${d.hashtags.slice(0, 15).join(" ")}`
      : "No Instagram details available.",
    `Caption: ${opts.caption || "(none)"}`,
    "",
    `CLIENTS (judge every one):\n${JSON.stringify(clientsForAI, null, 2)}`,
  ].join("\n");

  const ai = await askAIForJSON<AIResult>({
    model: MODELS.fast,
    system: SYSTEM,
    user,
    schema: SCHEMA,
    maxTokens: 24000,
    media: opts.media,
    effort: "medium", // this is creative judgement across several brands
  });
  if (!ai?.reel || !Array.isArray(ai.matches)) throw new FriendlyError("The AI's answer was garbled. Please try again.", 502);

  // Plain-code checks: real clients, real evidence, the client's own rules and facts.
  const byKey = new Map(opts.clients.map((c) => [c.key, c]));
  const seen = new Set<string>();
  const limits: string[] = [];
  const matches: ReelMatch[] = [];
  for (const m of ai.matches) {
    const c = byKey.get(m.clientKey);
    if (!c || seen.has(c.key)) continue;
    seen.add(c.key);
    const ids = new Set(c.items.map((it) => it.id));
    let score = Math.max(0, Math.min(100, Math.round(m.score)));
    let adaptation = m.adaptation;
    let watchOut = clean(m.watchOut);
    // Breaking one of the client's own rules caps the fit at "possible", with the reason shown.
    if ((m.conflictsWith ?? []).some((id) => ids.has(id)) && score >= 55) {
      score = 54;
      watchOut = watchOut || "Adapting this as-is would break one of the client's own rules.";
    }
    if (adaptation) {
      const memoryText = c.items.map((it) => `${it.quote} ${it.text}`).join(" ");
      const text = clean(`${adaptation.title} ${adaptation.concept} ${adaptation.hook} ${adaptation.execution.join(" ")} ${adaptation.cta} ${adaptation.captionStarter}`);
      const bad =
        phonesIn(text).find((p) => !phonesIn(memoryText).some((x) => x.key === p.key))?.shown ??
        pricesIn(text).find((p) => !pricesIn(memoryText).some((x) => x.value === p.value))?.shown;
      if (bad) {
        adaptation = null;
        limits.push(`The idea for ${c.name} was withheld because it mentioned ${bad}, which isn't in their memory.`);
      } else {
        adaptation = {
          title: clean(adaptation.title),
          concept: clean(adaptation.concept),
          hook: clean(adaptation.hook),
          execution: adaptation.execution.map(clean).filter(Boolean).slice(0, 7),
          cta: clean(adaptation.cta),
          captionStarter: clean(adaptation.captionStarter),
          hashtags: [...new Set((adaptation.hashtags ?? []).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, "")).filter(Boolean))].slice(0, 6),
          keepFromOriginal: clean(adaptation.keepFromOriginal),
        };
      }
    }
    const level = levelFor(score);
    matches.push({
      clientKey: c.key,
      clientName: c.name,
      score,
      level,
      crossIndustry: Boolean(m.crossIndustry),
      why: clean(m.why),
      adaptation: level === "not_suitable" ? null : adaptation,
      watchOut,
      evidence: (m.evidence ?? []).filter((id) => ids.has(id)),
    });
  }
  // Every client gets an answer, even if the AI skipped one.
  for (const c of opts.clients) {
    if (!seen.has(c.key)) {
      matches.push({ clientKey: c.key, clientName: c.name, score: 0, level: "not_suitable", crossIndustry: false, why: "The AI didn't assess this client. Try again.", adaptation: null, watchOut: "", evidence: [] });
    }
  }
  matches.sort((a, b) => b.score - a.score);

  const best = matches[0]?.score ?? 0;
  return {
    analysedAs: opts.analysedAs,
    reel: {
      summary: clean(ai.reel.summary),
      hook: clean(ai.reel.hook),
      format: clean(ai.reel.format),
      beats: ai.reel.beats.map(clean).filter(Boolean).slice(0, 8),
      audioRole: clean(ai.reel.audioRole),
      tone: clean(ai.reel.tone),
      whyItWorks: clean(ai.reel.whyItWorks),
    },
    matches,
    // "Not suitable for anyone" is only said when every client scores below "possible".
    noFit: best >= 35 ? "" : clean(ai.noFit) || "None of your clients is a good fit for this Reel.",
    limitations: [...limits, ...(ai.limitations ?? []).map(clean).filter(Boolean)],
  };
}
