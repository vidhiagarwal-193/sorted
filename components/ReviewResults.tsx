"use client";

import { useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck, Copy, Eye, Info, ListChecks, TriangleAlert } from "lucide-react";
import type { AreaStatus, Finding, MemoryItem, ReviewResult, Severity, Verdict } from "@/lib/types";
import { AiTag } from "./ui";

export const VERDICT: Record<Verdict, { label: string; tone: string; dot: string; icon: typeof CircleCheck }> = {
  good_to_go: { label: "Good to Go", tone: "border-ok/30 bg-sage", dot: "bg-ok", icon: CircleCheck },
  minor_changes: { label: "Minor Changes Suggested", tone: "border-warn/40 bg-[#F5EFE4]", dot: "bg-warn", icon: Info },
  needs_revision: { label: "Needs Revision", tone: "border-alert/30 bg-alert-soft", dot: "bg-alert", icon: TriangleAlert },
  needs_verification: { label: "Human Verification Required", tone: "border-warn/40 bg-[#F5EFE4]", dot: "bg-warn", icon: CircleAlert },
};

const SEVERITY: Record<Severity, { label: string; hint: string; dot: string }> = {
  critical: { label: "Critical", hint: "Fix before this goes to the client", dot: "bg-alert" },
  important: { label: "Important", hint: "Should be fixed", dot: "bg-warn" },
  suggestion: { label: "Suggestions", hint: "Optional improvements", dot: "bg-accent" },
};

const AREA_LABEL = { instructions: "Instructions", brand: "Brand identity", messaging: "Messaging", facts: "Offers & facts", objective: "Campaign goal" };
const AREA_DOT: Record<AreaStatus, string> = { ok: "bg-ok", issue: "bg-alert", unknown: "bg-line" };
const AREA_WORD: Record<AreaStatus, string> = { ok: "Matches", issue: "Issue", unknown: "Can't tell" };

// A clickable "Slide 2" / "0:04" chip that jumps to that spot in the preview.
function LocationChip({ location, onJump }: { location: string; onJump?: (location: string) => void }) {
  const jumpable = Boolean(onJump && (/slide\s*\d+/i.test(location) || /\d+:\d{2}/.test(location)));
  const cls = "inline-flex items-center gap-1 rounded-md border border-line bg-paper px-1.5 py-0.5 text-[12px] font-medium text-ink";
  return jumpable ? (
    <button onClick={() => onJump?.(location)} className={`${cls} hover:border-ink/40`} title="Show in preview">
      <Eye size={12} /> {location}
    </button>
  ) : (
    <span className={cls}>{location}</span>
  );
}

export function Evidence({ ids, items }: { ids: string[]; items: MemoryItem[] }) {
  const [open, setOpen] = useState(false);
  const found = ids.map((id) => items.find((it) => it.id === id)).filter((it): it is MemoryItem => Boolean(it));
  if (found.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-deep hover:text-ink"
        aria-expanded={open}
      >
        <ChevronDown size={13} className={`transition ${open ? "rotate-180" : ""}`} />
        Based on {found.length} client memory item{found.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="rise mt-2 flex flex-col gap-2">
          {found.map((it) => (
            <li key={it.id} className="rounded-lg border border-line bg-paper/70 p-2.5">
              <p className="text-[13px] italic">&ldquo;{it.quote}&rdquo;</p>
              <p className="mt-1 text-[11px] text-muted">
                {it.source} · {it.date || "no date"} · {it.confirmed ? "confirmed" : "not confirmed yet"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FindingRow({ f, items, onJump }: { f: Finding; items: MemoryItem[]; onJump?: (location: string) => void }) {
  return (
    <li className="rise rounded-xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <LocationChip location={f.location} onJump={onJump} />
        {f.certainty === "needs_verification" && (
          <span className="rounded-md bg-[#F5EFE4] px-1.5 py-0.5 text-[11px] font-semibold text-ink">Check with the client</span>
        )}
      </div>
      <p className="mt-2 text-[15px] font-semibold leading-snug">{f.title}</p>
      <p className="mt-1 text-[13px] text-muted">{f.why}</p>
      <p className="mt-2 rounded-lg bg-sage px-3 py-2 text-[13px]">
        <span className="font-semibold">Fix: </span>
        {f.fix}
      </p>
      <Evidence ids={f.evidence} items={items} />
    </li>
  );
}

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-line bg-card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left" aria-expanded={open}>
        <span className="font-display text-[16px] font-bold">{title}</span>
        <ChevronDown size={16} className={`text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="rise border-t border-line px-5 py-4">{children}</div>}
    </section>
  );
}

export function ReviewResults(props: {
  result: ReviewResult;
  items: MemoryItem[];
  clientName: string;
  analysedAs: string;
  confirmedUsed: number;
  version: number;
  onJump?: (location: string) => void;
}) {
  const { result: r } = props;
  const v = VERDICT[r.verdict];
  const [done, setDone] = useState<Record<number, boolean>>({});
  const bySeverity = (s: Severity) => r.findings.filter((f) => f.severity === s);
  const required = r.missing.filter((m) => m.required);
  const optional = r.missing.filter((m) => !m.required);

  return (
    <div className="flex flex-col gap-4">
      {/* Verdict */}
      <section className={`rise rounded-2xl border p-5 ${v.tone}`}>
        <div className="flex flex-wrap items-center gap-2">
          <v.icon size={20} />
          <h3 className="font-display text-[22px] font-bold tracking-tight">{v.label}</h3>
          <span className="ml-auto">
            <AiTag>Version {props.version}</AiTag>
          </span>
        </div>
        <p className="mt-2 text-[15px] leading-snug">{r.headline}</p>
        <p className="mt-3 text-[12px] text-muted">
          Checked against {props.confirmedUsed} confirmed detail{props.confirmedUsed === 1 ? "" : "s"} from {props.clientName}&apos;s
          memory · Analysed {props.analysedAs}.{" "}
          {r.verdict === "good_to_go" && "No significant issues within the checks below; it doesn't rule out everything."}
        </p>
      </section>

      {/* Compared with the last version */}
      {r.previous && r.previous.length > 0 && (
        <section className="rounded-2xl border border-line bg-card p-5">
          <h4 className="mb-3 font-display text-[16px] font-bold">Since the last version</h4>
          <ul className="flex flex-col gap-2">
            {r.previous.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-[14px]">
                <span
                  className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                    p.status === "resolved" ? "bg-sage text-ok" : p.status === "still_present" ? "bg-alert-soft text-alert-ink" : "bg-soft text-muted"
                  }`}
                >
                  {p.status === "resolved" ? "Resolved" : p.status === "still_present" ? "Still there" : "Unclear"}
                </span>
                {p.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Client compliance summary */}
      <section className="rounded-2xl border border-line bg-card p-5">
        <h4 className="mb-3 font-display text-[16px] font-bold">Against {props.clientName}&apos;s memory</h4>
        <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {(Object.keys(AREA_LABEL) as (keyof typeof AREA_LABEL)[]).map((k) => (
            <li key={k} className="min-w-0">
              <p className="flex items-center gap-2 text-[13px] font-semibold">
                <span className={`h-2 w-2 shrink-0 rounded-full ${AREA_DOT[r.areas[k].status]}`} />
                {AREA_LABEL[k]}
                <span className="font-normal text-muted">· {AREA_WORD[r.areas[k].status]}</span>
              </p>
              <p className="ml-4 mt-0.5 text-[13px] text-muted">{r.areas[k].note}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Findings by severity */}
      {(["critical", "important", "suggestion"] as Severity[]).map((s) => {
        const list = bySeverity(s);
        if (list.length === 0) return null;
        return (
          <section key={s}>
            <div className="mb-2 flex items-baseline gap-2 px-1">
              <span className={`h-2 w-2 rounded-full ${SEVERITY[s].dot}`} />
              <h4 className="font-display text-[16px] font-bold">
                {SEVERITY[s].label} <span className="text-muted">({list.length})</span>
              </h4>
              <span className="text-[12px] text-muted">{SEVERITY[s].hint}</span>
            </div>
            <ul className="flex flex-col gap-2">
              {list.map((f) => (
                <FindingRow key={f.id} f={f} items={props.items} onJump={props.onJump} />
              ))}
            </ul>
          </section>
        );
      })}

      {/* What's missing */}
      {r.missing.length > 0 && (
        <section className="rounded-2xl border border-line bg-card p-5">
          <h4 className="mb-3 font-display text-[16px] font-bold">What&apos;s missing</h4>
          {[
            ["Needed before it goes out", required],
            ["Nice to have", optional],
          ].map(([label, list]) =>
            (list as typeof r.missing).length === 0 ? null : (
              <div key={label as string} className="mb-3 last:mb-0">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{label as string}</p>
                <ul className="flex flex-col gap-1.5">
                  {(list as typeof r.missing).map((m, i) => (
                    <li key={i} className="text-[14px]">
                      <span className="font-medium">{m.detail}</span>
                      <span className="text-muted"> · {m.why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </section>
      )}

      {/* What's working */}
      {r.positives.length > 0 && (
        <section className="rounded-2xl border border-line bg-card p-5">
          <h4 className="mb-3 font-display text-[16px] font-bold">What&apos;s working well</h4>
          <ul className="flex flex-col gap-2">
            {r.positives.map((p, i) => (
              <li key={i} className="text-[14px]">
                <p className="flex items-start gap-2">
                  <CircleCheck size={15} className="mt-0.5 shrink-0 text-ok" />
                  {p.point}
                </p>
                <div className="ml-[23px]">
                  <Evidence ids={p.evidence} items={props.items} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* A corrected caption, ready to copy */}
      {r.suggestedCaption && <SuggestedCaption text={r.suggestedCaption} />}

      {/* Fix checklist */}
      {r.fixes.length > 0 && (
        <section className="rounded-2xl border border-line bg-card p-5">
          <h4 className="mb-3 flex items-center gap-2 font-display text-[16px] font-bold">
            <ListChecks size={17} /> Suggested fixes, in order
          </h4>
          <ol className="flex flex-col gap-1">
            {r.fixes.map((fix, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 text-[14px] hover:bg-soft">
                  <input
                    type="checkbox"
                    checked={!!done[i]}
                    onChange={() => setDone((d) => ({ ...d, [i]: !d[i] }))}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#71755D]"
                  />
                  <span className={done[i] ? "text-muted line-through" : ""}>
                    <span className="mr-1.5 font-semibold text-muted">{i + 1}.</span>
                    {fix}
                  </span>
                </label>
              </li>
            ))}
          </ol>
          <p className="mt-2 px-2 text-[12px] text-muted">Ticks are just for you while you revise. Then upload the new version and review again.</p>
        </section>
      )}

      <Collapsible title="Text Sorted read in the creative">
        <p className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-ink/80">{r.textFound || "No readable text found."}</p>
      </Collapsible>

      <Collapsible title="What was checked, and what wasn't">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Checked</p>
        <ul className="mb-4 list-disc pl-5 text-[13px]">
          {r.checked.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Limitations</p>
        <ul className="list-disc pl-5 text-[13px]">
          {r.limitations.length ? r.limitations.map((l, i) => <li key={i}>{l}</li>) : <li>None reported.</li>}
        </ul>
        <p className="mt-4 text-[12px] text-muted">Sorted is a review assistant. It never approves, sends or publishes anything. Your team decides.</p>
      </Collapsible>
    </div>
  );
}

function SuggestedCaption({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="rounded-2xl border border-accent/40 bg-card p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="font-display text-[16px] font-bold">Suggested caption</h4>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              setCopied(false);
            }
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium hover:bg-soft"
        >
          <Copy size={13} /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="whitespace-pre-wrap rounded-xl bg-paper p-3 text-[14px] leading-relaxed">{text}</p>
      <p className="mt-2 text-[12px] text-muted">
        Rewritten to fix the findings above using only this client&apos;s approved facts. Read it before using it.
      </p>
    </section>
  );
}
