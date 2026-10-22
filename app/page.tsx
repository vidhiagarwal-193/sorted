"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { FeedTile, StartTiles, Stories, Workflow, buildFeed } from "@/components/LandingFeed";
import { VERDICT } from "@/components/ReviewResults";
import { AiTag, Button, ClientAvatar, Page, Skeleton } from "@/components/ui";
import { useClients, type ClientProfile } from "@/lib/clients";
import { loadDemoData } from "@/lib/demoData";
import { summarize, useAllMemories } from "@/lib/useAllMemories";
import { useStatus } from "@/lib/useStatus";
import { useStored } from "@/lib/useStored";
import type { ClientMemory, ReelAnalysis, ReviewRecord } from "@/lib/types";

type Focus = { client: ClientProfile; kind: "conflict" | "creative" | "review" | "start"; title: string; detail: string; action: string };

// Builds "Today's focus" from real data only: open conflicts first, then details to review,
// then clients with no brand memory yet.
function buildFocus(clients: ClientProfile[], memories: Record<string, ClientMemory>): Focus[] {
  const focus: Focus[] = [];
  for (const client of clients) {
    const memory = memories[client.key];
    for (const a of (memory?.alerts ?? []).filter((x) => !x.dismissed)) {
      focus.push({ client, kind: "conflict", title: `"${a.message}"`, detail: a.reason, action: "Review conflict" });
    }
  }
  for (const client of clients) {
    for (const r of latestPerCreative(memories[client.key]?.reviews)) {
      if (r.result.verdict !== "needs_revision" && r.result.verdict !== "needs_verification") continue;
      focus.push({
        client,
        kind: "creative",
        title: `${VERDICT[r.result.verdict].label}: ${r.creative.files.join(", ")}`,
        detail: r.result.headline,
        action: "See review",
      });
    }
  }
  for (const client of clients) {
    const s = summarize(memories[client.key]);
    if (s.toReview > 0) {
      focus.push({
        client,
        kind: "review",
        title: `${s.toReview} new detail${s.toReview === 1 ? "" : "s"} to confirm`,
        detail: "Sorted found these in their messages. Confirm what's right so it's used in checks.",
        action: "Review details",
      });
    }
  }
  for (const client of clients) {
    const s = summarize(memories[client.key]);
    if (s.confirmed === 0 && s.toReview === 0) {
      focus.push({
        client,
        kind: "start",
        title: "No brand memory yet",
        detail: "Add their WhatsApp chat or an email so Sorted can learn what they want.",
        action: "Add messages",
      });
    }
  }
  return focus;
}

// The newest version of each reviewed creative.
function latestPerCreative(reviews: ReviewRecord[] = []) {
  const latest = new Map<string, ReviewRecord>();
  for (const r of reviews) latest.set(r.creativeId, r);
  return [...latest.values()];
}

export default function Overview() {
  const { clients } = useClients();
  const { memories, loading } = useAllMemories(clients.map((c) => c.key));
  const focus = buildFocus(clients, memories);
  const totals = clients.reduce(
    (t, c) => {
      const s = summarize(memories[c.key]);
      return { conflicts: t.conflicts + s.conflicts, toReview: t.toReview + s.toReview, confirmed: t.confirmed + s.confirmed };
    },
    { conflicts: 0, toReview: 0, confirmed: 0 },
  );
  const today = useToday();
  const status = useStatus();
  const isEmpty = !loading && totals.confirmed === 0 && totals.toReview === 0;

  // Reels the team analysed (kept in this browser by Trend Radar's "Analyse a Reel link")
  const storedReels = useStored("sorted.reelAnalyses");
  const reels = useMemo<ReelAnalysis[]>(() => {
    try {
      const parsed = JSON.parse(storedReels || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [storedReels]);
  const feed = buildFeed(clients, memories, reels);
  const latestReel = reels[0];
  const reelClient = clients.find((c) => c.key === latestReel?.matches[0]?.clientKey);
  const attention = (c: ClientProfile) => {
    const s = summarize(memories[c.key]);
    return s.conflicts + s.toReview;
  };

  return (
    <Page>
      {/* Hero: the brand line, today's numbers, and clients as Stories */}
      <section className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-2 text-[13px] text-muted">
              {today && <span>{today}</span>}
              <AiTag>Sorted is watching your clients</AiTag>
            </p>
            <h1 className="font-display text-[42px] font-extrabold leading-[0.98] tracking-tight sm:text-[64px]">
              Less chasing.
              <br />
              <span className="text-accent-deep">More creating.</span>
            </h1>
          </div>
          <dl className="flex gap-6 sm:gap-8">
            <Stat label="Conflicts" value={totals.conflicts} loading={loading} hot={totals.conflicts > 0} />
            <Stat label="To review" value={totals.toReview} loading={loading} />
            <Stat label="Known details" value={totals.confirmed} loading={loading} />
            <Stat label="Clients" value={clients.length} loading={false} />
          </dl>
        </div>
        <div className="mt-6 border-y border-line py-4">
          <Stories clients={clients} attention={attention} />
        </div>
      </section>

      {/* First visit: offer demo data so the app can be tried in one click */}
      {isEmpty && status && !status.github && (
        <section className="landing-pop mb-8 flex flex-col gap-4 rounded-2xl border border-accent/40 bg-sage p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="font-display text-[18px] font-bold">New here? Try Sorted with demo data</p>
            <p className="mt-1 text-[14px] text-ink/80">
              Loads three made-up clients (Spice Route, Bloom Bakery, Ivy &amp; Thread) with confirmed brand memory, real
              Instagram trend scans and content reviews, so you can click around right away. Saved in this browser only.
            </p>
          </div>
          <Button
            onClick={() => {
              loadDemoData();
              window.location.reload();
            }}
          >
            Load demo data
          </Button>
        </section>
      )}

      <Workflow reel={latestReel} client={reelClient} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Needs you (Today's focus): first on phones, a side column on desktop */}
        <aside className="lg:order-2 lg:sticky lg:top-6 lg:self-start">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-display text-[19px] font-bold tracking-tight">Needs you</h2>
            <span className="text-[12px] text-muted">{loading ? "" : focus.length ? `${focus.length} today` : "all clear"}</span>
          </div>
          {loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : focus.length === 0 ? (
            <p className="rounded-2xl border border-line bg-card p-4 text-[14px]">
              <span className="font-display font-bold">All sorted.</span> <span className="text-muted">No conflicts and nothing to review.</span>
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
              {focus.slice(0, 8).map((f, i) => (
                <li key={i}>
                  <Link href={`/clients/${f.client.slug}`} className="group flex items-start gap-3 px-4 py-3 transition hover:bg-soft/60">
                    <ClientAvatar client={f.client} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[12px] text-muted">
                        {f.kind === "conflict" && <TriangleAlert size={12} className="text-alert-ink" />}
                        {f.client.name}
                      </span>
                      <span className="block truncate text-[14px] font-semibold leading-snug">{f.title}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-accent-deep">
                        {f.action} <ArrowRight size={12} className="transition group-hover:translate-x-0.5" />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </aside>

        {/* The feed: real ideas, Reels, reviews, conflicts and live messages */}
        <section className="min-w-0 lg:order-1" aria-label="Feed">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-display text-[19px] font-bold tracking-tight">Your feed, but it works for you</h2>
            <span className="hidden text-[12px] text-muted sm:inline">Tap &ldquo;Why this?&rdquo; to see the AI&apos;s reasoning</span>
          </div>
          {loading ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
              <Skeleton className="h-72" />
              <Skeleton className="h-56" />
            </div>
          ) : feed.length === 0 ? (
            <>
              <p className="mb-3 text-[14px] text-muted">Nothing in the feed yet. Start anywhere: it fills up as Sorted learns your clients.</p>
              <StartTiles />
            </>
          ) : (
            <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
              {feed.map((item, i) => (
                <FeedTile key={`${item.kind}-${i}`} item={item} i={i} />
              ))}
            </div>
          )}
        </section>
      </div>
    </Page>
  );
}

function Stat({ label, value, loading, hot }: { label: string; value: number; loading: boolean; hot?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className={`font-display text-[30px] font-bold leading-tight tabular-nums ${hot ? "text-alert-ink" : ""}`}>{loading ? "–" : value}</dd>
    </div>
  );
}

// Today's date, worked out in the browser (the server can't know the viewer's day).
function useToday() {
  return useSyncExternalStore(
    () => () => {},
    () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
    () => "",
  );
}
