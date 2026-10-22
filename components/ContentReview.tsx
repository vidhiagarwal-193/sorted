"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Film, ImageUp, Images, RotateCcw, ScanSearch, X } from "lucide-react";
import type { MediaPart } from "@/lib/ai";
import type { ClientProfile } from "@/lib/clients";
import { IMAGE_TYPES, mmss, prepareImage, prepareVideo, VIDEO_TYPES } from "@/lib/media";
import { callApi } from "@/lib/useClientMemory";
import type { ClientMemory, CreativeKind, MemoryOp, ReviewContext, ReviewRecord, ReviewResult } from "@/lib/types";
import { StepProgress } from "./Progress";
import { ReviewResults, VERDICT } from "./ReviewResults";
import { AiTag, Button, ErrorNote } from "./ui";

type Slide = { id: string; file: File; url: string };

const FORMATS = [
  "Instagram feed post",
  "Instagram carousel",
  "Instagram Reel",
  "Instagram Story",
  "Video ad",
  "Festival / occasion post",
  "Promotional graphic",
  "Other",
];
const DEFAULT_FORMAT: Record<CreativeKind, string> = {
  image: "Instagram feed post",
  carousel: "Instagram carousel",
  video: "Instagram Reel",
};
const MAX_BODY_CHARS = 3_900_000;

const emptyContext = (): ReviewContext => ({ format: "", campaign: "", purpose: "", caption: "", newInstructions: "", stage: "first_draft" });

export function ContentReview(props: {
  client: ProfileLike;
  memory: ClientMemory;
  onChange: (op: MemoryOp, note: string) => void;
}) {
  const { client, memory } = props;
  const items = memory.items;
  const confirmed = items.filter((it) => it.confirmed);
  const reviews = memory.reviews ?? [];

  const [slides, setSlides] = useState<Slide[]>([]);
  const [video, setVideo] = useState<Slide | null>(null);
  const [context, setContextState] = useState<ReviewContext>(emptyContext());
  const [creativeId, setCreativeId] = useState<string>(() => crypto.randomUUID());
  const [changedSinceReview, setChangedSinceReview] = useState(false);
  const [busy, setBusy] = useState("");
  const [phase, setPhase] = useState<"prepare" | "ai" | null>(null);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<string | null>(null); // review id shown on the right
  const [highlight, setHighlight] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const slideRefs = useRef<(HTMLLIElement | null)[]>([]);

  const kind: CreativeKind | null = video ? "video" : slides.length > 1 ? "carousel" : slides.length === 1 ? "image" : null;
  const versions = reviews.filter((r) => r.creativeId === creativeId);
  const latest = versions[versions.length - 1];
  const shown = reviews.find((r) => r.id === viewing) ?? (viewing === null ? latest : undefined);
  const hasCreative = slides.length > 0 || video !== null;
  const canReview = hasCreative && (!latest || changedSinceReview);
  function setContext(next: ReviewContext) {
    setContextState(next);
    if (latest) setChangedSinceReview(true);
  }

  function addFiles(list: FileList | null) {
    setError("");
    if (!list?.length) return;
    const files = [...list];
    const videos = files.filter((f) => VIDEO_TYPES.includes(f.type) || /\.(mp4|mov|webm)$/i.test(f.name));
    const images = files.filter((f) => IMAGE_TYPES.includes(f.type));
    const other = files.filter((f) => !videos.includes(f) && !images.includes(f));
    if (other.length) return setError(`"${other[0].name}" isn't supported. Use JPG, PNG or WebP images, or an MP4, MOV or WebM video.`);
    if (videos.length && (images.length || slides.length)) return setError("A creative is either images (a post or carousel) or one video. Remove the images first.");
    if (videos.length > 1 || (videos.length && video)) return setError("Upload one video at a time. Remove the current video first.");
    if (slides.length + images.length > 20) return setError("A carousel can have up to 20 slides.");

    if (videos.length) setVideo({ id: crypto.randomUUID(), file: videos[0], url: URL.createObjectURL(videos[0]) });
    else setSlides((s) => [...s, ...images.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }))]);
    if (latest) setChangedSinceReview(true);
    if (fileInput.current) fileInput.current.value = "";
  }

  function removeSlide(id: string) {
    setSlides((s) => s.filter((x) => x.id !== id));
    if (latest) setChangedSinceReview(true);
  }
  function moveSlide(index: number, by: -1 | 1) {
    setSlides((s) => {
      const next = [...s];
      const [moved] = next.splice(index, 1);
      next.splice(index + by, 0, moved);
      return next;
    });
    if (latest) setChangedSinceReview(true);
  }

  function startNewCreative() {
    setSlides([]);
    setVideo(null);
    setContextState(emptyContext());
    setCreativeId(crypto.randomUUID());
    setChangedSinceReview(false);
    setViewing(null);
    setError("");
  }

  // Jump from a finding ("Slide 2", "0:04") to that spot in the preview.
  function jumpTo(location: string) {
    const slide = /slide\s*(\d+)/i.exec(location);
    if (slide && slides.length) {
      const i = Number(slide[1]) - 1;
      slideRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlight(i);
      setTimeout(() => setHighlight(null), 1800);
      return;
    }
    const time = /(\d+):(\d{2})/.exec(location);
    if (time && videoRef.current) {
      videoRef.current.currentTime = Number(time[1]) * 60 + Number(time[2]);
      videoRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  async function review() {
    setError("");
    if (!kind) return setError("Upload the creative you want reviewed first.");
    if (confirmed.length === 0) {
      return setError(`Confirm some of ${client.name}'s brand memory first (Brand Memory tab). Reviews compare the creative with confirmed details.`);
    }

    setPhase("prepare");
    try {
      // 1. Prepare the creative in the browser
      let media: MediaPart[];
      let analysedAs: string;
      let limitations: string[] = [];
      let fallbackFrames: MediaPart[] | null = null;

      if (kind === "video" && video) {
        setBusy("Preparing the video…");
        const v = await prepareVideo(video.file);
        const framesNote = `${v.frames.length} still frames sampled across the ${mmss(v.duration)} video`;
        if (v.whole) {
          media = [v.whole];
          analysedAs = `the whole ${mmss(v.duration)} video (sound included, if the file has any)`;
          fallbackFrames = v.frames;
        } else {
          media = v.frames;
          analysedAs = framesNote;
          limitations = [
            `The video is larger than 3 MB, so only ${framesNote} were reviewed, not every frame.`,
            "Audio, voiceover and music were not analysed.",
          ];
        }
      } else {
        setBusy(slides.length > 1 ? `Preparing ${slides.length} slides…` : "Preparing the image…");
        const encode = (side: number, q: number) =>
          Promise.all(slides.map((s, i) => prepareImage(s.file, side, q).then((dataUrl) => ({ dataUrl, i }))));
        let encoded = await encode(slides.length > 8 ? 960 : 1280, 0.8);
        if (encoded.reduce((n, e) => n + e.dataUrl.length, 0) > MAX_BODY_CHARS) encoded = await encode(720, 0.7);
        media = encoded.map(({ dataUrl, i }) => ({
          label: slides.length > 1 ? `Slide ${i + 1} of ${slides.length}` : "Image",
          kind: "image" as const,
          dataUrl,
        }));
        analysedAs = slides.length > 1 ? `all ${slides.length} slides in order` : "the image";
      }

      // 2. Ask the AI, with the client's memory and the last version's findings
      setPhase("ai");
      setBusy(`Checking against ${confirmed.length} confirmed detail${confirmed.length === 1 ? "" : "s"} from ${client.name}'s memory…`);
      const ctx = { ...context, format: context.format || DEFAULT_FORMAT[kind], stage: latest ? "revision" : context.stage } as ReviewContext;
      const send = (m: MediaPart[], as: string, lim: string[]) =>
        callApi<{ result: ReviewResult; context: ReviewContext }>("/api/review", {
          method: "POST",
          body: JSON.stringify({
            client: client.key,
            clientName: client.name,
            category: client.category,
            kind,
            analysedAs: as,
            media: m,
            context: ctx,
            items,
            limitations: lim,
            previousFindings: latest?.result.findings.map((f) => ({ title: f.title, location: f.location, fix: f.fix })),
          }),
        });

      let data;
      try {
        data = await send(media, analysedAs, limitations);
      } catch (err) {
        // If the AI can't open the whole video, fall back to still frames and say so.
        if (!fallbackFrames || !/couldn't open this video/i.test((err as Error).message)) throw err;
        analysedAs = `${fallbackFrames.length} still frames sampled across the video`;
        limitations = ["The AI couldn't open the full video file, so only still frames were reviewed.", "Audio, voiceover and music were not analysed."];
        data = await send(fallbackFrames, analysedAs, limitations);
      }

      // 3. Save it to the client's review history (never overwriting earlier versions)
      const record: ReviewRecord = {
        id: crypto.randomUUID(),
        creativeId,
        version: versions.length + 1,
        createdAt: new Date().toISOString(),
        creative: { kind, files: video ? [video.file.name] : slides.map((s) => s.file.name), analysedAs },
        context: data.context,
        memoryUsed: { confirmed: confirmed.length, itemIds: confirmed.map((it) => it.id), memoryUpdatedAt: memory.updatedAt },
        result: data.result,
      };
      props.onChange({ op: "addReview", review: record }, `${VERDICT[record.result.verdict].label}, v${record.version}`);
      setViewing(null);
      setChangedSinceReview(false);
      setContextState(ctx);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
      setPhase(null);
    }
  }

  const reviewLabel = latest ? (changedSinceReview ? "Review the new version" : "Review again") : "Review with Client Memory";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Left: the creative and its context */}
      <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <section className="rounded-2xl border border-line bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-display text-[17px] font-bold">Creative</h3>
            {kind && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
                {kind === "video" ? <Film size={14} /> : <Images size={14} />}
                {kind === "video" ? "Video" : kind === "carousel" ? `Carousel · ${slides.length} slides` : "Single image"}
              </span>
            )}
          </div>

          {video && (
            <div className="mb-3">
              <video ref={videoRef} src={video.url} controls playsInline className="max-h-[420px] w-full rounded-xl bg-ink" />
              <div className="mt-2 flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate">{video.file.name}</span>
                <button onClick={() => { setVideo(null); if (latest) setChangedSinceReview(true); }} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-muted hover:bg-soft hover:text-ink">
                  <X size={14} /> Remove
                </button>
              </div>
            </div>
          )}

          {slides.length > 0 && (
            <ol className={`mb-3 grid gap-3 ${slides.length > 1 ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3" : "grid-cols-1"}`}>
              {slides.map((s, i) => (
                <li
                  key={s.id}
                  ref={(el) => {
                    slideRefs.current[i] = el;
                  }}
                  className={`overflow-hidden rounded-xl border bg-paper transition ${highlight === i ? "border-ink ring-2 ring-accent" : "border-line"}`}
                >
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local preview of an uploaded file */}
                    <img src={s.url} alt={`Slide ${i + 1}: ${s.file.name}`} className={`w-full object-cover ${slides.length > 1 ? "aspect-[4/5]" : "max-h-[420px] object-contain"}`} />
                    {slides.length > 1 && (
                      <span className="absolute left-2 top-2 rounded-md bg-ink/80 px-1.5 py-0.5 text-[11px] font-semibold text-paper">{i + 1}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted" title={s.file.name}>
                      {s.file.name}
                    </span>
                    {slides.length > 1 && (
                      <>
                        <button disabled={i === 0} onClick={() => moveSlide(i, -1)} className="rounded p-1 text-muted hover:bg-soft hover:text-ink disabled:opacity-30" aria-label={`Move slide ${i + 1} earlier`}>
                          <ChevronLeft size={14} />
                        </button>
                        <button disabled={i === slides.length - 1} onClick={() => moveSlide(i, 1)} className="rounded p-1 text-muted hover:bg-soft hover:text-ink disabled:opacity-30" aria-label={`Move slide ${i + 1} later`}>
                          <ChevronRight size={14} />
                        </button>
                      </>
                    )}
                    <button onClick={() => removeSlide(s.id)} className="rounded p-1 text-muted hover:bg-soft hover:text-ink" aria-label={`Remove slide ${i + 1}`}>
                      <X size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {!video && (
            <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-line px-4 py-6 text-center transition hover:border-muted hover:bg-paper">
              <ImageUp size={22} className="text-muted" />
              <span className="text-[14px] font-medium">{slides.length ? "Add more slides" : "Upload a post, carousel slides or a video"}</span>
              <span className="text-[12px] text-muted">JPG, PNG, WebP · MP4, MOV, WebM · several images make a carousel</span>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                className="sr-only"
                onChange={(e) => addFiles(e.target.files)}
              />
            </label>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-card p-5">
          <h3 className="font-display text-[17px] font-bold">Context</h3>
          <p className="mb-4 mt-0.5 text-[13px] text-muted">All optional, but the caption and purpose make the review sharper.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Format">
              <select
                value={context.format || (kind ? DEFAULT_FORMAT[kind] : "")}
                onChange={(e) => setContext({ ...context, format: e.target.value })}
                className="h-10 w-full rounded-lg border border-line bg-paper/50 px-2.5 text-[14px] focus:border-ink focus:outline-none"
              >
                {!kind && !context.format && <option value="">Choose…</option>}
                {FORMATS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Field>
            <Field label="Campaign or occasion">
              <input value={context.campaign} onChange={(e) => setContext({ ...context, campaign: e.target.value })} placeholder="e.g. Diwali 2026" className={INPUT} />
            </Field>
            <Field label="Purpose" wide>
              <input value={context.purpose} onChange={(e) => setContext({ ...context, purpose: e.target.value })} placeholder="e.g. Get table bookings for the Festive Thali" className={INPUT} />
            </Field>
            <Field label="Caption" wide>
              <textarea value={context.caption} onChange={(e) => setContext({ ...context, caption: e.target.value })} rows={3} placeholder="Paste the caption that will go with the post" className={`${INPUT} h-auto py-2`} />
            </Field>
            <Field label="New instructions from the client" wide>
              <input value={context.newInstructions} onChange={(e) => setContext({ ...context, newInstructions: e.target.value })} placeholder="Anything they asked for that isn't in Brand Memory yet" className={INPUT} />
            </Field>
            <Field label="Draft stage" wide>
              <div className="flex gap-2">
                {(["first_draft", "revision"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setContext({ ...context, stage: s })}
                    className={`h-9 rounded-lg border px-3 text-[13px] ${
                      (latest ? "revision" : context.stage) === s ? "border-ink bg-ink text-paper" : "border-line text-ink hover:bg-soft"
                    }`}
                  >
                    {s === "first_draft" ? "First draft" : "Revised version"}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </section>
      </div>

      {/* Right: action, results and history */}
      <div className="flex min-w-0 flex-col gap-4">
        <section className="rounded-2xl border border-line bg-card p-5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="font-display text-[17px] font-bold">Review</h3>
            <AiTag />
          </div>
          <p className="mb-4 text-[13px] text-muted">
            Sorted reads the creative and checks it against {confirmed.length} confirmed detail{confirmed.length === 1 ? "" : "s"} from{" "}
            {client.name}&apos;s memory: instructions, don&apos;ts, offers, decisions and style.
          </p>
          {changedSinceReview && (
            <p className="mb-3 rounded-lg bg-[#F5EFE4] px-3 py-2 text-[13px]">The creative has changed since the last review. Review it again to check the new version.</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={review} disabled={!!busy || !canReview} className="flex-1">
              <ScanSearch size={16} /> {busy ? "Reviewing…" : reviewLabel}
            </Button>
            {latest && (
              <Button variant="ghost" onClick={startNewCreative} disabled={!!busy}>
                <RotateCcw size={15} /> New creative
              </Button>
            )}
          </div>
          {latest && !changedSinceReview && !busy && (
            <p className="mt-3 text-[12px] text-muted">
              This version has been reviewed. Change the creative or its context to review a new version.
            </p>
          )}
          {phase && <ReviewProgress phase={phase} details={confirmed.length} clientName={client.name} />}
          {error && <ErrorNote>{error}</ErrorNote>}
        </section>

        {busy && !shown && (
          <div className="flex flex-col gap-3">
            <div className="skeleton h-32" />
            <div className="skeleton h-24" />
            <div className="skeleton h-24" />
          </div>
        )}

        {shown && (
          <>
            {shown.creativeId !== creativeId && (
              <p className="rounded-lg bg-soft px-3 py-2 text-[13px]">
                Viewing an earlier review of {shown.creative.files.join(", ")}. The original files aren&apos;t stored in Sorted.{" "}
                <button className="font-semibold underline" onClick={() => setViewing(null)}>
                  Back to current
                </button>
              </p>
            )}
            <ReviewResults
              result={shown.result}
              items={items}
              clientName={client.name}
              analysedAs={shown.creative.analysedAs}
              confirmedUsed={shown.memoryUsed.confirmed}
              version={shown.version}
              onJump={shown.creativeId === creativeId ? jumpTo : undefined}
            />
          </>
        )}

        <History reviews={reviews} current={shown?.id} onOpen={(id) => setViewing(id)} />
      </div>
    </div>
  );
}

type ProfileLike = Pick<ClientProfile, "key" | "name" | "category">;

const INPUT = "h-10 w-full rounded-lg border border-line bg-paper/50 px-3 text-[14px] placeholder:text-muted focus:border-ink focus:bg-card focus:outline-none";

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-[12px] font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

// Every review ever run for this client, grouped by creative, newest first.
function History({ reviews, current, onOpen }: { reviews: ReviewRecord[]; current?: string; onOpen: (id: string) => void }) {
  if (reviews.length === 0) return null;
  const groups = new Map<string, ReviewRecord[]>();
  for (const r of reviews) groups.set(r.creativeId, [...(groups.get(r.creativeId) ?? []), r]);
  const ordered = [...groups.values()].reverse();
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <h4 className="mb-3 font-display text-[16px] font-bold">Review history</h4>
      <ul className="flex flex-col divide-y divide-line">
        {ordered.map((versions) => {
          const first = versions[0];
          const last = versions[versions.length - 1];
          return (
            <li key={first.creativeId} className="py-3 first:pt-0 last:pb-0">
              <p className="truncate text-[14px] font-medium">{last.creative.files.join(", ")}</p>
              <p className="text-[12px] text-muted">
                {first.context.format || first.creative.kind}
                {first.context.campaign ? ` · ${first.context.campaign}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => onOpen(v.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] ${
                      v.id === current ? "border-ink bg-soft" : "border-line hover:bg-soft"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${VERDICT[v.result.verdict].dot}`} />v{v.version} · {VERDICT[v.result.verdict].label} ·{" "}
                    {new Date(v.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Shows the team what's happening during the 10–30 seconds a review takes.
function ReviewProgress({ phase, details, clientName }: { phase: "prepare" | "ai"; details: number; clientName: string }) {
  return (
    <StepProgress
      key={phase}
      steps={[
        "Preparing the creative",
        "Reading every word and visual",
        `Comparing with ${details} confirmed detail${details === 1 ? "" : "s"} from ${clientName}'s memory`,
        "Checking prices, numbers and dates",
      ]}
      startAt={phase === "prepare" ? 0 : 1}
      at={phase === "prepare" ? [] : [5, 12]}
      note="Usually 10–30 seconds."
    />
  );
}
