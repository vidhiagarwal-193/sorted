import { askAIForJSON, FriendlyError, MODELS, type MediaPart } from "./ai";
import type {
  CreativeKind,
  Finding,
  MemoryItem,
  ReviewContext,
  ReviewResult,
  Severity,
  Verdict,
} from "./types";

const SYSTEM = `You are Sorted's content reviewer for a marketing agency that runs clients' INSTAGRAM accounts.
The team shows you a creative (a post, a carousel, or a Reel / video) BEFORE it goes to the client.
Answer one question: "Knowing everything we know about this client, is this ready to go, and if not, exactly what must change?"

You get:
- APPROVED MEMORY: things the client said, confirmed by the team. Each has an id, type, summary, exact quote and date.
- UNCONFIRMED MEMORY: things the AI found but no human has confirmed. Never treat these as rules. You may only use them
  to raise a "needs_verification" finding.
- Context from the team (format, campaign, purpose, caption, new instructions, draft stage). Any part may be empty.
- Today's date, for checking whether offers have expired.
- The creative itself: images labelled "Slide N" for carousels, "Image" for single posts, "Frame at m:ss" for sampled
  video frames, or a whole video.

How to review:
1. Read every piece of text in the creative and the caption. Put it all in "textFound", word for word.
   If some text is too small or blurry to read, say "[unreadable]" rather than guessing.
2. Compare the creative with APPROVED MEMORY: instructions and don'ts, tone and style, colours and look the client asked for,
   current offers and prices (and their end dates), and final decisions. This is the most important part.
3. Check what is missing for THIS campaign and THIS client (a price on a price-led post, an end date for a limited offer,
   a call to action if the purpose needs one). Only flag what this creative actually needs. "required" = the post
   shouldn't go out without it; otherwise it is optional.
4. Check copy: spelling, grammar, tone, names, price and offer consistency, claims that are not backed by memory.
5. Check the visuals: hierarchy, readability on a phone, text density, image quality, whether the first slide or
   opening frame grabs attention, and fit for the chosen Instagram format.
6. Carousels: review the slides as a sequence (hook on slide 1, logical flow, consistent offer and style, a proper ending
   or call to action) and name the exact slide for every slide-specific issue.
7. Video: review the hook, pacing, on-screen text, captions, product accuracy and call to action. Use timestamps (m:ss).
   Only describe what you were actually given.

Rules for findings:
- severity "critical": wrong or old prices, offers that conflict with memory, prohibited content, or breaking an explicit
  client instruction. "important": missing info the post can't work without (a sale with no price, an offer with no
  end date), clear brand inconsistency, misleading copy, big creative problems.
  "suggestion": optional improvements. A weak or missing call to action, extra imagery, hashtags or a stronger hook are
  suggestions (and "required": false in missing) unless the client explicitly asked for them in APPROVED MEMORY.
- Be consistent: the same creative and memory should always get the same severities.
- certainty "confirmed" only when the creative clearly contradicts APPROVED MEMORY or is clearly wrong.
  Use "needs_verification" when a human must check (a fact we have no record of, an unconfirmed memory item, two memory
  items that disagree, a claim nobody approved).
- "evidence" lists the ids of the memory items behind the finding. Use [] if none. NEVER invent ids, instructions,
  approvals or chat history. If memory has nothing on a topic (for example the client's phone number, address, logo or
  fonts), say so in the finding or in "areas" instead of guessing.
- If two memory items disagree, raise one finding citing both ids. Prefer the newer one only if it clearly replaces the older.
- FACTS: compare EVERY phone or WhatsApp number, price, date, address and product name in the creative and caption,
  digit by digit, with APPROVED MEMORY. Anything that differs, even by one digit, is a critical, confirmed "fact"
  finding with its own title (for example "Wrong WhatsApp number" or "Wrong price for the linen kurta").
  Give each wrong number or price its own finding; don't fold it into another one.
- Never list a phone number, price, address or date under "positives" unless it exactly matches APPROVED MEMORY.
- "location" is exact: "Slide 2", "0:04", "Caption", "Headline", "Whole creative".
- "fix" is specific and actionable ("Change '20% OFF' to 'Free dessert with every thali'"), never "make it better".
- "positives" are real strengths, with evidence ids where they match memory.
- "fixes" is a short prioritised checklist (most important first).
- "areas": for instructions, brand, messaging, facts and objective give status ok / issue / unknown and a short note.
  Use "unknown" when memory or context gives you nothing to judge against.
- "checked" lists what you actually analysed. "limitations" lists anything you could not check.
- If PREVIOUS FINDINGS are given, this is a revised version: for each one say whether it is resolved, still_present or unclear.
- "suggestedCaption": if a caption was given, rewrite it so it fixes every finding and follows APPROVED MEMORY (tone,
  emoji rules, banned words, offers, facts, hashtags). Use only prices, numbers and facts that are in APPROVED MEMORY.
  Keep it a real Instagram caption the team could post. If no caption was given, use "".
- "headline" is one plain sentence a busy account manager can read in two seconds.
You are a review assistant. You never approve or publish anything; a human decides.`;

const STATUS = { type: "object", properties: { status: { type: "string", enum: ["ok", "issue", "unknown"] }, note: { type: "string" } }, required: ["status", "note"], additionalProperties: false };

const SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    areas: {
      type: "object",
      properties: { instructions: STATUS, brand: STATUS, messaging: STATUS, facts: STATUS, objective: STATUS },
      required: ["instructions", "brand", "messaging", "facts", "objective"],
      additionalProperties: false,
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["critical", "important", "suggestion"] },
          certainty: { type: "string", enum: ["confirmed", "needs_verification"] },
          category: { type: "string", enum: ["instruction", "missing", "brand", "copy", "visual", "video", "carousel", "fact"] },
          title: { type: "string" },
          location: { type: "string" },
          why: { type: "string" },
          fix: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
        },
        required: ["severity", "certainty", "category", "title", "location", "why", "fix", "evidence"],
        additionalProperties: false,
      },
    },
    missing: {
      type: "array",
      items: {
        type: "object",
        properties: { detail: { type: "string" }, required: { type: "boolean" }, why: { type: "string" } },
        required: ["detail", "required", "why"],
        additionalProperties: false,
      },
    },
    positives: {
      type: "array",
      items: {
        type: "object",
        properties: { point: { type: "string" }, evidence: { type: "array", items: { type: "string" } } },
        required: ["point", "evidence"],
        additionalProperties: false,
      },
    },
    fixes: { type: "array", items: { type: "string" } },
    suggestedCaption: { type: "string" },
    textFound: { type: "string" },
    checked: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } },
    previous: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, status: { type: "string", enum: ["resolved", "still_present", "unclear"] } },
        required: ["title", "status"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "areas", "findings", "missing", "positives", "fixes", "suggestedCaption", "textFound", "checked", "limitations", "previous"],
  additionalProperties: false,
};

type AIReview = Omit<ReviewResult, "verdict" | "findings"> & { findings: Omit<Finding, "id">[] };

export type ReviewInput = {
  clientKey: string;
  clientName: string;
  category?: string;
  kind: CreativeKind;
  analysedAs: string; // e.g. "3 slides", "whole video (0:18)", "12 frames from a 0:45 video"
  media: MediaPart[];
  context: ReviewContext;
  items: MemoryItem[];
  previousFindings?: { title: string; location: string; fix: string }[];
  systemLimitations: string[]; // added by the app, e.g. "audio not analysed"
};

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, important: 1, suggestion: 2 };

// The verdict comes from the findings with fixed rules, so it's always consistent with what's listed.
export function verdictFor(findings: Finding[], missing: ReviewResult["missing"]): Verdict {
  if (findings.some((f) => f.severity === "critical" && f.certainty === "confirmed")) return "needs_revision";
  if (findings.some((f) => f.severity !== "suggestion" && f.certainty === "needs_verification")) return "needs_verification";
  if (findings.some((f) => f.severity === "important") || missing.some((m) => m.required)) return "needs_revision";
  if (findings.length > 0 || missing.length > 0) return "minor_changes";
  return "good_to_go";
}

// ---- Plain-code fact checks: numbers are too important to leave to the AI alone ----

const digitsOf = (s: string) => s.replace(/\D/g, "");
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const PRICE = /(?:₹|\brs\.?|\binr)\s?(\d[\d,]*(?:\.\d+)?)/gi;

// Phone-like numbers, compared by their last 10 digits so "+91 98200 11223" equals "9820011223".
export function phonesIn(text: string) {
  return [...text.matchAll(PHONE)].map((m) => ({ shown: m[0].trim(), key: digitsOf(m[0]).slice(-10) })).filter((p) => p.key.length === 10);
}
export function pricesIn(text: string) {
  return [...text.matchAll(PRICE)].map((m) => ({ shown: m[0].trim(), value: Number(m[1].replace(/,/g, "")) })).filter((p) => p.value > 0);
}
const unique = <T,>(list: T[], key: (t: T) => string | number) => [...new Map(list.map((t) => [key(t), t])).values()];

function factFindings(creativeText: string, approved: MemoryItem[], findings: Finding[], clientName: string): Finding[] {
  const memoryText = (it: MemoryItem) => `${it.quote} ${it.text}`;
  const memPhones = approved.flatMap((it) => phonesIn(memoryText(it)).map((p) => ({ ...p, it })));
  const memPrices = approved.flatMap((it) => pricesIn(memoryText(it)).map((p) => ({ ...p, it })));
  const extra: Finding[] = [];
  const alreadyTitled = (needle: string) =>
    findings.some((f) => digitsOf(f.title).includes(needle) || (f.category === "fact" && digitsOf(`${f.title} ${f.why}`).includes(needle)));

  for (const phone of unique(phonesIn(creativeText), (p) => p.key)) {
    if (memPhones.some((m) => m.key === phone.key) || alreadyTitled(phone.key.slice(-6))) continue;
    const right = memPhones[0];
    extra.push(
      right
        ? {
            id: crypto.randomUUID(), severity: "critical", certainty: "confirmed", category: "fact",
            title: `Wrong contact number: ${phone.shown}`,
            location: "Wherever the number appears",
            why: `${clientName} gave ${right.shown} (${right.it.source}, ${right.it.date || "no date"}). Customers would message the wrong number.`,
            fix: `Change ${phone.shown} to ${right.shown}.`,
            evidence: unique(memPhones, (m) => m.it.id).map((m) => m.it.id),
          }
        : {
            id: crypto.randomUUID(), severity: "important", certainty: "needs_verification", category: "fact",
            title: `Contact number ${phone.shown} isn't in ${clientName}'s records`,
            location: "Wherever the number appears",
            why: "Sorted has no saved phone number for this client, so it can't confirm this one is right.",
            fix: `Confirm ${phone.shown} with the client, then add it to Brand Memory.`,
            evidence: [],
          },
    );
  }

  if (memPrices.length) {
    for (const price of unique(pricesIn(creativeText), (p) => p.value)) {
      if (memPrices.some((m) => m.value === price.value) || alreadyTitled(String(price.value))) continue;
      const approvedList = unique(memPrices, (m) => m.value).map((m) => m.shown).join(", ");
      extra.push({
        id: crypto.randomUUID(), severity: "critical", certainty: "needs_verification", category: "fact",
        title: `Price ${price.shown} isn't an approved price`,
        location: "Wherever the price appears",
        why: `The only prices in ${clientName}'s memory are ${approvedList}. A wrong price can't be taken back once customers see it.`,
        fix: `Use the approved price (${approvedList}), or confirm ${price.shown} with the client before posting.`,
        evidence: unique(memPrices, (m) => m.it.id).map((m) => m.it.id),
      });
    }
  }
  return extra;
}

// A strength that quotes a number we can't verify, or praises a detail that has a problem, isn't a strength.
function positiveIsVerified(point: string, approved: MemoryItem[], findings: Finding[]) {
  const memory = approved.map((it) => `${it.quote} ${it.text}`).join(" ");
  if (!phonesIn(point).every((p) => phonesIn(memory).some((m) => m.key === p.key))) return false;
  if (!pricesIn(point).every((p) => pricesIn(memory).some((m) => m.value === p.value))) return false;
  const problem = (re: RegExp) => findings.some((f) => f.severity !== "suggestion" && re.test(`${f.title} ${f.why}`));
  if (/whats\s?app|phone|contact|number|call/i.test(point) && problem(/whats\s?app|phone|contact|number/i)) return false;
  if (/price|₹|\brs\b|cost/i.test(point) && problem(/price|₹|\brs\b/i)) return false;
  return true;
}

export async function reviewCreative(input: ReviewInput): Promise<ReviewResult> {
  const approved = input.items.filter((it) => it.confirmed);
  const unconfirmed = input.items.filter((it) => !it.confirmed && !it.supersededBy); // replaced instructions are history, not memory
  if (approved.length === 0) {
    throw new FriendlyError(
      `Confirm some of ${input.clientName}'s brand memory first. Reviews compare the creative with confirmed details.`,
    );
  }
  const show = (it: MemoryItem) => ({ id: it.id, type: it.type, summary: it.text, quote: it.quote, date: it.date, source: it.source });
  const c = input.context;
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

  const user = [
    `Client: ${input.clientName}${input.category ? ` (${input.category})` : ""}`,
    `Today: ${today}`,
    `Creative: ${input.kind} — analysed as ${input.analysedAs}`,
    "",
    `Format: ${c.format || "(not given)"}`,
    `Campaign / occasion: ${c.campaign || "(not given)"}`,
    `Purpose: ${c.purpose || "(not given)"}`,
    `Draft stage: ${c.stage === "revision" ? "revised version" : "first draft"}`,
    `Caption: ${c.caption || "(none given)"}`,
    `New instructions from the client (not yet in memory): ${c.newInstructions || "(none)"}`,
    "",
    `APPROVED MEMORY:\n${JSON.stringify(approved.map(show), null, 2)}`,
    "",
    `UNCONFIRMED MEMORY:\n${unconfirmed.length ? JSON.stringify(unconfirmed.map(show), null, 2) : "(none)"}`,
    "",
    input.previousFindings?.length
      ? `PREVIOUS FINDINGS (from the last version of this creative):\n${JSON.stringify(input.previousFindings, null, 2)}`
      : "PREVIOUS FINDINGS: (none, return an empty list)",
  ].join("\n");

  const ai = await askAIForJSON<AIReview>({
    model: MODELS.fast,
    system: SYSTEM,
    user,
    schema: SCHEMA,
    maxTokens: 20000,
    media: input.media,
    effort: "medium", // reviewing against a client's rules is the judgement that matters most
  });
  if (!Array.isArray(ai?.findings) || !ai.areas) throw new FriendlyError("The AI's answer was garbled. Please try again.", 502);

  // Plain-code safety checks: evidence must point at real memory items; nothing is invented.
  const known = new Set(input.items.map((it) => it.id));
  const real = (ids: string[] = []) => ids.filter((id) => known.has(id));
  const aiFindings: Finding[] = ai.findings.map((f) => ({ ...f, id: crypto.randomUUID(), evidence: real(f.evidence) }));
  const creativeText = `${ai.textFound ?? ""}\n${input.context.caption}`;

  // A wrong price or phone number is always critical, whatever severity the AI gave it.
  const memText = approved.map((it) => `${it.quote} ${it.text}`).join(" ");
  const wrongNumbers = [
    ...phonesIn(creativeText).filter((p) => phonesIn(memText).length && !phonesIn(memText).some((m) => m.key === p.key)).map((p) => p.key.slice(-6)),
    ...pricesIn(creativeText).filter((p) => pricesIn(memText).length && !pricesIn(memText).some((m) => m.value === p.value)).map((p) => String(p.value)),
  ];
  for (const f of aiFindings) {
    const digits = digitsOf(`${f.title} ${f.why}`);
    if (f.severity !== "critical" && wrongNumbers.some((n) => digits.includes(n))) {
      f.severity = "critical";
      f.certainty = "confirmed";
    }
  }
  const findings = [...aiFindings, ...factFindings(creativeText, approved, aiFindings, input.clientName)].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const missing = ai.missing ?? [];

  // The suggested caption is held to the same fact rules as the creative.
  let suggestedCaption = (ai.suggestedCaption ?? "").trim();
  const captionLimits: string[] = [];
  if (suggestedCaption) {
    const memoryText = approved.map((it) => `${it.quote} ${it.text}`).join(" ");
    const badPhone = phonesIn(suggestedCaption).some((p) => !phonesIn(memoryText).some((m) => m.key === p.key));
    const badPrice = pricesIn(suggestedCaption).some((p) => !pricesIn(memoryText).some((m) => m.value === p.value));
    if (badPhone || badPrice) {
      suggestedCaption = "";
      captionLimits.push("A suggested caption was withheld because it used a price or number that isn't in the client's memory.");
    }
  }

  return {
    verdict: verdictFor(findings, missing),
    suggestedCaption,
    headline: ai.headline,
    areas: ai.areas,
    findings,
    missing,
    positives: (ai.positives ?? [])
      .filter((p) => positiveIsVerified(p.point, approved, findings))
      .map((p) => ({ ...p, evidence: real(p.evidence) })),
    fixes: ai.fixes ?? [],
    textFound: ai.textFound ?? "",
    checked: ai.checked ?? [],
    limitations: [
      ...input.systemLimitations,
      "Sorted doesn't store the client's logo files, fonts or past approved posts, so logo and typography were judged only against what the client said in memory.",
      ...captionLimits,
      ...(ai.limitations ?? []),
    ],
    previous: input.previousFindings?.length ? (ai.previous ?? []) : undefined,
  };
}
