"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ContentReview } from "@/components/ContentReview";
import { ClientAvatar, Page, PageHeader, SaveBadge, Skeleton } from "@/components/ui";
import { useClients, type ClientProfile } from "@/lib/clients";
import { summarize, useAllMemories } from "@/lib/useAllMemories";
import { useClientMemory } from "@/lib/useClientMemory";

// Step 1: pick the client. Step 2 onwards happens in <ContentReview>.
export default function ReviewPage() {
  const { clients, ready } = useClients();
  const { memories, loading } = useAllMemories(clients.map((c) => c.key));
  const [picked, setPicked] = useState<string | null>(null);
  const client = clients.find((c) => c.key === picked);

  if (client) return <ReviewFor client={client} onBack={() => setPicked(null)} />;

  return (
    <Page>
      <PageHeader eyebrow="Content Review" title="Is it ready for the client?" />
      <p className="-mt-4 mb-8 max-w-xl text-[15px] text-muted">
        Upload a post, carousel or Reel before it goes out. Sorted checks it against everything the team knows about that
        client and tells you exactly what to change.
      </p>
      <h2 className="mb-3 font-display text-[17px] font-bold">1. Choose the client</h2>
      {!ready ? (
        <Skeleton className="h-24" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => {
            const s = summarize(memories[c.key]);
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
                      {c.category ?? "Client"} · {loading ? "…" : `${s.confirmed} confirmed detail${s.confirmed === 1 ? "" : "s"}`}
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

function ReviewFor({ client, onBack }: { client: ClientProfile; onBack: () => void }) {
  const { memory, saveStatus, change } = useClientMemory(client.key);
  return (
    <Page>
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft size={14} /> Choose another client
      </button>
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <ClientAvatar client={client} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted">Content Review</p>
          <h1 className="truncate font-display text-[30px] font-bold leading-tight tracking-tight">{client.name}</h1>
        </div>
        <SaveBadge status={saveStatus} />
      </header>
      <ContentReview client={client} memory={memory} onChange={change} />
    </Page>
  );
}
