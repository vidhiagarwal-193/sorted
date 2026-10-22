import { FriendlyError } from "./ai";
import type { TrendPost } from "./types";

// Runs Apify's official Instagram Hashtag Scraper and turns its results into clean posts.
// https://apify.com/apify/instagram-hashtag-scraper

const ACTOR = "apify~instagram-hashtag-scraper";

type RawItem = {
  id?: string;
  shortCode?: string;
  url?: string;
  inputUrl?: string;
  type?: string; // "Video" | "Image" | "Sidecar"
  productType?: string; // "clips" for Reels
  timestamp?: string;
  likesCount?: number;
  commentsCount?: number;
  videoPlayCount?: number | null;
  igPlayCount?: number;
  musicInfo?: { song_name?: string; artist_name?: string; uses_original_audio?: boolean } | null;
  hashtags?: string[];
  caption?: string;
  ownerUsername?: string;
  displayUrl?: string;
  error?: string;
};

export const apifyEnabled = () => Boolean(process.env.APIFY_TOKEN);

export async function scrapeHashtags(
  hashtags: string[],
  resultsType: "reels" | "posts",
  perHashtag: number,
): Promise<{ posts: TrendPost[]; tagsWithResults: Set<string> }> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new FriendlyError("The Apify token is missing. Add APIFY_TOKEN to .env.local (and to Vercel), then restart the app.", 500);
  }

  let res: Response;
  try {
    res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=120`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ hashtags, resultsType, resultsLimit: perHashtag }),
      signal: AbortSignal.timeout(150_000),
    });
  } catch (err) {
    console.error("Apify network error:", err);
    throw new FriendlyError("Instagram trends took too long or couldn't be reached. Try again in a minute.", 504);
  }

  if (!res.ok) {
    const detail = await res.text();
    console.error(`Apify error ${res.status}:`, detail.slice(0, 500));
    if (res.status === 401) throw new FriendlyError("The Apify token was rejected. Check APIFY_TOKEN.", 500);
    if (res.status === 402 || /credit|usage limit|payment/i.test(detail)) {
      throw new FriendlyError("Your Apify account is out of credit. Add credit at apify.com, or try again next month.", 500);
    }
    if (res.status === 408) throw new FriendlyError("Instagram trends took too long. Try again, or use fewer hashtags.", 504);
    throw new FriendlyError("Apify couldn't fetch Instagram posts right now. Please try again.", 502);
  }

  const items = (await res.json()) as RawItem[];
  const tagsWithResults = new Set<string>();
  const posts: TrendPost[] = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (it.error || !it.url || !it.timestamp) continue;
    const tag = /\/tags\/([^/?#]+)/.exec(it.inputUrl ?? "")?.[1]?.toLowerCase();
    if (tag) tagsWithResults.add(decodeURIComponent(tag));
    const music = it.musicInfo;
    posts.push({
      id: it.id || it.shortCode || it.url,
      url: it.url,
      kind: it.productType === "clips" || it.type === "Video" ? "reel" : it.type === "Sidecar" ? "carousel" : "post",
      postedAt: it.timestamp,
      likes: Math.max(0, it.likesCount ?? 0),
      comments: Math.max(0, it.commentsCount ?? 0),
      plays: Math.max(0, it.videoPlayCount ?? it.igPlayCount ?? 0),
      audio:
        music && !music.uses_original_audio && music.song_name
          ? `${music.song_name}${music.artist_name ? ` · ${music.artist_name}` : ""}`
          : "",
      hashtags: (it.hashtags ?? []).map((h) => h.toLowerCase().replace(/^#/, "")),
      caption: (it.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 220),
      owner: it.ownerUsername ?? "",
      thumbnail: it.displayUrl ?? "",
      score: 0,
    });
  }
  return { posts, tagsWithResults };
}

// ---- One Reel by its link (for "Analyse a Reel link") ----

export type ReelDetails = {
  url: string;
  owner: string;
  caption: string;
  audio: string; // "Song · Artist", "Original audio", or ""
  durationSec: number;
  plays: number;
  likes: number;
  comments: number;
  postedAt: string;
  thumbnail: string;
  videoUrl: string;
  hashtags: string[];
};

// Instagram post and Reel links look like instagram.com/reel/ABC123/ or instagram.com/p/ABC123/.
export function normaliseReelUrl(input: string): string | null {
  const m = /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/(?:[A-Za-z0-9._]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})/i.exec(input.trim());
  return m ? `https://www.instagram.com/${m[1].toLowerCase() === "p" ? "p" : "reel"}/${m[2]}/` : null;
}

export async function fetchReel(url: string): Promise<ReelDetails> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new FriendlyError("The Apify token is missing, so Sorted can't open Instagram links. Upload the video or paste its caption instead.", 500);
  }
  let res: Response;
  try {
    res = await fetch("https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=90", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ directUrls: [url], resultsType: "posts", resultsLimit: 1 }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new FriendlyError("Instagram took too long to open this Reel. Try again, or upload the video instead.", 504);
  }
  if (res.status === 401) throw new FriendlyError("The Apify token was rejected. Check APIFY_TOKEN.", 500);
  if (res.status === 402) throw new FriendlyError("Your Apify account is out of credit, so Sorted can't open Instagram links. Upload the video instead.", 500);
  if (!res.ok) throw new FriendlyError("Sorted couldn't open this Reel right now. Try again, or upload the video instead.", 502);

  const items = (await res.json()) as (RawItem & { videoUrl?: string; videoDuration?: number; videoViewCount?: number })[];
  const it = Array.isArray(items) ? items.find((x) => x && !x.error && x.url) : undefined;
  if (!it) {
    throw new FriendlyError(
      "Instagram didn't let Sorted open this Reel. It may be private, removed, or from an account that blocks it. Upload the video or paste its caption instead.",
      422,
    );
  }
  const music = it.musicInfo;
  return {
    url,
    owner: it.ownerUsername ?? "",
    caption: (it.caption ?? "").trim().slice(0, 2200),
    audio: music?.song_name
      ? music.uses_original_audio
        ? "Original audio"
        : `${music.song_name}${music.artist_name ? ` · ${music.artist_name}` : ""}`
      : "",
    durationSec: Math.round(Number(it.videoDuration ?? 0)),
    plays: Math.max(0, Number(it.videoPlayCount ?? it.videoViewCount ?? it.igPlayCount ?? 0)),
    likes: Math.max(0, Number(it.likesCount ?? 0)),
    comments: Math.max(0, Number(it.commentsCount ?? 0)),
    postedAt: it.timestamp ?? "",
    thumbnail: it.displayUrl ?? "",
    videoUrl: it.videoUrl ?? "",
    hashtags: (it.hashtags ?? []).map((h) => h.toLowerCase()),
  };
}
