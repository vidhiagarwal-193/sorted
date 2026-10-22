"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Film, Link2, Music2, Shuffle, Sparkle, Upload } from "lucide-react";
import type { MediaPart } from "@/lib/ai";
import type { ClientProfile } from "@/lib/clients";
import { mmss, prepareVideo, VIDEO_TYPES } from "@/lib/media";
import { callApi, saveChangeFor } from "@/lib/useClientMemory";
import { useStored, writeStored } from "@/lib/useStored";
import type { ClientMemory, FitLevel, ReelAnalysis, ReelMatch, TrendIdea, TrendSnapshot } from "@/lib/types";
import { StepProgress } from "./Progress";
import { Evidence } from "./ReviewResults";
import { AiTag, Button, ClientAvatar, ErrorNote } from "./ui";

const HISTORY_KEY = "sorted.reelAnalyses";
const LEVEL: Record<FitLevel, { label: string; tone: string }> = {
  strong: { label: "Strong fit", tone: "bg-ink text-paper" },
  good: { label: "Good fit", tone: "bg-accent text-card" },
  possible: { label: "Possible, with adaptation", tone: "bg-sage text-ink" },
  not_suitable: { label: "Not suitable", tone: "bg-soft text-muted" },
};
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

// "Analyse a Reel link": paste any Reel and see which clients could use it, and how.
export function ReelAnalyser({ clients, memories }: { clients: ClientProfile[]; memories: Record<string, ClientMemory> }) {
  const [url, setUrl] = useState("");
  const [showFallback, setShowFallback] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"prepare" | "ai">("ai");
  const [error, setError] = useState("");
  const [viewingId, setViewingId] = useState<string | null>(null);

  const stored = useStored(HISTORY_KEY);
  const history = useMemo<ReelAnalysis[]>(() => {
    try {
      const parsed = JSON.parse(stored || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [stored]);
  const shown = history.find((a) => a.id === viewingId) ?? history[0];

  // Every client with confirmed memory, plus what they've posted or approved recently.
  const contexts = clients
    .map((c) => {
      const m = memories[c.key];
      const items = (m?.items ?? []).filter((it) => it.confirmed);
      const history = [
        ...(m?.trends ?? []).flatMap((t) => t.ideas.filter((i) => i.status !== "dismissed").map((i) => `Idea: ${i.title} (${i.format})`)),
        ...(m?.reviews ?? []).map((r) => `Reviewed ${r.creative.files.join(", ")}: ${r.result.verdict.replace("_", " ")}`),
      ].slice(-8);
      return { key: c.key, name: c.name, category: c.category, description: c.description, items, history };
    })
    .filter((c) => c.items.length > 0);

  async function analyse() {
    setError("");
    if (contexts.length === 0) return setError("No client has confirmed brand memory yet. Confirm some, or load the demo data from the Overview.");
    if (!url.trim() && !file && !caption.trim()) return setError("Paste a Reel link, or upload the video, or paste its caption.");
    setBusy(true);
    try {
      let media: MediaPart[] | undefined;
      let analysedAs: string | undefined;
      if (file) {
        if (!VIDEO_TYPES.includes(file.type) && !/\.(mp4|mov|webm)$/i.test(file.name)) throw new Error("Upload an MP4, MOV or WebM video.");
        setPhase("prepare");
        const v = await prepareVideo(file);
        media = v.whole ? [v.whole] : v.frames;
        analysedAs = v.whole
          ? `the uploaded ${mmss(v.duration)} video with sound`
          : `${v.frames.length} frames sampled across the uploaded ${mmss(v.duration)} video (no sound)`;
      }
      setPhase("ai");
      const { analysis } = await callApi<{ analysis: ReelAnalysis }>("/api/reels", {
        method: "POST",
        body: JSON.stringify({ url: url.trim() || undefined, caption: caption.trim() || undefined, media, analysedAs, clients: contexts }),
      });
      writeStored(HISTORY_KEY, JSON.stringify([analysis, ...history].slice(0, 8)));
      setViewingId(analysis.id);
      setFile(null);
      // If only the cover image was seen, offer the upload right away.
      if (/cover image|caption only/.test(analysis.analysedAs)) setShowFallback(true);
    } catch (err) {
      setError((err as Error).message);
      if (/upload the video|paste its caption/i.test((err as Error).message)) setShowFallback(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="reel" className="mb-10 rounded-2xl border border-line bg-card p-5 sm:p-6">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[20px] font-bold">
          <Link2 size={18} /> Analyse a Reel link
        </h2>
        <AiTag />
      </div>
      <p className="mb-4 max-w-2xl text-[14px] text-muted">
        Found a Reel you love? Paste it here. Sorted watches it, checks it against all {contexts.length} client
        {contexts.length === 1 ? "" : "s"} with brand memory, and tells you who could use it and how, even across industries.
      </p>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          analyse();
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.instagram.com/reel/…"
          className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-paper/50 px-3 text-[14px] placeholder:text-muted focus:border-ink focus:bg-card focus:outline-none"
          inputMode="url"
        />
        <Button type="submit" disabled={busy}>
          <Sparkle size={15} /> {busy ? "Analysing…" : "Analyse Reel"}
        </Button>
      </form>

      <button onClick={() => setShowFallback((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink" aria-expanded={showFallback}>
        <ChevronDown size={14} className={`transition ${showFallback ? "rotate-180" : ""}`} /> Instagram link not working? Upload the video or paste its caption
      </button>
      {showFallback && (
        <div className="rise mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 rounded-xl border border-line bg-paper/50 p-4 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line bg-card px-4 py-3 hover:border-muted">
            {file ? <Film size={18} /> : <Upload size={18} className="text-muted" />}
            <span className="min-w-0 flex-1 truncate text-[14px]">{file ? file.name : "Upload the Reel (MP4, MOV, WebM)"}</span>
            <input type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={2}
            placeholder="…or paste the Reel's caption"
            className="min-h-[48px] rounded-xl border border-line bg-card p-3 text-[14px] placeholder:text-muted focus:border-ink focus:outline-none"
          />
          <p className="text-[12px] text-muted sm:col-span-2">
            Keep the link in the box above too, if you have it: Sorted then uses Instagram&apos;s caption, audio and stats with your upload.
          </p>
        </div>
      )}

      {busy && (
        <StepProgress
          key={phase}
          steps={[
            file ? "Preparing your video" : "Opening the Reel on Instagram",
            "Watching it: hook, story, sound and format",
            `Comparing with ${contexts.length} client${contexts.length === 1 ? "" : "s"}' brand memory`,
            "Writing adaptations for the best fits",
          ]}
          startAt={phase === "prepare" ? 0 : file ? 1 : 0}
          at={phase === "prepare" ? [] : file ? [20, 40] : [8, 30, 50]}
          note="Usually 40–90 seconds."
        />
      )}
      {error && <ErrorNote>{error}</ErrorNote>}

      {shown && !busy && <AnalysisView analysis={shown} clients={clients} memories={memories} />}

      {history.length > 1 && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="mb-2 text-[12px] font-semibold text-muted">Earlier Reels</p>
          <ul className="flex flex-wrap gap-1.5">
            {history.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => setViewingId(a.id)}
                  className={`rounded-full border px-2.5 py-1 text-[12px] ${a.id === shown?.id ? "border-ink bg-soft" : "border-line hover:bg-soft"}`}
                >
                  {a.source.owner ? `@${a.source.owner}` : "Uploaded Reel"} · {a.matches[0]?.clientName} {a.matches[0]?.score ?? ""}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function AnalysisView({ analysis: a, clients, memories }: { analysis: ReelAnalysis; clients: ClientProfile[]; memories: Record<string, ClientMemory> }) {
  const [showOthers, setShowOthers] = useState(false);
  const fits = a.matches.filter((m) => m.level !== "not_suitable");
  const unfit = a.matches.filter((m) => m.level === "not_suitable");
  const top = fits[0];

  return (
    <div className="rise mt-6 flex flex-col gap-5">
      {/* The Reel itself */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-2xl border border-line bg-paper/50 p-4 sm:grid-cols-[120px_minmax(0,1fr)]">
        <ReelThumb analysis={a} />
        <div className="min-w-0">
          <p className="text-[12px] text-muted">
            {a.source.owner && <span className="font-semibold text-ink">@{a.source.owner}</span>}
            {a.source.plays > 0 && ` · ${compact(a.source.plays)} plays`}
            {a.source.likes > 0 && ` · ${compact(a.source.likes)} likes`}
            {a.source.durationSec > 0 && ` · ${mmss(a.source.durationSec)}`}
            {` · analysed ${a.analysedAs}`}
          </p>
          <p className="mt-1 text-[15px] font-medium leading-snug">{a.reel.summary}</p>
          <dl className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
            <Row label="Hook">{a.reel.hook}</Row>
            <Row label="Format">{a.reel.format}</Row>
            <Row label="Sound">
              {a.source.audio && (
                <span className="mr-1 inline-flex items-center gap-1 font-medium">
                  <Music2 size={12} /> {a.source.audio}.
                </span>
              )}
              {a.reel.audioRole}
            </Row>
            <Row label="Tone">{a.reel.tone}</Row>
            <Row label="Why it works" wide>
              {a.reel.whyItWorks}
            </Row>
          </dl>
          {a.reel.beats.length > 0 && (
            <details className="mt-3 text-[13px]">
              <summary className="cursor-pointer font-semibold text-muted">What happens, beat by beat</summary>
              <ol className="mt-1.5 list-decimal pl-5 text-ink/80">
                {a.reel.beats.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ol>
            </details>
          )}
        </div>
      </div>

      {/* Verdict line */}
      {a.noFit ? (
        <div className="rounded-xl border border-line bg-soft px-4 py-3">
          <p className="text-[14px] font-semibold">Not a fit for any client right now</p>
          <p className="mt-0.5 text-[13px] text-ink/80">{a.noFit}</p>
        </div>
      ) : top && top.level === "possible" ? (
        <div className="rounded-xl border border-line bg-sage/60 px-4 py-3 text-[13px]">
          <span className="font-semibold">No strong match.</span> The closest options below would need real adaptation to work.
        </div>
      ) : null}

      {/* Ranked matches */}
      {fits.length > 0 && (
        <ol className="flex flex-col gap-4">
          {fits.map((m, i) => (
            <MatchCard
              key={m.clientKey}
              rank={i + 1}
              match={m}
              analysis={a}
              client={clients.find((c) => c.key === m.clientKey)}
              items={memories[m.clientKey]?.items ?? []}
            />
          ))}
        </ol>
      )}

      {unfit.length > 0 && (
        <div className="rounded-xl border border-line">
          <button onClick={() => setShowOthers((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left text-[14px]" aria-expanded={showOthers}>
            <span>
              <span className="font-semibold">Not suitable:</span> {unfit.map((m) => m.clientName).join(", ")}
            </span>
            <ChevronDown size={15} className={`text-muted transition ${showOthers ? "rotate-180" : ""}`} />
          </button>
          {showOthers && (
            <ul className="rise flex flex-col gap-3 border-t border-line px-4 py-3">
              {unfit.map((m) => (
                <li key={m.clientKey} className="text-[13px]">
                  <p className="font-semibold">
                    {m.clientName} <span className="font-normal text-muted">· {m.score}/100</span>
                  </p>
                  <p className="text-ink/80">{m.why}</p>
                  {m.watchOut && <p className="mt-0.5 text-muted">Watch out: {m.watchOut}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="list-disc pl-5 text-[12px] text-muted">
        {a.limitations.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
        <li>Fit scores are the AI&apos;s judgement from each client&apos;s confirmed memory, not measured results. Sorted only suggests; your team decides.</li>
      </ul>
    </div>
  );
}

function MatchCard({ rank, match: m, analysis, client, items }: { rank: number; match: ReelMatch; analysis: ReelAnalysis; client?: ClientProfile; items: ClientMemory["items"] }) {
  const [saved, setSaved] = useState(false);
  const ad = m.adaptation;

  async function useForClient() {
    if (!ad) return;
    const idea: TrendIdea = {
      id: crypto.randomUUID(),
      title: ad.title,
      trend: `Adapted from @${analysis.source.owner || "a Reel you shared"}: ${analysis.reel.summary}`,
      format: "Reel",
      hook: ad.hook,
      captionStarter: ad.captionStarter,
      hashtags: ad.hashtags,
      audio: analysis.source.audio && analysis.source.audio !== "Original audio" ? analysis.source.audio : "",
      plan: [...ad.execution, `Call to action: ${ad.cta}`],
      postWhen: "",
      whyItFits: m.why,
      evidence: m.evidence,
      proof: analysis.url
        ? [
            {
              id: analysis.url,
              url: analysis.url,
              kind: "reel",
              postedAt: analysis.source.postedAt || analysis.createdAt,
              likes: analysis.source.likes,
              comments: 0,
              plays: analysis.source.plays,
              audio: analysis.source.audio,
              hashtags: [],
              caption: analysis.source.caption.slice(0, 220),
              owner: analysis.source.owner,
              thumbnail: analysis.source.thumbnail,
              score: 0,
            },
          ]
        : [],
      status: "new",
    };
    const snapshot: TrendSnapshot = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      source: "reel",
      reelUrl: analysis.url,
      hashtags: [],
      skippedHashtags: [],
      postsAnalysed: 1,
      windowDays: 0,
      signals: { audio: [], hashtags: [], reelShare: 1 },
      ideas: [idea],
      limitations: [
        `Adapted from a Reel the team shared${analysis.source.owner ? ` (@${analysis.source.owner})` : ""}, analysed ${analysis.analysedAs}.`,
        `Keeps from the original: ${ad.keepFromOriginal}`,
        ...(m.watchOut ? [`Watch out: ${m.watchOut}`] : []),
      ],
    };
    await saveChangeFor(m.clientKey, { op: "addTrends", snapshot }, `Idea from a shared Reel: ${ad.title}`);
    setSaved(true);
  }

  return (
    <li className={`rounded-2xl border bg-card ${rank === 1 ? "border-accent" : "border-line"}`}>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <span className="font-display text-[22px] font-bold text-muted">#{rank}</span>
        {client && <ClientAvatar client={client} size={40} />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[18px] font-bold">{m.clientName}</p>
          <p className="text-[12px] text-muted">{client?.category}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {m.crossIndustry && (
            <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold">
              <Shuffle size={11} /> Cross-industry
            </span>
          )}
          <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${LEVEL[m.level].tone}`}>
            {LEVEL[m.level].label} · {m.score}
          </span>
        </div>
      </div>

      <div className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Why it could work</p>
        <p className="mt-1 text-[14px]">{m.why}</p>
        <Evidence ids={m.evidence} items={items} />

        {ad && (
          <div className="mt-4 rounded-xl bg-paper p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Adaptation</p>
            <p className="mt-1 font-display text-[17px] font-bold leading-snug">{ad.title}</p>
            <p className="mt-1 text-[14px]">{ad.concept}</p>
            <dl className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              <Row label="Hook (first 2 seconds)">{ad.hook}</Row>
              <Row label="Keeps from the original">{ad.keepFromOriginal}</Row>
            </dl>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Shot list</p>
            <ol className="mt-1 flex flex-col gap-1">
              {ad.execution.map((s, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-snug">
                  <span className="mt-px shrink-0 text-[11px] font-semibold tabular-nums text-muted">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
            <dl className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              <Row label="Call to action">{ad.cta}</Row>
              <Row label="Caption starter">{ad.captionStarter}</Row>
            </dl>
            {ad.hashtags.length > 0 && <p className="mt-2 text-[13px] text-muted">#{ad.hashtags.join(" #")}</p>}
          </div>
        )}
        {m.watchOut && (
          <p className="mt-3 text-[13px]">
            <span className="font-semibold">Watch out: </span>
            {m.watchOut}
          </p>
        )}
      </div>

      {ad && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
          {saved ? (
            <>
              <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ok">
                <Check size={14} /> Added to {m.clientName}&apos;s Trend Radar
              </span>
              {client && (
                <Link href={`/clients/${client.slug}?tab=trends`} className="text-[13px] font-semibold underline decoration-accent decoration-2 underline-offset-4">
                  Open it there
                </Link>
              )}
            </>
          ) : (
            <Button onClick={useForClient} className="min-h-9 px-3">
              Use for {m.clientName}
            </Button>
          )}
          <span className="text-[12px] text-muted">Then approve it, copy the brief, and check the draft in Content Review.</span>
        </div>
      )}
    </li>
  );
}

function Row({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink/90">{children}</dd>
    </div>
  );
}

function ReelThumb({ analysis: a }: { analysis: ReelAnalysis }) {
  const [ok, setOk] = useState(Boolean(a.source.thumbnail));
  const inner = (
    <span className="relative flex aspect-[9/16] w-full max-w-[120px] items-center justify-center overflow-hidden rounded-xl bg-soft">
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element -- Instagram cover image; may expire
        <img src={a.source.thumbnail} alt="" referrerPolicy="no-referrer" onError={() => setOk(false)} className="h-full w-full object-cover" />
      ) : (
        <Film size={22} className="text-muted" />
      )}
      {a.url && (
        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-card/90 p-1">
          <ArrowUpRight size={12} />
        </span>
      )}
    </span>
  );
  return a.url ? (
    <a href={a.url} target="_blank" rel="noopener noreferrer" aria-label="Open the Reel on Instagram">
      {inner}
    </a>
  ) : (
    inner
  );
}
