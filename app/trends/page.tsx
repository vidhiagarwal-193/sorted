"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ReelAnalyser } from "@/components/ReelAnalyser";
import { TrendRadar } from "@/components/TrendRadar";
import { ClientAvatar, Page, PageHeader, SaveBadge, Skeleton } from "@/components/ui";
import { useClients, type ClientProfile } from "@/lib/clients";
import { summarize, useAllMemories } from "@/lib/useAllMemories";
import { useClientMemory } from "@/lib/useClientMemory";

// Step 1: pick the client. Then the Trend Radar panel for them.
export default function TrendsPage() {
  const { clients, ready } = useClients();
  const { memories, loading } = useAllMemories(clients.map((c) => c.key));
  const [picked, setPicked] = useState<string | null>(null);
  const client = clients.find((c) => c.key === picked);

  if (client) return <TrendsFor client={client} onBack={() => setPicked(null)} />;

  return (
    <Page>
      <PageHeader eyebrow="Trend Radar" title="What should we post next?" />
      <p className="-mt-4 mb-8 max-w-xl text-[15px] text-muted">
        Sorted reads what&apos;s working on Instagram right now in each client&apos;s niche and suggests ideas that fit their
        brand, with real posts as proof.
      </p>
      {ready && <ReelAnalyser clients={clients} memories={memories} />}

      <h2 className="mb-3 font-display text-[17px] font-bold">Or scan trends for one client</h2>
      {!ready ? (
        <Skeleton className="h-24" />
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => {
            const s = summarize(memories[c.key]);
            const scans = memories[c.key]?.trends?.length ?? 0;
            return (
              <li key={c.key}>
                <button
                  onClick={() => setPicked(c.key)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-ink/30"
                >
                  <ClientAvatar client={c} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[17px] font-bold">{c.name}</span>
                    <span className="block text-[12px] text-muted">
                      {loading ? "…" : `${s.confirmed} confirmed detail${s.confirmed === 1 ? "" : "s"}${scans ? ` · ${scans} scan${scans === 1 ? "" : "s"}` : ""}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}

function TrendsFor({ client, onBack }: { client: ClientProfile; onBack: () => void }) {
  const router = useRouter();
  const { memory, saveStatus, change } = useClientMemory(client.key);
  return (
    <Page>
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft size={14} /> Choose another client
      </button>
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <ClientAvatar client={client} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted">Trend Radar</p>
          <h1 className="truncate font-display text-[30px] font-bold leading-tight tracking-tight">{client.name}</h1>
        </div>
        <SaveBadge status={saveStatus} />
      </header>
      <TrendRadar client={client} memory={memory} onChange={change} onReview={() => router.push(`/clients/${client.slug}`)} />
    </Page>
  );
}
