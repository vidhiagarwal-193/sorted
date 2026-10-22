import type { TrendPost, TrendSignals } from "./types";

// Plain-code trend spotting: no AI here, so every signal can be checked by hand.

export const WINDOW_DAYS = 14;
const TOP_N = 30;
const MIN_ENGAGEMENT = 50; // likes + 3×comments + plays/20; below this a post proves nothing

// Engagement per hour since posting. Comments count more than likes; plays count a little.
export const engagement = (p: TrendPost) => p.likes + 3 * p.comments + p.plays / 20;

export function scorePost(p: TrendPost, now = Date.now()) {
  const hours = Math.max(1, (now - new Date(p.postedAt).getTime()) / 3_600_000);
  return engagement(p) / hours;
}

export function analysePosts(all: TrendPost[], now = Date.now()) {
  const cutoff = now - WINDOW_DAYS * 86_400_000;
  const unique = [...new Map(all.map((p) => [p.id, p])).values()];
  const recent = unique
    .filter((p) => {
      const t = new Date(p.postedAt).getTime();
      return Number.isFinite(t) && t >= cutoff && t <= now + 3_600_000;
    })
    .map((p) => ({ ...p, score: Math.round(scorePost(p, now) * 10) / 10 }))
    .sort((a, b) => b.score - a.score);
  const top = recent.filter((p) => engagement(p) >= MIN_ENGAGEMENT).slice(0, TOP_N);

  const count = (values: string[]) => {
    const m = new Map<string, number>();
    for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  // Count each hashtag once per post, so one spammy caption can't make a "trend".
  const audio = count(top.map((p) => p.audio).filter(Boolean))
    .filter(([, n]) => n >= 2)
    .slice(0, 5)
    .map(([name, posts]) => ({ name, posts }));
  const hashtags = count(top.flatMap((p) => [...new Set(p.hashtags)]))
    .filter(([, n]) => n >= 3)
    .slice(0, 12)
    .map(([tag, posts]) => ({ tag, posts }));
  // When did the top posts go up? 3-hour windows in Indian time; only reported if there's a clear pattern.
  const windows = count(
    top.map((p) => {
      const h = Number(new Date(p.postedAt).toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })) % 24;
      return String(Math.floor(h / 3) * 3);
    }),
  );
  const [bestStart, bestCount] = windows[0] ?? ["", 0];
  const fmt = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? " am" : " pm"}`;
  const bestHours =
    top.length >= 8 && bestCount >= 4 && bestCount / top.length >= 0.3
      ? `${fmt(Number(bestStart))}–${fmt((Number(bestStart) + 3) % 24)} IST`.replace(/ (am|pm)–(\d+) \1/, "–$2 $1")
      : "";

  const signals: TrendSignals = {
    audio,
    hashtags,
    reelShare: top.length ? Math.round((top.filter((p) => p.kind === "reel").length / top.length) * 100) / 100 : 0,
    bestHours,
  };
  return { recent, top, signals };
}
