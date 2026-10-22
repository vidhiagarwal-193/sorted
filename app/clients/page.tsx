"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Plus, Search } from "lucide-react";
import { Button, ClientAvatar, EmptyState, Page, PageHeader, Skeleton } from "@/components/ui";
import { useClients, type ClientProfile } from "@/lib/clients";
import { summarize, useAllMemories } from "@/lib/useAllMemories";

export default function ClientsPage() {
  const router = useRouter();
  const { clients, addClient } = useClients();
  const { memories, loading } = useAllMemories(clients.map((c) => c.key));
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");

  const q = query.trim().toLowerCase();
  const shown = clients.filter((c) => !q || `${c.name} ${c.category ?? ""}`.toLowerCase().includes(q));

  function add() {
    const profile = addClient(newName, newType);
    if (profile) router.push(`/clients/${profile.slug}`);
  }

  return (
    <Page>
      <PageHeader eyebrow={`${clients.length} brand${clients.length === 1 ? "" : "s"} on Instagram`} title="Clients">
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-card px-3 focus-within:border-ink sm:w-56 sm:flex-none">
            <Search size={16} className="text-muted" />
            <input
              className="min-w-0 flex-1 bg-transparent text-[14px] placeholder:text-muted focus:outline-none"
              placeholder="Search clients"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Button variant="dark" onClick={() => setAdding((a) => !a)}>
            <Plus size={16} /> New client
          </Button>
        </div>
      </PageHeader>

      {adding && (
        <form
          className="rise mb-6 flex flex-col gap-2 rounded-2xl border border-line bg-card p-4 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            autoFocus
            className="h-10 flex-1 rounded-lg border border-line bg-paper/50 px-3 text-[14px] focus:border-ink focus:bg-card focus:outline-none"
            placeholder="Business name, e.g. Glow Studio"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="h-10 rounded-lg border border-line bg-paper/50 px-3 text-[14px] focus:border-ink focus:bg-card focus:outline-none sm:w-56"
            placeholder="Business type, e.g. Boutique"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
          />
          <Button type="submit" disabled={!newName.trim()}>
            Add and open
          </Button>
        </form>
      )}

      {shown.length === 0 ? (
        <EmptyState title="No clients match that search" />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => (
            <ClientCard key={c.key} client={c} summary={summarize(memories[c.key])} loading={loading} />
          ))}
        </div>
      )}
    </Page>
  );
}

function ClientCard(props: { client: ClientProfile; summary: ReturnType<typeof summarize>; loading: boolean }) {
  const { client, summary } = props;
  const [main, accent] = client.colors;
  return (
    <Link
      href={`/clients/${client.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition duration-200 hover:-translate-y-0.5 hover:border-ink/30 hover:shadow-[0_10px_30px_-12px_rgba(48,44,40,0.25)]"
    >
      {/* Brand cover in the client's own colours */}
      <div className="relative h-28 overflow-hidden" style={{ background: main }}>
        <div className="absolute -right-6 -top-10 h-36 w-36 rounded-full opacity-90" style={{ background: accent }} />
        <div className="absolute -bottom-12 right-20 h-24 w-24 rounded-full opacity-40" style={{ background: accent }} />
        <span className="absolute left-4 top-3 font-display text-[44px] font-extrabold leading-none tracking-tight opacity-25" style={{ color: accent }}>
          {client.name.split(" ")[0]}
        </span>
        <ArrowUpRight
          size={18}
          className="absolute right-3 top-3 rounded-full bg-card p-0.5 text-ink opacity-0 transition group-hover:opacity-100"
        />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="relative z-10 -mt-12 mb-3">
          <span className="inline-block rounded-2xl bg-card p-1">
            <ClientAvatar client={client} size={52} />
          </span>
        </div>
        <h2 className="truncate font-display text-[21px] font-bold leading-tight tracking-tight">{client.name}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{client.category ?? "Client"}</p>
        {client.description ? (
          <p className="mt-3 line-clamp-2 text-[14px] leading-snug text-ink/80">{client.description}</p>
        ) : (
          summary.confirmed === 0 && <p className="mt-3 text-[14px] leading-snug text-muted">Add their chats or emails to build a brand memory.</p>
        )}
        {summary.offer && (
          <p className="mt-3 line-clamp-1 text-[13px]">
            <span className="font-semibold">Now: </span>
            {summary.offer}
          </p>
        )}

        <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
          {props.loading ? (
            <Skeleton className="h-6 w-40" />
          ) : (
            <>
              {summary.conflicts > 0 && (
                <Chip className="bg-alert-soft text-alert-ink">
                  {summary.conflicts} conflict{summary.conflicts === 1 ? "" : "s"}
                </Chip>
              )}
              {summary.toReview > 0 && <Chip className="bg-sage text-ink">{summary.toReview} to review</Chip>}
              {summary.confirmed > 0 ? (
                <Chip className="bg-soft text-ink">{summary.confirmed} details known</Chip>
              ) : (
                <Chip className="bg-soft text-muted">No brand memory yet</Chip>
              )}
              {summary.live && <Chip className="bg-ink text-sage">Live WhatsApp</Chip>}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${className}`}>{children}</span>;
}
