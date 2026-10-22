"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, Film, Images, Link2, Music2, Plus, Radar, X } from "lucide-react";
import type { ClientProfile } from "@/lib/clients";
import { callApi } from "@/lib/useClientMemory";
import type { ClientMemory, MemoryOp, TrendIdea, TrendPost, TrendSnapshot } from "@/lib/types";
import { StepProgress } from "./Progress";
import { Evidence } from "./ReviewResults";
import { AiTag, Button, EmptyState, ErrorNote } from "./ui";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function TrendRadar(props: {
  client: Pick<ClientProfile, "key" | "name" | "category">;
  memory: ClientMemory;
  onChange: (op: MemoryOp, note: string) => void;
  onReview?: () => void; // jump to Content Review for this client
}) {
  const { client, memory } = props;
  const confirmed = memory.items.filter((it) => it.confirmed);
  const snapshots = memory.trends ?? [];
  const latest = snapshots[snapshots.length - 1];
  const lastScan = [...snapshots].reverse().find((s) => s.source !== "reel");

  const [viewingId, setViewingId] = useState<string | null>(null);
  const shown = snapshots.find((s) => s.id === viewingId) ?? latest;
  const [tags, setTags] = useState<string[] | null>(null); // null = use the last scan's hashtags
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showDismissed, setShowDismissed] = useState(false);
  const currentTags = tags ?? lastScan?.hashtags ?? [];

  function addTag() {
    const t = draft.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (t && !currentTags.includes(t) && currentTags.length < 6) setTags([...currentTags, t]);
    setDraft("");
  }

  async function findTrends() {
    setError("");
    if (confirmed.length === 0) {
      return setError(`Confirm some of ${client.name}'s brand memory first (Brand Memory tab). Trend ideas are matched to it.`);
    }
    setBusy(true);
    try {
      const { snapshot } = await callApi<{ snapshot: TrendSnapshot }>("/api/trends", {
        method: "POST",
        body: JSON.stringify({
          client: client.key,
          clientName: client.name,
          category: client.category,
          items: memory.items,
          hashtags: tags ?? undefined, // first scan: the AI picks; after that, the team's chips
          previousTitles: snapshots.flatMap((s) => s.ideas.map((i) => i.title)).slice(-15), // so ideas don't repeat
        }),
      });
      props.onChange({ op: "addTrends", snapshot }, `${snapshot.ideas.length} ideas from #${snapshot.hashtags.join(" #")}`);
      setTags(snapshot.hashtags);
      setViewingId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const visible = (shown?.ideas ?? []).filter((i) => showDismissed || i.status !== "dismissed");
  const dismissedCount = (shown?.ideas ?? []).filter((i) => i.status === "dismissed").length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        {/* Search */}
        <section className="rounded-2xl border border-line bg-card p-5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="font-display text-[17px] font-bold">Trend Radar</h3>
            <AiTag />
          </div>
          <p className="mb-4 text-[13px] text-muted">
            Sorted reads recent Instagram posts and Reels in {client.name}&apos;s niche, spots what&apos;s working, and suggests ideas
            that fit their {confirmed.length} confirmed detail{confirmed.length === 1 ? "" : "s"}.
          </p>

          <p className="mb-2 text-[12px] font-semibold text-muted">Hashtags to search</p>
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            {currentTags.length === 0 && <span className="text-[13px] text-muted">Sorted will pick them from brand memory.</span>}
            {currentTags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-1 text-[13px]">
                #{t}
                <button
                  onClick={() => setTags(currentTags.filter((x) => x !== t))}
                  className="rounded-full p-0.5 text-muted hover:bg-soft hover:text-ink"
                  aria-label={`Remove #${t}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {currentTags.length < 6 && (
              <form
                className="inline-flex items-center"
                onSubmit={(e) => {
                  e.preventDefault();
                  addTag();
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="add hashtag"
                  className="h-8 w-28 rounded-l-full border border-line bg-paper/50 px-3 text-[13px] focus:border-ink focus:outline-none"
                />
                <button type="submit" className="h-8 rounded-r-full border border-l-0 border-line px-2 text-muted hover:bg-soft hover:text-ink" aria-label="Add hashtag">
                  <Plus size={14} />
                </button>
              </form>
            )}
          </div>

          <Button onClick={findTrends} disabled={busy} className="w-full sm:w-auto">
            <Radar size={16} /> {busy ? "Finding trends…" : lastScan ? "Find fresh trends" : "Find trends"}
          </Button>
          {busy && (
            <StepProgress
              steps={[
                currentTags.length ? `Searching #${currentTags.join(", #")}` : "Picking hashtags from brand memory",
                "Reading recent Instagram posts and Reels",
                "Spotting rising audio, hashtags and formats",
                `Matching ideas to ${client.name}`,
              ]}
              at={[currentTags.length ? 2 : 6, 45, 60]}
              note="Usually 40–90 seconds: Instagram is read live."
            />
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
        </section>

        {/* Ideas */}
        {!shown && !busy && (
          <EmptyState title="No trend scan yet">
            Click Find trends to see what&apos;s working on Instagram for {client.name} right now.
          </EmptyState>
        )}

        {shown && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
              <p className="text-[13px] text-muted">
                {shown.id !== latest?.id && <span className="font-semibold text-ink">Earlier · </span>}
                {shown.source === "reel"
                  ? `From a Reel you shared · ${when(shown.createdAt)}`
                  : `Trend data from ${when(shown.createdAt)} · ${shown.postsAnalysed} posts from #${shown.hashtags.join(" #")}`}
              </p>
              {dismissedCount > 0 && (
                <button className="text-[12px] text-muted underline" onClick={() => setShowDismissed((v) => !v)}>
                  {showDismissed ? "Hide" : "Show"} dismissed ({dismissedCount})
                </button>
              )}
            </div>
            <ol className="flex flex-col gap-4">
              {visible.map((idea, i) => (
                <IdeaCard
                  key={idea.id}
                  n={i + 1}
                  idea={idea}
                  clientName={client.name}
                  items={memory.items}
                  onStatus={(status) => props.onChange({ op: "setIdea", snapshotId: shown.id, ideaId: idea.id, status }, `${status}: ${idea.title}`)}
                  onReview={props.onReview}
                />
              ))}
            </ol>
          </>
        )}
      </div>

      {/* Side: signals, limits and earlier scans */}
      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <Link
          href="/trends#reel"
          className="group flex items-start gap-3 rounded-2xl border border-line bg-card p-4 transition hover:border-ink/30"
        >
          <Link2 size={18} className="mt-0.5 shrink-0 text-muted" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">Found a Reel you like?</span>
            <span className="block text-[13px] text-muted">Analyse a Reel link to see which client it suits and how to adapt it.</span>
          </span>
          <ArrowUpRight size={15} className="mt-0.5 shrink-0 text-muted transition group-hover:text-ink" />
        </Link>
        {shown && shown.source !== "reel" && (
          <section className="rounded-2xl border border-line bg-card p-5">
            <h4 className="mb-3 font-display text-[16px] font-bold">What&apos;s rising</h4>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Format</p>
            <p className="mb-4 text-[14px]">{Math.round(shown.signals.reelShare * 100)}% of the top posts are Reels</p>
            {shown.signals.bestHours && (
              <>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">When top posts went up</p>
                <p className="mb-4 text-[14px]">Mostly {shown.signals.bestHours}</p>
              </>
            )}
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Audio used by several top posts</p>
            {shown.signals.audio.length ? (
              <ul className="mb-4 flex flex-col gap-1">
                {shown.signals.audio.map((a) => (
                  <li key={a.name} className="flex items-start gap-1.5 text-[13px]">
                    <Music2 size={13} className="mt-0.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">{a.name}</span>
                    <span className="text-muted">×{a.posts}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-[13px] text-muted">No shared audio this time (most top posts use original sound).</p>
            )}
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Hashtags across top posts</p>
            <div className="flex flex-wrap gap-1">
              {shown.signals.hashtags.length ? (
                shown.signals.hashtags.map((h) => (
                  <span key={h.tag} className="rounded-md bg-soft px-1.5 py-0.5 text-[12px]">
                    #{h.tag} <span className="text-muted">{h.posts}</span>
                  </span>
                ))
              ) : (
                <span className="text-[13px] text-muted">None repeated enough to count.</span>
              )}
            </div>
          </section>
        )}
        {shown && (
          <section className="rounded-2xl border border-line bg-card p-5">
            <h4 className="mb-2 font-display text-[16px] font-bold">How to read this</h4>
            <ul className="list-disc pl-5 text-[13px] text-muted">
              {shown.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
              <li>Sorted only suggests. Nothing is posted; your team decides.</li>
            </ul>
          </section>
        )}
        {snapshots.length > 1 && (
          <section className="rounded-2xl border border-line bg-card p-5">
            <h4 className="mb-2 font-display text-[16px] font-bold">Earlier scans</h4>
            <ul className="flex flex-col gap-1">
              {[...snapshots].reverse().map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setViewingId(s.id)}
                    className={`w-full rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-soft ${s.id === shown?.id ? "bg-soft font-medium" : ""}`}
                  >
                    {when(s.createdAt)} · {s.source === "reel" ? "from a shared Reel" : `${s.ideas.length} ideas`}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

function IdeaCard(props: {
  n: number;
  idea: TrendIdea;
  clientName: string;
  items: ClientMemory["items"];
  onStatus: (s: TrendIdea["status"]) => void;
  onReview?: () => void;
}) {
  const { idea } = props;
  const [copied, setCopied] = useState(false);

  async function copyBrief() {
    const brief = [
      `${idea.title} (${idea.format}) for ${props.clientName}`,
      `Trend: ${idea.trend}`,
      `Hook: ${idea.hook}`,
      `Caption starter: ${idea.captionStarter}`,
      idea.hashtags.length ? `Hashtags: #${idea.hashtags.join(" #")}` : "",
      idea.audio ? `Audio: ${idea.audio}` : "",
      idea.plan?.length ? `Plan:\n${idea.plan.map((step, i) => `  ${i + 1}. ${step}`).join("\n")}` : "",
      idea.postWhen ? `When to post: ${idea.postWhen}` : "",
      `Why it fits: ${idea.whyItFits}`,
      `Proof: ${idea.proof.map((p) => p.url).join("  ")}`,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <li className={`rise overflow-hidden rounded-2xl border bg-card ${idea.status === "approved" ? "border-accent" : "border-line"} ${idea.status === "dismissed" ? "opacity-60" : ""}`}>
      <div className="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-ink px-2 py-0.5 text-[11px] font-semibold text-paper">{idea.format}</span>
          <span className="text-[12px] text-muted">Idea {props.n}</span>
          {idea.status === "approved" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-sage px-2 py-0.5 text-[11px] font-semibold text-ok">
              <Check size={11} /> Approved
            </span>
          )}
        </div>
        <h4 className="font-display text-[19px] font-bold leading-snug">{idea.title}</h4>
        <p className="mt-1 text-[13px] text-muted">
          <span className="font-semibold text-ink">Trend: </span>
          {idea.trend}
        </p>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-paper p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Hook</dt>
            <dd className="mt-1 text-[14px]">{idea.hook}</dd>
          </div>
          <div className="rounded-xl bg-paper p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Caption starter</dt>
            <dd className="mt-1 text-[14px]">{idea.captionStarter}</dd>
          </div>
        </dl>
        {idea.plan && idea.plan.length > 0 && (
          <div className="mt-3 rounded-xl border border-line p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {idea.format === "Carousel" ? "Slide plan" : idea.format === "Post" ? "Shot and layout" : "Shot list"}
            </p>
            <ol className="mt-1.5 flex flex-col gap-1">
              {idea.plan.map((step, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-snug">
                  <span className="mt-px shrink-0 text-[11px] font-semibold tabular-nums text-muted">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}
        {idea.postWhen && (
          <p className="mt-3 text-[13px]">
            <span className="font-semibold">When to post: </span>
            {idea.postWhen}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
          {idea.hashtags.length > 0 && <span className="text-muted">#{idea.hashtags.join(" #")}</span>}
          {idea.audio && (
            <span className="inline-flex items-center gap-1">
              <Music2 size={13} className="text-muted" /> {idea.audio}
            </span>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-line p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Why it fits {props.clientName}</p>
          <p className="mt-1 text-[14px]">{idea.whyItFits}</p>
          <Evidence ids={idea.evidence} items={props.items} />
        </div>
      </div>

      {/* Proof: the real posts behind the idea */}
      <div className="border-t border-line bg-paper/50 px-5 py-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Working right now on Instagram</p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {idea.proof.map((p) => (
            <ProofPost key={p.id} post={p} />
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
        {idea.status !== "approved" && (
          <Button onClick={() => props.onStatus("approved")} className="min-h-9 px-3">
            <Check size={15} /> Approve
          </Button>
        )}
        {idea.status !== "dismissed" ? (
          <Button variant="ghost" onClick={() => props.onStatus("dismissed")} className="min-h-9 px-3">
            <X size={15} /> Dismiss
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => props.onStatus("new")} className="min-h-9 px-3">
            Restore
          </Button>
        )}
        <Button variant="ghost" onClick={copyBrief} className="min-h-9 px-3">
          <Copy size={14} /> {copied ? "Copied" : "Copy brief"}
        </Button>
        {idea.status === "approved" && props.onReview && (
          <button onClick={props.onReview} className="ml-auto text-[13px] font-semibold underline decoration-accent decoration-2 underline-offset-4">
            Draft it, then check it in Content Review
          </button>
        )}
      </div>
    </li>
  );
}

function ProofPost({ post }: { post: TrendPost }) {
  const [imgOk, setImgOk] = useState(Boolean(post.thumbnail));
  return (
    <li>
      <a
        href={post.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex h-full items-center gap-2.5 rounded-xl border border-line bg-card p-2 transition hover:border-ink/30"
      >
        <span className="relative flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-soft">
          {imgOk ? (
            // eslint-disable-next-line @next/next/no-img-element -- Instagram CDN thumbnail; may expire
            <img src={post.thumbnail} alt="" referrerPolicy="no-referrer" onError={() => setImgOk(false)} className="h-full w-full object-cover" />
          ) : post.kind === "reel" ? (
            <Film size={16} className="text-muted" />
          ) : (
            <Images size={16} className="text-muted" />
          )}
        </span>
        <span className="min-w-0 flex-1 text-[12px] leading-snug">
          <span className="block truncate font-semibold">@{post.owner || "instagram"}</span>
          <span className="block text-muted">
            {post.plays > 0 ? `${compact(post.plays)} plays` : `${compact(post.likes)} likes`} · {new Date(post.postedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
          <span className="inline-flex items-center gap-0.5 text-muted group-hover:text-ink">
            {post.kind === "reel" ? "Reel" : post.kind === "carousel" ? "Carousel" : "Post"} <ArrowUpRight size={11} />
          </span>
        </span>
      </a>
    </li>
  );
}
