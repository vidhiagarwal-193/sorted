"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { callApi } from "@/lib/useClientMemory";
import type { CheckResult, MemoryItem } from "@/lib/types";
import { ConflictBox } from "./ConflictBox";
import { AiTag, Button, ErrorNote } from "./ui";

// Paste a new request and check it against confirmed memory before anyone starts work.
export function RequestCheck(props: { clientKey: string; clientName: string; items: MemoryItem[] }) {
  const [request, setRequest] = useState("");
  const [checked, setChecked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const confirmedCount = props.items.filter((it) => it.confirmed).length;

  async function check() {
    setError("");
    setResult(null);
    if (!request.trim()) return setError("Type or paste the new request first.");
    if (confirmedCount === 0) {
      return setError("Confirm at least one detail in Brand Memory first. Only confirmed details are checked.");
    }
    setBusy(true);
    try {
      setResult(
        await callApi<CheckResult>("/api/check", {
          method: "POST",
          body: JSON.stringify({ client: props.clientKey, request, items: props.items }),
        }),
      );
      setChecked(request);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="font-display text-[17px] font-bold">Check a new request</h3>
        <AiTag />
      </div>
      <p className="mb-4 text-[13px] text-muted">
        Before the team starts, Sorted compares it with {confirmedCount} confirmed detail{confirmedCount === 1 ? "" : "s"}.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <textarea
          className="min-h-[52px] flex-1 resize-y rounded-xl border border-line bg-paper/50 p-3 text-[14px] placeholder:text-muted focus:border-ink focus:bg-card focus:outline-none"
          placeholder={`e.g. Let's do a 20% off Diwali post for ${props.clientName}`}
          value={request}
          rows={2}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && check()}
        />
        <Button onClick={check} disabled={busy} className="sm:self-stretch">
          {busy ? "Checking…" : "Check"}
        </Button>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {result?.status === "ok" && (
        <div className="rise mt-3 flex items-start gap-3 rounded-xl border border-ok/30 bg-sage px-4 py-3">
          <Check size={18} className="mt-0.5 shrink-0 text-ok" />
          <div>
            <p className="text-[14px] font-semibold">Good to go</p>
            <p className="text-[13px] text-ink/80">{result.reason}</p>
          </div>
        </div>
      )}
      {result?.status === "conflict" && (
        <div className="mt-3">
          <ConflictBox
            clientName={props.clientName}
            request={checked}
            label="New request"
            reason={result.reason}
            items={props.items.filter((it) => result.conflictsWith.includes(it.id))}
            alternative={result.alternative}
            onDismiss={() => setResult(null)}
          />
        </div>
      )}
    </section>
  );
}
