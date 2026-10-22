"use client";

import { useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { callApi } from "@/lib/useClientMemory";
import type { MemoryItem, MemoryOp } from "@/lib/types";
import { Button, ErrorNote } from "./ui";

// Upload a WhatsApp export or paste an email; the AI pulls out details to review.
export function AddMessages(props: { clientKey: string; onChange: (op: MemoryOp, note: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function extract() {
    setError("");
    setDone("");
    let text = pasted.trim();
    let source: "WhatsApp" | "Email" = "Email";

    if (file) {
      if (!file.name.toLowerCase().endsWith(".txt")) {
        return setError("Please upload a .txt file. In WhatsApp: open the chat → ⋮ → More → Export chat → Without media.");
      }
      if (file.size === 0) return setError("That file is empty. Try exporting the chat again.");
      if (file.size > 1_000_000) return setError("That file is over 1 MB. Try a shorter chat export.");
      text = (await file.text()).trim();
      source = "WhatsApp";
    }
    if (!text) return setError("Upload a WhatsApp chat (.txt) or paste an email first.");

    setBusy(true);
    try {
      const data = await callApi<{ items: MemoryItem[] }>("/api/extract", {
        method: "POST",
        body: JSON.stringify({ client: props.clientKey, text, source }),
      });
      props.onChange({ op: "add", items: data.items }, `${data.items.length} from ${source}`);
      setDone(`Found ${data.items.length} detail${data.items.length === 1 ? "" : "s"}. Review them above.`);
      setFile(null);
      setPasted("");
      if (fileInput.current) fileInput.current.value = "";
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <h3 className="font-display text-[17px] font-bold">Add messages</h3>
      <p className="mb-4 mt-1 text-[13px] text-muted">
        Drop in a WhatsApp chat export or paste an email. Sorted pulls out preferences, don&apos;ts, offers and decisions.
      </p>

      <label
        className={`mb-3 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3.5 transition ${
          file ? "border-ink bg-soft" : "border-line hover:border-muted hover:bg-paper"
        }`}
      >
        {file ? <FileText size={18} /> : <Upload size={18} className="text-muted" />}
        <span className="min-w-0 flex-1 truncate text-[14px]">{file ? file.name : "Choose a WhatsApp chat (.txt)"}</span>
        {file && <span className="text-[12px] text-muted">Change</span>}
        <input
          ref={fileInput}
          type="file"
          accept=".txt,text/plain"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <textarea
        className="mb-3 h-24 w-full resize-y rounded-xl border border-line bg-paper/50 p-3 text-[14px] placeholder:text-muted focus:border-ink focus:bg-card focus:outline-none disabled:opacity-50"
        placeholder="…or paste an email here"
        value={pasted}
        disabled={!!file}
        onChange={(e) => setPasted(e.target.value)}
      />
      <Button className="w-full" variant="dark" onClick={extract} disabled={busy}>
        {busy ? "Reading messages…" : "Extract details"}
      </Button>
      {busy && <p className="mt-2 text-center text-[12px] text-muted">Usually takes about 5–10 seconds</p>}
      {done && <p className="rise mt-3 rounded-lg bg-sage px-3 py-2.5 text-[13px] font-medium">{done}</p>}
      {error && <ErrorNote>{error}</ErrorNote>}
    </section>
  );
}
