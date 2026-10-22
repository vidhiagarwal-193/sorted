"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

// Step-by-step progress for slow AI work. `startAt` is the step to begin on; after that the
// steps advance as each number of seconds in `at` passes (estimates, so the team sees movement).
export function StepProgress({ steps, at, startAt = 0, note }: { steps: string[]; at: number[]; startAt?: number; note: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const current = Math.min(steps.length - 1, startAt + at.filter((t) => seconds >= t).length);
  return (
    <div className="rise mt-4 rounded-xl border border-line bg-paper/60 p-4" aria-live="polite">
      <ol className="flex flex-col gap-2">
        {steps.map((label, i) => (
          <li key={label} className={`flex items-center gap-2.5 text-[13px] ${i > current ? "text-muted/60" : ""}`}>
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                i < current ? "bg-accent text-card" : i === current ? "border-2 border-accent" : "border border-line"
              }`}
            >
              {i < current && <Check size={10} strokeWidth={3} />}
            </span>
            {label}
            {i === current && <span className="ml-auto text-[12px] tabular-nums text-muted">{seconds}s</span>}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12px] text-muted">{note}</p>
    </div>
  );
}
