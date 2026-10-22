import { FriendlyError, type MediaPart } from "@/lib/ai";
import { reviewCreative } from "@/lib/review";
import type { CreativeKind, MemoryItem, ReviewContext } from "@/lib/types";

export const maxDuration = 120; // reviewing a video can take a while

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_BODY_CHARS = 4_200_000; // Vercel accepts about 4.5 MB per request

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) {
      throw new FriendlyError("This upload is too large. Use fewer slides or a shorter video.", 413);
    }
    const body = JSON.parse(raw || "null");

    const clientKey = str(body?.client, 100);
    const clientName = str(body?.clientName, 100) || clientKey;
    const kind = body?.kind as CreativeKind;
    const items: MemoryItem[] = Array.isArray(body?.items) ? body.items : [];
    const media: MediaPart[] = Array.isArray(body?.media) ? body.media : [];

    if (!clientKey) throw new FriendlyError("Pick a client first.");
    if (!["image", "carousel", "video"].includes(kind)) throw new FriendlyError("Upload an image, a carousel or a video.");
    if (media.length === 0) throw new FriendlyError("Add the creative you want reviewed.");
    if (media.length > 20) throw new FriendlyError("That's too many files. A carousel can have up to 20 slides.");
    for (const m of media) {
      const type = /^data:([^;]+);base64,/.exec(m?.dataUrl ?? "")?.[1] ?? "";
      const ok = m?.kind === "video" ? VIDEO_TYPES.includes(type) : IMAGE_TYPES.includes(type);
      if (!ok) throw new FriendlyError("One of the files isn't a supported image (JPG, PNG, WebP) or video (MP4, WebM, MOV).");
    }

    const context: ReviewContext = {
      format: str(body?.context?.format, 100),
      campaign: str(body?.context?.campaign, 200),
      purpose: str(body?.context?.purpose, 300),
      caption: str(body?.context?.caption, 2200), // Instagram's caption limit
      newInstructions: str(body?.context?.newInstructions, 1000),
      stage: body?.context?.stage === "revision" ? "revision" : "first_draft",
    };
    const previousFindings = Array.isArray(body?.previousFindings)
      ? body.previousFindings.slice(0, 30).map((f: Record<string, unknown>) => ({ title: str(f.title, 200), location: str(f.location, 60), fix: str(f.fix, 300) }))
      : undefined;
    const systemLimitations = Array.isArray(body?.limitations) ? body.limitations.slice(0, 5).map((l: unknown) => str(l, 300)) : [];

    const result = await reviewCreative({
      clientKey,
      clientName,
      category: str(body?.category, 100),
      kind,
      analysedAs: str(body?.analysedAs, 120),
      media,
      context,
      items,
      previousFindings,
      systemLimitations,
    });
    return Response.json({ result, context });
  } catch (err) {
    if (err instanceof FriendlyError) return Response.json({ error: err.message, code: err.code }, { status: err.status });
    console.error(err);
    return Response.json({ error: "Something went wrong reviewing this. Please try again." }, { status: 500 });
  }
}
