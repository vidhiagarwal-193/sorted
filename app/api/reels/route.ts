import { FriendlyError, type MediaPart } from "@/lib/ai";
import { fetchReel, normaliseReelUrl, type ReelDetails } from "@/lib/apify";
import { analyseReel, type ClientContext } from "@/lib/reel";
import type { MemoryItem, ReelAnalysis } from "@/lib/types";

export const maxDuration = 300; // opening the Reel and watching it can take a minute or two

const MAX_VIDEO_BYTES = 20_000_000; // largest Reel file Sorted will download and send to the AI
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// POST /api/reels  { url?, caption?, media?, clients: [{ key, name, category, description, items, history }] }
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const clients: ClientContext[] = (Array.isArray(body?.clients) ? body.clients : [])
      .slice(0, 30)
      .map((c: Record<string, unknown>) => ({
        key: str(c.key, 100),
        name: str(c.name, 100) || str(c.key, 100),
        category: str(c.category, 100) || undefined,
        description: str(c.description, 300) || undefined,
        items: (Array.isArray(c.items) ? (c.items as MemoryItem[]) : []).filter((it) => it?.confirmed).slice(0, 60),
        history: (Array.isArray(c.history) ? c.history : []).slice(0, 8).map((h: unknown) => str(h, 160)),
      }))
      .filter((c: ClientContext) => c.key && c.items.length > 0);
    if (clients.length === 0) {
      throw new FriendlyError("No client has confirmed brand memory yet. Confirm some (or load the demo data), then analyse the Reel.");
    }

    const rawUrl = str(body?.url, 500);
    const pastedCaption = str(body?.caption, 2200);
    const uploaded: MediaPart[] = Array.isArray(body?.media) ? body.media.slice(0, 12) : [];
    const url = rawUrl ? normaliseReelUrl(rawUrl) : null;
    if (rawUrl && !url) throw new FriendlyError("That doesn't look like an Instagram Reel link. It should look like instagram.com/reel/…");
    if (!url && !uploaded.length && !pastedCaption) throw new FriendlyError("Paste a Reel link, or upload the video, or paste its caption.");

    // 1. Open the Reel on Instagram for its caption, audio and stats (also when the team uploaded the video)
    let details: ReelDetails | null = null;
    if (url) {
      try {
        details = await fetchReel(url);
      } catch (err) {
        if (!uploaded.length) throw err; // with an upload, the video alone is enough
      }
    }
    const caption = pastedCaption || details?.caption || "";
    const limitations: string[] = [];

    // 2. Let the AI watch it: the video by link first, then as a file, then just the thumbnail and caption
    const attempts: { media: MediaPart[]; analysedAs: string; note?: string }[] = [];
    if (uploaded.length) {
      attempts.push({ media: uploaded, analysedAs: str(body?.analysedAs, 120) || "the uploaded video" });
      if (rawUrl && !details) limitations.push("Instagram didn't share this Reel's caption and stats, so only the uploaded video was used.");
    } else if (details?.videoUrl) {
      const len = details.durationSec ? `${details.durationSec}s ` : "";
      attempts.push({ media: [{ label: "The Reel", kind: "video", dataUrl: details.videoUrl }], analysedAs: `the full ${len}video with sound` });
      attempts.push({ media: [], analysedAs: `the full ${len}video with sound`, note: "file" });
      if (details.thumbnail) {
        attempts.push({
          media: [{ label: "The Reel's cover image", kind: "image", dataUrl: details.thumbnail }],
          analysedAs: "the cover image and caption only",
          note: "The video couldn't be analysed, so only the cover image, caption and stats were used. Upload the video for a full analysis.",
        });
      }
    } else if (details?.thumbnail) {
      attempts.push({
        media: [{ label: "The Reel's cover image", kind: "image", dataUrl: details.thumbnail }],
        analysedAs: "the cover image and caption only",
        note: "Instagram didn't share this Reel's video, so only the cover image, caption and stats were used. Upload the video for a full analysis.",
      });
    }
    if (!attempts.length) {
      attempts.push({ media: [], analysedAs: "the caption only", note: "Only the caption was analysed: Sorted didn't see the video or hear the audio." });
    }

    let result: Awaited<ReturnType<typeof analyseReel>> | null = null;
    let videoTooBig = 0;
    let lastError: unknown = null;
    for (const a of attempts) {
      let media = a.media;
      if (a.note === "file") {
        // Download the Reel and send the file itself
        try {
          const res = await fetch(details!.videoUrl, { signal: AbortSignal.timeout(60_000) });
          const size = Number(res.headers.get("content-length") ?? 0);
          if (size > MAX_VIDEO_BYTES) {
            videoTooBig = Math.round(size / 1e6);
            res.body?.cancel();
            continue;
          }
          if (!res.ok) continue;
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > MAX_VIDEO_BYTES) continue;
          media = [{ label: "The Reel", kind: "video", dataUrl: `data:video/mp4;base64,${buf.toString("base64")}` }];
        } catch {
          continue;
        }
      }
      try {
        result = await analyseReel({ details, caption, media, analysedAs: a.analysedAs, clients });
        if (a.note && a.note !== "file") {
          limitations.push(
            videoTooBig
              ? `This Reel's video is ${videoTooBig} MB, too large for the AI to watch from the link, so only the cover image, caption and stats were used. Upload the video for a full analysis.`
              : a.note,
          );
        }
        break;
      } catch (err) {
        lastError = err;
        // Only fall back when the AI couldn't open the media; other errors stop here
        if (!(err instanceof FriendlyError) || (err.code !== "media_rejected" && err.status !== 413 && err.status !== 502)) throw err;
      }
    }
    if (!result) throw lastError ?? new FriendlyError("Sorted couldn't analyse this Reel. Upload the video or paste its caption instead.", 502);

    const analysis: ReelAnalysis = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      url: url ?? "",
      source: {
        owner: details?.owner ?? "",
        caption: caption.slice(0, 500),
        audio: details?.audio ?? "",
        durationSec: details?.durationSec ?? 0,
        plays: details?.plays ?? 0,
        likes: details?.likes ?? 0,
        postedAt: details?.postedAt ?? "",
        thumbnail: details?.thumbnail ?? "",
      },
      ...result,
      limitations: [
        ...limitations,
        ...result.limitations,
        `Compared with ${clients.length} client${clients.length === 1 ? "" : "s"} that have confirmed brand memory.`,
      ],
    };
    return Response.json({ analysis });
  } catch (err) {
    if (err instanceof FriendlyError) return Response.json({ error: err.message }, { status: err.status });
    console.error(err);
    return Response.json({ error: "Something went wrong analysing this Reel. Please try again." }, { status: 500 });
  }
}
