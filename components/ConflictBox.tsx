"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { MemoryItem } from "@/lib/types";
import { AiTag } from "./ui";

// The warning: the new request next to the client's own earlier words it clashes with.
export function ConflictBox(props: {
  clientName: string;
  request: string;
  label: string;
  reason: string;
  items: MemoryItem[];
  alternative?: string;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="rise overflow-hidden rounded-xl border border-alert/25 bg-card">
      <div className="flex items-start gap-3 bg-alert-soft px-4 py-3">
        <TriangleAlert size={18} className="mt-0.5 shrink-0 text-alert-ink" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-alert-ink">This may contradict what {props.clientName} said before</p>
          <p className="mt-0.5 text-[13px] text-ink/80">{props.reason}</p>
        </div>
        <AiTag>Flagged</AiTag>
      </div>
      <div className="grid gap-px bg-line sm:grid-cols-2">
        <div className="bg-card p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{props.label}</p>
          <p className="text-[14px]">{props.request}</p>
        </div>
        <div className="bg-card p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">They said before</p>
          {props.items.map((it) => (
            <div key={it.id} className="mb-2 last:mb-0">
              <button
                className="text-left font-display text-[15px] font-medium leading-snug underline decoration-alert/40 decoration-dotted underline-offset-4 hover:decoration-alert"
                onClick={() => setOpen(open === it.id ? null : it.id)}
                aria-expanded={open === it.id}
              >
                &ldquo;{it.quote}&rdquo;
              </button>
              <p className="mt-0.5 text-[12px] text-muted">
                {it.source} · {it.date || "no date"} · {open === it.id ? "hide" : "show"} original message
              </p>
              {open === it.id && (
                <p className="rise mt-2 rounded-lg bg-soft p-2.5 font-mono text-[12px] text-ink/80">{it.original}</p>
              )}
            </div>
          ))}
        </div>
      </div>
      {props.alternative && (
        <div className="border-t border-line bg-sage/60 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Try instead</p>
          <p className="mt-0.5 text-[14px]">{props.alternative}</p>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
        <p className="text-[12px] text-muted">Sorted only flags. You decide whether to go ahead.</p>
        <button className="rounded-md px-2 py-1 text-[13px] font-medium text-ink hover:bg-soft" onClick={props.onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
