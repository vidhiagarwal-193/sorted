"use client";

import { Check, X } from "lucide-react";
import { ITEM_TYPES, TYPE_LABELS, type ItemType, type MemoryItem, type MemoryOp } from "@/lib/types";
import { AiTag, EmptyState, Skeleton } from "./ui";

const TYPE_HINT: Record<ItemType, string> = {
  preference: "How they like their Instagram",
  dont: "Never do this",
  offer: "Feature this in posts",
  decision: "Agreed and final",
  fact: "Contact details, prices, hours",
};

function Meta({ it }: { it: MemoryItem }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
      <span>{it.source}</span>
      <span>·</span>
      <span>{it.date || "no date"}</span>
      {it.source === "WhatsApp (live)" && (
        <span className="rounded-full bg-ink px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-sage">Live</span>
      )}
    </p>
  );
}

// Items the AI pulled out, waiting for a human to confirm them.
export function ReviewQueue({ items, onChange }: { items: MemoryItem[]; onChange: (op: MemoryOp, note: string) => void }) {
  const pending = items.filter((it) => !it.confirmed);
  if (pending.length === 0) return null;
  return (
    <section className="rise mb-8 rounded-2xl border border-ink bg-ink p-4 text-paper sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AiTag>Found by AI</AiTag>
          <h2 className="font-display text-[19px] font-bold">
            {pending.length} new detail{pending.length === 1 ? "" : "s"} to review
          </h2>
        </div>
        <p className="text-[12px] text-paper/60">Nothing counts until you confirm it.</p>
      </div>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-2">
        {pending.map((it) => (
          <li key={it.id} className="rise flex flex-col rounded-xl bg-paper/[0.06] p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-sage">{TYPE_LABELS[it.type]}</p>
            <p className="mt-1 text-[15px] font-medium">{it.text}</p>
            <p className="mt-1 text-[13px] italic text-paper/70">&ldquo;{it.quote}&rdquo;</p>
            <p className="mt-2 text-[12px] text-paper/50">
              {it.source} · {it.date || "no date"}
            </p>
            <div className="mt-auto flex items-center justify-end gap-1.5 pt-3">
              <span className="flex gap-1.5">
                <button
                  onClick={() => onChange({ op: "discard", id: it.id }, it.text)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-[13px] text-paper/70 hover:bg-paper/10 hover:text-paper"
                >
                  <X size={14} /> Discard
                </button>
                <button
                  onClick={() => onChange({ op: "confirm", id: it.id }, it.text)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-accent px-3 text-[13px] font-semibold text-card hover:bg-accent-deep active:scale-[0.98]"
                >
                  <Check size={14} /> Confirm
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Confirmed brand knowledge, grouped like a style guide.
export function MemoryGrid({ items, loading, clientName }: { items: MemoryItem[]; loading: boolean; clientName: string }) {
  const confirmed = items.filter((it) => it.confirmed);
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }
  if (confirmed.length === 0) {
    return (
      <EmptyState title={`Nothing confirmed for ${clientName} yet`}>
        Add their WhatsApp chat or an email, then confirm what the AI finds. Confirmed details are what Sorted uses to
        check new requests.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {ITEM_TYPES.map((type) => {
        const group = confirmed.filter((it) => it.type === type);
        return (
          <section key={type} className={`rounded-2xl border border-line bg-card p-5 ${type === "dont" ? "md:row-span-1" : ""}`}>
            <div className="mb-3 flex flex-col gap-0.5 border-b border-line pb-3">
              <h3 className="font-display text-[17px] font-bold">{TYPE_LABELS[type]}</h3>
              <span className="text-[12px] text-muted">{TYPE_HINT[type]}</span>
            </div>
            {group.length === 0 ? (
              <p className="text-[13px] text-muted">Nothing here yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {group.map((it) => (
                  <li key={it.id} className="rise py-3 first:pt-0 last:pb-0">
                    <p className="flex items-start gap-2 text-[14px] font-medium">
                      <Check size={15} className={`mt-0.5 shrink-0 ${type === "dont" ? "text-alert-ink" : "text-ok"}`} />
                      {it.text}
                    </p>
                    <p className="ml-[23px] mt-1 text-[13px] italic text-muted">&ldquo;{it.quote}&rdquo;</p>
                    <div className="ml-[23px]">
                      <Meta it={it} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
