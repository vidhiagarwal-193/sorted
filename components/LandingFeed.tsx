"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Film, Link2, MessageCircle, Play, Radar, ScanSearch, Send, Sparkle, TriangleAlert, Users } from "lucide-react";
import type { ClientProfile } from "@/lib/clients";
import type { Alert, ClientMemory, InboundMessage, ReelAnalysis, ReviewRecord, TrendIdea } from "@/lib/types";
import { ClientAvatar } from "./ui";

// Landing page only: an Instagram-style discovery feed built from Sorted's real data.

const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

export type FeedItem =
  | { kind: "reel"; at: string; analysis: ReelAnalysis; client?: ClientProfile }
  | { kind: "idea"; at: string; idea: TrendIdea; client: ClientProfile; fromReel: boolean }
  | { kind: "review"; at: string; review: ReviewRecord; client: ClientProfile }
  | { kind: "alert"; at: string; alert: Alert; client: ClientProfile }
  | { kind: "message"; at: string; message: InboundMessage; client: ClientProfile };

// Newest first, everything real: reels the team analysed, trend ideas, reviews, conflicts, live messages.
export function buildFeed(clients: ClientProfile[], memories: Record<string, ClientMemory>, reels: ReelAnalysis[]): FeedItem[] {
  const items: FeedItem[] = [];
  for (const a of reels.slice(0, 4)) items.push({ kind: "reel", at: a.createdAt, analysis: a, client: clients.find((c) => c.key === a.matches[0]?.clientKey) });
  for (const client of clients) {
    const m = memories[client.key];
    if (!m) continue;
    for (const t of (m.trends ?? []).slice(-2)) {
      for (const idea of t.ideas.filter((i) => i.status !== "dismissed").slice(0, 3)) {
        items.push({ kind: "idea", at: t.createdAt, idea, client, fromReel: t.source === "reel" });
      }
    }
    const latest = new Map<string, ReviewRecord>();
    for (const r of m.reviews ?? []) latest.set(r.creativeId, r);
    for (const r of latest.values()) items.push({ kind: "review", at: r.createdAt, review: r, client });
    for (const a of (m.alerts ?? []).filter((x) => !x.dismissed).slice(-2)) items.push({ kind: "alert", at: m.updatedAt || "", alert: a, client });
    for (const msg of (m.messages ?? []).filter((x) => x.channel === "telegram" && x.status !== "skipped").slice(-2)) {
      items.push({ kind: "message", at: msg.sentAt, message: msg, client });
    }
  }
  return items.sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 18);
}

// ---- Tiles ----

function Cover({ src, client, text }: { src?: string; client?: ClientProfile; text: string }) {
  const [ok, setOk] = useState(Boolean(src));
  if (ok && src) {
    // eslint-disable-next-line @next/next/no-img-element -- Instagram cover image; may expire, falls back below
    return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setOk(false)} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />;
  }
  // A typographic "text post" in the client's own colours when there's no image
  const [bg, fg] = client?.colors ?? ["#302C28", "#E9E9E0"];
  return (
    <div className="flex h-full w-full items-end p-4" style={{ background: bg, color: client?.monogramText ?? fg }}>
      <p className="line-clamp-5 font-display text-[19px] font-bold leading-[1.15]">{text}</p>
    </div>
  );
}

function PostHeader({ client, label, at }: { client: ClientProfile; label: string; at: string }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <ClientAvatar client={client} size={28} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13px] font-semibold">{client.name}</span>
        <span className="block truncate text-[11px] text-muted">{label}</span>
      </span>
      {at && <span className="text-[11px] text-muted">{ago(at)}</span>}
    </div>
  );
}

function WhyToggle({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-deep hover:text-ink"
        aria-expanded={open}
      >
        <Sparkle size={12} /> {open ? "Hide reasoning" : "Why this?"}
      </button>
      {open && <p className="landing-pop mt-1.5 text-[12.5px] leading-snug text-ink/80">{text}</p>}
    </>
  );
}

const tile = "group block overflow-hidden rounded-2xl border border-line bg-card transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_-18px_rgba(48,44,40,0.35)]";

export function FeedTile({ item, i }: { item: FeedItem; i: number }) {
  const style = { animationDelay: `${Math.min(i, 10) * 45}ms` };

  if (item.kind === "reel") {
    const a = item.analysis;
    const top = a.matches[0];
    return (
      <div className={`${tile} landing-pop mb-4 break-inside-avoid`} style={style}>
        <Link href="/trends#reel" className="block">
        <div className="relative aspect-[4/5] overflow-hidden bg-soft">
          <Cover src={a.source.thumbnail} client={item.client} text={a.reel.hook} />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 text-[11px] font-semibold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]">
            <span className="inline-flex items-center gap-1">
              <Film size={13} /> {a.source.owner ? `@${a.source.owner}` : "Your Reel"}
            </span>
            {a.source.plays > 0 && (
              <span className="inline-flex items-center gap-1">
                <Play size={12} fill="currentColor" /> {compact(a.source.plays)}
              </span>
            )}
          </div>
          {top && (
            <div className="absolute inset-x-3 bottom-3 rounded-xl bg-card/95 p-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Best for</p>
              <p className="flex items-center gap-2 text-[14px] font-semibold">
                {item.client && <ClientAvatar client={item.client} size={20} />}
                {top.clientName}
                <span className="ml-auto rounded-md bg-ink px-1.5 py-0.5 text-[11px] text-paper">{top.score}</span>
              </p>
            </div>
          )}
        </div>
        <p className="line-clamp-2 px-3 pt-2.5 text-[13px]">{a.reel.summary}</p>
        </Link>
        <div className="px-3 pb-2.5 pt-1.5">
          <WhyToggle text={top ? top.why : a.reel.whyItWorks} />
        </div>
      </div>
    );
  }

  if (item.kind === "idea") {
    const { idea, client } = item;
    const img = idea.proof.find((p) => p.thumbnail)?.thumbnail;
    return (
      <div className={`${tile} landing-pop mb-4 break-inside-avoid`} style={style}>
        <Link href={`/clients/${client.slug}?tab=trends`} className="block">
        <PostHeader client={client} label={`${item.fromReel ? "From a shared Reel" : "Trend idea"} · ${idea.format}`} at={item.at} />
        <div className="relative aspect-square overflow-hidden bg-soft">
          <Cover src={img} client={client} text={idea.hook} />
          {img && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-3 pt-10">
              <p className="line-clamp-2 text-[13px] font-medium text-white">{idea.hook}</p>
            </div>
          )}
          {idea.status === "approved" && (
            <span className="absolute right-3 top-3 rounded-md bg-card/95 px-2 py-0.5 text-[11px] font-semibold text-ok">Approved</span>
          )}
        </div>
        <div className="px-3 pt-2.5">
          <p className="text-[14px] font-semibold leading-snug">{idea.title}</p>
          {idea.hashtags.length > 0 && <p className="mt-0.5 truncate text-[12px] text-muted">#{idea.hashtags.slice(0, 4).join(" #")}</p>}
        </div>
        </Link>
        <div className="px-3 pb-2.5 pt-1.5">
          <WhyToggle text={idea.whyItFits} />
        </div>
      </div>
    );
  }

  if (item.kind === "review") {
    const { review: r, client } = item;
    const tone =
      r.result.verdict === "good_to_go" ? "bg-sage" : r.result.verdict === "needs_revision" ? "bg-alert-soft" : "bg-[#F5EFE4]";
    const label = { good_to_go: "Good to Go", minor_changes: "Minor changes", needs_revision: "Needs revision", needs_verification: "Check with client" }[r.result.verdict];
    return (
      <Link href={`/clients/${client.slug}?tab=review`} className={`${tile} landing-pop mb-4 break-inside-avoid`} style={style}>
        <PostHeader client={client} label={`Content review · v${r.version}`} at={r.createdAt} />
        <div className={`px-4 py-5 ${tone}`}>
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <ScanSearch size={12} /> Checked against {r.memoryUsed.confirmed} details
          </p>
          <p className="mt-1 font-display text-[24px] font-bold leading-tight">{label}</p>
          <p className="mt-1 line-clamp-3 text-[13px] text-ink/80">{r.result.headline}</p>
        </div>
        <div className="flex items-center justify-between px-3 py-2.5 text-[12px] text-muted">
          <span className="truncate">{r.creative.files.join(", ")}</span>
          <span className="shrink-0">{r.result.findings.length} findings</span>
        </div>
      </Link>
    );
  }

  if (item.kind === "alert") {
    const { alert: a, client } = item;
    return (
      <Link href={`/clients/${client.slug}`} className={`${tile} landing-pop mb-4 break-inside-avoid border-alert/30`} style={style}>
        <PostHeader client={client} label="Conflict caught" at="" />
        <div className="px-4 pb-4">
          <p className="rounded-2xl rounded-tl-md bg-soft px-3 py-2 text-[14px]">{a.message}</p>
          <p className="mt-2 flex items-start gap-1.5 text-[13px] text-alert-ink">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" /> {a.reason}
          </p>
          {a.alternative && <p className="mt-1.5 text-[12.5px] text-ink/80"><span className="font-semibold">Try instead:</span> {a.alternative}</p>}
        </div>
      </Link>
    );
  }

  const { message: m, client } = item;
  return (
    <Link href={`/clients/${client.slug}?tab=memory`} className={`${tile} landing-pop mb-4 break-inside-avoid`} style={style}>
      <PostHeader client={client} label="Live from Telegram" at={m.sentAt} />
      <div className="px-4 pb-4">
        <p className="text-[11px] text-muted">{m.sender}</p>
        <p className="mt-0.5 line-clamp-4 rounded-2xl rounded-tl-md bg-sage px-3 py-2 text-[14px]">{m.text}</p>
        <p className={`mt-2 inline-flex items-center gap-1.5 text-[12px] ${m.status === "failed" ? "text-alert-ink" : "text-muted"}`}>
          <Send size={12} /> {m.note}
        </p>
      </div>
    </Link>
  );
}

// ---- "How Sorted thinks": the workflow, alive ----

const STEPS = [
  { title: "Spot a Reel", copy: "Paste any link you love", href: "/trends#reel", icon: Link2 },
  { title: "Match a client", copy: "Who it really suits, and why", href: "/trends#reel", icon: Users },
  { title: "Adapt it", copy: "Hook, shots and caption, on brand", href: "/trends", icon: Radar },
  { title: "Check it", copy: "Against what the client said", href: "/review", icon: ScanSearch },
  { title: "Keep it sorted", copy: "Memory that never forgets", href: "/clients", icon: MessageCircle },
] as const;

export function Workflow({ reel, client }: { reel?: ReelAnalysis; client?: ClientProfile }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 2200);
    return () => clearInterval(t);
  }, []);
  const top = reel?.matches[0];
  // Real details from the latest Reel the team analysed, where there is one
  const detail = [
    reel?.source.owner ? `@${reel.source.owner}` : "",
    top ? `${top.clientName} · ${top.score}` : "",
    top?.adaptation?.title ?? "",
    "",
    "",
  ];

  return (
    <section aria-label="How Sorted thinks" className="mb-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[19px] font-bold tracking-tight">Saw it. Matched it. Sorted.</h2>
        <span className="hidden text-[12px] text-muted sm:inline">How Sorted thinks</span>
      </div>
      <ol className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0 sm:pb-0">
        {STEPS.map((s, i) => {
          const on = i === active;
          const done = i < active;
          return (
            <li key={s.title} className="w-[220px] shrink-0 snap-start sm:w-auto">
              <Link
                href={s.href}
                onMouseEnter={() => setActive(i)}
                className={`relative flex h-full items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 transition duration-500 sm:flex-col sm:items-start sm:gap-2 sm:py-4 ${
                  on ? "border-ink bg-ink text-paper" : done ? "border-line bg-sage" : "border-line bg-card hover:border-ink/30"
                }`}
              >
                {on && <span className="landing-scan pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent via-white/10 to-transparent" aria-hidden="true" />}
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${on ? "bg-accent text-card" : "bg-paper text-ink"}`}>
                  <s.icon size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider opacity-60">Step {i + 1}</span>
                  <span className="block font-display text-[15px] font-bold leading-tight">{s.title}</span>
                  <span className={`block text-[12px] ${on ? "text-paper/70" : "text-muted"}`}>{detail[i] || s.copy}</span>
                </span>
                {i === 1 && on && client && (
                  <span className="ml-auto sm:absolute sm:right-3 sm:top-3">
                    <ClientAvatar client={client} size={26} />
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---- Clients as Stories ----

export function Stories({ clients, attention }: { clients: ClientProfile[]; attention: (c: ClientProfile) => number }) {
  return (
    <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Clients">
      {clients.map((c) => {
        const n = attention(c);
        return (
          <Link key={c.key} href={`/clients/${c.slug}`} className="group flex w-[72px] shrink-0 flex-col items-center gap-1.5 text-center">
            <span className={`rounded-full p-[3px] transition group-hover:scale-105 ${n ? "landing-ring bg-accent" : "bg-line"}`}>
              <span className="block rounded-full bg-paper p-[2px]">
                <span className="block overflow-hidden rounded-full">
                  <ClientAvatar client={c} size={54} />
                </span>
              </span>
            </span>
            <span className="w-full truncate text-[11.5px] font-medium">{c.name}</span>
            <span className="-mt-1 h-3 text-[10px] text-muted">{n ? `${n} new` : ""}</span>
          </Link>
        );
      })}
      <Link href="/clients" className="group flex w-[72px] shrink-0 flex-col items-center gap-1.5 text-center">
        <span className="rounded-full border border-dashed border-muted/60 p-[3px] transition group-hover:scale-105">
          <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full text-[22px] text-muted">+</span>
        </span>
        <span className="text-[11.5px] font-medium text-muted">New client</span>
      </Link>
    </div>
  );
}

// ---- When there's nothing yet: where to start, no fake content ----

const STARTS = [
  { title: "Paste a Reel you love", copy: "See which client it suits and how to adapt it.", href: "/trends#reel", icon: Link2 },
  { title: "Teach Sorted a client", copy: "Add their chat or email; confirm what matters.", href: "/clients", icon: Users },
  { title: "Check a creative", copy: "Catch what the client would object to first.", href: "/review", icon: ScanSearch },
  { title: "Connect Telegram", copy: "Live client messages become memory.", href: "/settings", icon: Send },
] as const;

export function StartTiles() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
      {STARTS.map((s, i) => (
        <Link key={s.title} href={s.href} className={`${tile} landing-pop flex items-start gap-3 p-4`} style={{ animationDelay: `${i * 60}ms` }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sage">
            <s.icon size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[16px] font-bold">{s.title}</span>
            <span className="block text-[13px] text-muted">{s.copy}</span>
          </span>
          <ArrowUpRight size={15} className="shrink-0 text-muted transition group-hover:text-ink" />
        </Link>
      ))}
    </div>
  );
}

