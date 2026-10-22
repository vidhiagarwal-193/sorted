"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowRight, ScanSearch, TriangleAlert } from "lucide-react";
import { VERDICT } from "@/components/ReviewResults";
import { AiTag, Card, ClientAvatar, Page, SectionTitle, Skeleton } from "@/components/ui";
import { useClients, type ClientProfile } from "@/lib/clients";
import { summarize, useAllMemories } from "@/lib/useAllMemories";
import type { ClientMemory, ReviewRecord } from "@/lib/types";

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

  return (
    <Page>
      {/* Welcome */}
      <section className="relative mb-8 overflow-hidden rounded-3xl bg-ink px-6 py-8 text-paper sm:px-10 sm:py-10">
        <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-accent" aria-hidden="true" />
        <svg className="absolute right-10 top-8 hidden sm:block" width="72" height="72" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M8.5 16.5l5 5L24 10" fill="none" stroke="#F7F5F0" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="relative text-[13px] text-paper/60">{today}</p>
        <h1 className="relative mt-2 max-w-xl font-display text-[38px] font-extrabold leading-[1.02] tracking-tight sm:text-[54px]">
          Let&apos;s get things sorted.
        </h1>
        <p className="relative mt-3 max-w-md text-[15px] text-paper/70">
          Your clients, today&apos;s opportunities, and everything that needs your attention.
        </p>
        <dl className="relative mt-8 flex flex-wrap gap-x-10 gap-y-4">
          <Stat label="Open conflicts" value={totals.conflicts} loading={loading} hot={totals.conflicts > 0} />
          <Stat label="Details to review" value={totals.toReview} loading={loading} />
          <Stat label="Details confirmed" value={totals.confirmed} loading={loading} />
          <Stat label="Clients" value={clients.length} loading={false} />
        </dl>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[1.6fr_1fr]">
        {/* Today's focus */}
        <section className="min-w-0">
          <SectionTitle aside={loading ? "" : `${focus.length} item${focus.length === 1 ? "" : "s"}`}>Today&apos;s focus</SectionTitle>
          {loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : focus.length === 0 ? (
            <Card className="p-6">
              <p className="font-display text-[17px] font-bold">All sorted.</p>
              <p className="mt-1 text-[14px] text-muted">No conflicts and nothing waiting for review.</p>
            </Card>
          ) : (
            <ol className="flex flex-col gap-3">
              {focus.map((f, i) => (
                <li key={i} className="rise" style={{ animationDelay: `${i * 40}ms` }}>
                  <Link
                    href={`/clients/${f.client.slug}`}
                    className={`group flex items-start gap-4 rounded-2xl border bg-card p-4 transition hover:border-ink/30 hover:shadow-[0_8px_24px_-14px_rgba(48,44,40,0.3)] sm:p-5 ${
                      f.kind === "conflict" ? "border-alert/30" : "border-line"
                    }`}
                  >
                    <ClientAvatar client={f.client} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold">{f.client.name}</span>
                        {f.kind === "conflict" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-alert-soft px-2 py-0.5 text-[11px] font-semibold text-alert-ink">
                            <TriangleAlert size={11} /> Conflict
                          </span>
                        )}
                        {f.kind === "review" && <AiTag>Found by AI</AiTag>}
                        {f.kind === "creative" && <AiTag>Content review</AiTag>}
                      </div>
                      <p className="truncate font-display text-[17px] font-bold leading-snug">{f.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{f.detail}</p>
                    </div>
                    <span className="hidden shrink-0 items-center gap-1 self-center text-[13px] font-semibold sm:flex">
                      {f.action} <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Latest content reviews across all clients */}
        <section>
          <SectionTitle>Recent reviews</SectionTitle>
          {(() => {
            const recent = clients
              .flatMap((client) => latestPerCreative(memories[client.key]?.reviews).map((r) => ({ client, r })))
              .sort((a, b) => b.r.createdAt.localeCompare(a.r.createdAt))
              .slice(0, 5);
            if (loading) return <Skeleton className="h-40" />;
            if (recent.length === 0) {
              return (
                <Card className="p-6">
                  <ScanSearch size={22} className="text-muted" />
                  <p className="mt-3 font-display text-[17px] font-bold">No content reviewed yet</p>
                  <p className="mt-1 text-[14px] text-muted">
                    Before a post, carousel or Reel goes to a client, check it against everything Sorted knows about them.
                  </p>
                  <Link href="/review" className="mt-4 inline-flex text-[13px] font-semibold underline decoration-accent decoration-2 underline-offset-4">
                    Review a creative
                  </Link>
                </Card>
              );
            }
            return (
              <Card className="divide-y divide-line">
                {recent.map(({ client, r }) => (
                  <Link key={r.id} href={`/clients/${client.slug}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-soft/60">
                    <ClientAvatar client={client} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{r.creative.files.join(", ")}</span>
                      <span className="flex items-center gap-1.5 text-[12px] text-muted">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${VERDICT[r.result.verdict].dot}`} />
                        {VERDICT[r.result.verdict].label} · v{r.version} · {client.name}
                      </span>
                    </span>
                  </Link>
                ))}
              </Card>
            );
          })()}
        </section>
      </div>
    </Page>
  );
}

function Stat({ label, value, loading, hot }: { label: string; value: number; loading: boolean; hot?: boolean }) {
  return (
    <div>
      <dt className="text-[12px] text-paper/55">{label}</dt>
      <dd className={`font-display text-[30px] font-bold leading-tight ${hot ? "text-accent" : ""}`}>{loading ? "–" : value}</dd>
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
