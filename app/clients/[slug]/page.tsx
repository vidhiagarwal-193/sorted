"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";
import { AddMessages } from "@/components/AddMessages";
import { MemoryGrid, ReviewQueue } from "@/components/BrandMemory";
import { ConflictBox } from "@/components/ConflictBox";
import { ContentReview } from "@/components/ContentReview";
import { RequestCheck } from "@/components/RequestCheck";
import { TelegramActivity } from "@/components/TelegramPanels";
import { TrendRadar } from "@/components/TrendRadar";
import { AiTag, Card, ClientAvatar, EmptyState, Page, SaveBadge, SectionTitle, Skeleton } from "@/components/ui";
import { useClients, type ClientProfile } from "@/lib/clients";
import { useClientMemory } from "@/lib/useClientMemory";
import { useStatus } from "@/lib/useStatus";
import type { MemoryItem } from "@/lib/types";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "memory", label: "Brand Memory" },
  { id: "review", label: "Content Review" },
  { id: "trends", label: "Trend Radar" },
  { id: "studio", label: "Content Studio", soon: true },
  { id: "calendar", label: "Calendar", soon: true },
  { id: "tasks", label: "Tasks & Approvals", soon: true },
  { id: "insights", label: "Insights", soon: true },
] as const;
type TabId = "overview" | "memory" | "review" | "trends";

export default function ClientWorkspacePage() {
  return (
    <Suspense
      fallback={
        <Page>
          <Skeleton className="h-40" />
        </Page>
      }
    >
      <ClientWorkspace />
    </Suspense>
  );
}

function ClientWorkspace() {
  const { slug } = useParams<{ slug: string }>();
  const { clients, ready } = useClients();
  const client = clients.find((c) => c.slug === slug);

  if (!client && !ready) {
    return (
      <Page>
        <Skeleton className="h-40" />
      </Page>
    );
  }
  if (!client) {
    return (
      <Page>
        <EmptyState title="Client not found" href="/clients" action="Back to all clients">
          This client may have been added in another browser.
        </EmptyState>
      </Page>
    );
  }
  return <Workspace key={client.key} client={client} />;
}

function Workspace({ client }: { client: ClientProfile }) {
  const asked = useSearchParams().get("tab");
  const [tab, setTab] = useState<TabId>(asked === "trends" || asked === "review" || asked === "memory" ? asked : "overview");
  const { memory, loading, loadError, saveStatus, change } = useClientMemory(client.key);
  const status = useStatus();
  const items = memory.items;
  const pending = items.filter((it) => !it.confirmed && !it.supersededBy).length;
  const alerts = (memory.alerts ?? []).filter((a) => !a.dismissed).reverse();

  return (
    <Page>
      <nav className="mb-5 text-[13px] text-muted" aria-label="Breadcrumb">
        <Link href="/clients" className="hover:text-ink">
          Clients
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{client.name}</span>
      </nav>

      {/* Brand header */}
      <header className="mb-6 overflow-hidden rounded-2xl border border-line bg-card">
        <div className="h-2.5" style={{ background: `linear-gradient(90deg, ${client.colors[0]} 0 65%, ${client.colors[1]} 65%)` }} />
        <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
          <ClientAvatar client={client} size={64} />
          <div className="min-w-0 flex-1 basis-40">
            <h1 className="truncate font-display text-[30px] font-bold leading-tight tracking-tight sm:text-[36px]">
              {client.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[14px] text-muted">
              {client.category && <span>{client.category}</span>}
              {client.contact && (
                <>
                  <span>·</span>
                  <span>Contact: {client.contact}</span>
                </>
              )}
              <span>·</span>
              <span>Instagram</span>
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3 sm:w-auto sm:flex-col sm:items-end sm:border-0 sm:pt-0">
            <SaveBadge status={saveStatus} />
            <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${status?.telegram || status?.whatsapp ? "bg-ok" : "bg-muted/50"}`} />
              {status?.telegram ? "Telegram set up" : status?.whatsapp ? "Live WhatsApp on" : "No live chat connected"}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-t border-line px-3 sm:px-4" role="tablist">
          {TABS.map((t, i) =>
            "soon" in t ? (
              <span key={t.id} className="flex shrink-0 items-center">
                {!("soon" in TABS[i - 1]) && (
                  <span
                    className="ml-2 mr-1 flex items-center gap-2 border-l border-line pl-3 text-[10px] font-semibold uppercase tracking-wider text-muted"
                    title={`Coming soon: ${TABS.filter((x) => "soon" in x).map((x) => x.label).join(", ")}`}
                  >
                    Soon
                    {/* On narrower screens the names don't fit, so just say how many are coming */}
                    <span className="hidden font-normal normal-case tracking-normal text-muted/70 sm:inline xl:hidden">
                      {TABS.filter((x) => "soon" in x).length} more tabs
                    </span>
                  </span>
                )}
                <span
                  className="hidden cursor-not-allowed px-2.5 py-3 text-[13px] text-muted/60 xl:inline"
                  title={`${t.label}: coming soon`}
                  aria-disabled="true"
                >
                  {t.label}
                </span>
              </span>
            ) : (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`relative shrink-0 px-3 py-3 text-[14px] transition-colors ${
                  tab === t.id ? "font-semibold text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {t.label}
                {t.id === "memory" && pending > 0 && (
                  <span className="ml-1.5 rounded-full bg-sage px-1.5 text-[11px] font-semibold text-ink">{pending}</span>
                )}
                {tab === t.id && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-ink" />}
              </button>
            ),
          )}
        </div>
      </header>

      {loadError && <p className="mb-4 rounded-lg bg-alert-soft px-3 py-2.5 text-[13px] text-alert-ink">{loadError}</p>}

      {tab === "trends" ? (
        <div key="trends" className="rise">
          <TrendRadar client={client} memory={memory} onChange={change} onReview={() => setTab("review")} />
        </div>
      ) : tab === "review" ? (
        <div key="review" className="rise">
          <ContentReview client={client} memory={memory} onChange={change} />
        </div>
      ) : tab === "overview" ? (
        <div key="overview" className="rise grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="flex min-w-0 flex-col gap-6">
            {alerts.length > 0 && (
              <section>
                <SectionTitle aside={`${alerts.length} open`}>
                  <span className="inline-flex items-center gap-2">
                    <MessageCircle size={18} /> From WhatsApp
                  </span>
                </SectionTitle>
                <div className="flex flex-col gap-3">
                  {alerts.map((a) => (
                    <ConflictBox
                      key={a.id}
                      clientName={client.name}
                      request={a.message}
                      label={`${a.from} on WhatsApp · ${a.date}`}
                      reason={a.reason}
                      items={items.filter((it) => a.conflictsWith.includes(it.id))}
                      alternative={a.alternative}
                      onDismiss={() => change({ op: "dismissAlert", id: a.id }, a.message.slice(0, 50))}
                    />
                  ))}
                </div>
              </section>
            )}
            <RequestCheck clientKey={client.key} clientName={client.name} items={items} />
            {pending > 0 && (
              <button
                onClick={() => setTab("memory")}
                className="group flex items-center justify-between gap-3 rounded-2xl bg-ink px-5 py-4 text-left text-paper transition hover:bg-ink/90"
              >
                <span className="flex items-center gap-3">
                  <AiTag>Found by AI</AiTag>
                  <span className="text-[15px] font-medium">
                    {pending} new detail{pending === 1 ? "" : "s"} waiting for your review
                  </span>
                </span>
                <ArrowRight size={18} className="transition group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
          <AtAGlance items={items} loading={loading} client={client} onOpenMemory={() => setTab("memory")} />
        </div>
      ) : (
        <div key="memory" className="rise grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <ReviewQueue items={items} onChange={change} />
            <MemoryGrid items={items} loading={loading} clientName={client.name} />
          </div>
          <div className="lg:sticky lg:top-6 lg:self-start">
            <AddMessages clientKey={client.key} onChange={change} />
            <TelegramActivity client={client} memory={memory} />
          </div>
        </div>
      )}
    </Page>
  );
}

// The most useful confirmed details, so the team can brief a post in seconds.
function AtAGlance(props: { items: MemoryItem[]; loading: boolean; client: ClientProfile; onOpenMemory: () => void }) {
  const confirmed = props.items.filter((it) => it.confirmed);
  const offers = confirmed.filter((it) => it.type === "offer");
  const donts = confirmed.filter((it) => it.type === "dont");
  const decisions = confirmed.filter((it) => it.type === "decision");

  return (
    <Card className="self-start p-5">
      <SectionTitle aside={`${confirmed.length} confirmed`}>At a glance</SectionTitle>
      {props.loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : confirmed.length === 0 ? (
        <EmptyState title="No confirmed details yet">
          <button onClick={props.onOpenMemory} className="font-semibold text-ink underline decoration-accent decoration-2 underline-offset-4">
            Open Brand Memory
          </button>{" "}
          to add their chats.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          <Glance title="Feature now" items={offers} empty="No current offer" accent={props.client.colors[0]} />
          <Glance title="Never do" items={donts} empty="No don'ts yet" accent="#B87568" />
          <Glance title="Agreed" items={decisions.slice(-2)} empty="No decisions yet" accent="#302C28" />
          <button onClick={props.onOpenMemory} className="self-start text-[13px] font-semibold underline decoration-accent decoration-2 underline-offset-4">
            See all brand memory
          </button>
        </div>
      )}
    </Card>
  );
}

function Glance({ title, items, empty, accent }: { title: string; items: MemoryItem[]; empty: string; accent: string }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</p>
      {items.length === 0 ? (
        <p className="text-[13px] text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.id} className="border-l-[3px] pl-3 text-[14px] leading-snug" style={{ borderColor: accent }}>
              {it.text}
              <span className="block text-[12px] text-muted">{it.date || it.source}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
