import { FriendlyError } from "@/lib/ai";
import { scrapeHashtags } from "@/lib/apify";
import { cleanHashtags, pickHashtags, writeIdeas } from "@/lib/suggest";
import { analysePosts, WINDOW_DAYS } from "@/lib/trends";
import type { MemoryItem, TrendSnapshot } from "@/lib/types";

export const maxDuration = 300; // the Instagram scrape can take a couple of minutes

const PER_HASHTAG = 15;
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// POST /api/trends  { client, clientName, category, items, hashtags? }  -> a trend snapshot
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const clientName = str(body?.clientName) || str(body?.client);
    const category = str(body?.category) || undefined;
    const items: MemoryItem[] = Array.isArray(body?.items) ? body.items : [];
    const approved = items.filter((it) => it?.confirmed);
    if (!clientName) throw new FriendlyError("Pick a client first.");
    if (approved.length === 0) {
      throw new FriendlyError(`Confirm some of ${clientName}'s brand memory first. Trend ideas are matched to it.`);
    }

    // 1. Hashtags: the team's own, or picked by the AI from memory
    const given = cleanHashtags(Array.isArray(body?.hashtags) ? body.hashtags.map(String) : []);
    const hashtags = given.length ? given : await pickHashtags(clientName, category, approved);

    // 2. Real Instagram posts and Reels from Apify, both in parallel
    const [reels, posts] = await Promise.all([
      scrapeHashtags(hashtags, "reels", PER_HASHTAG),
      scrapeHashtags(hashtags, "posts", PER_HASHTAG),
    ]);
    const found = new Set([...reels.tagsWithResults, ...posts.tagsWithResults]);
    const all = [...reels.posts, ...posts.posts];

    // 3. Spot trends with plain code
    const { recent, top, signals } = analysePosts(all);
    const skippedHashtags = hashtags.filter((h) => !found.has(h) && !recent.some((p) => p.hashtags.includes(h)));
    if (top.length < 4) {
      throw new FriendlyError(
        `Instagram returned only ${recent.length} post${recent.length === 1 ? "" : "s"} from the last ${WINDOW_DAYS} days for #${hashtags.join(", #")}. Try broader or more popular hashtags.`,
        422,
      );
    }

    // 4. Ideas that fit the client, checked against the real data
    const previousTitles = Array.isArray(body?.previousTitles) ? body.previousTitles.slice(0, 15).map((t: unknown) => str(t, 120)) : [];
    const { ideas, dropped } = await writeIdeas({ clientName, category, approved, top, signals, previousTitles });
    if (ideas.length === 0) {
      throw new FriendlyError("None of the ideas passed Sorted's checks against this client's memory. Try again, or try different hashtags.", 422);
    }

    const snapshot: TrendSnapshot = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      hashtags,
      skippedHashtags,
      postsAnalysed: recent.length,
      windowDays: WINDOW_DAYS,
      signals,
      ideas,
      limitations: [
        `Based on ${recent.length} public posts and Reels from the last ${WINDOW_DAYS} days under these hashtags: a sample of each niche, not all of Instagram.`,
        "Trends come from the hashtags searched. Instagram doesn't publish its own trending list.",
        ...(skippedHashtags.length ? [`No recent posts found for #${skippedHashtags.join(", #")}.`] : []),
        ...(dropped.length ? [`Sorted dropped ${dropped.length} idea${dropped.length === 1 ? "" : "s"}: ${dropped.join("; ")}.`] : []),
      ],
    };
    return Response.json({ snapshot });
  } catch (err) {
    if (err instanceof FriendlyError) return Response.json({ error: err.message }, { status: err.status });
    console.error(err);
    return Response.json({ error: "Something went wrong finding trends. Please try again." }, { status: 500 });
  }
}
