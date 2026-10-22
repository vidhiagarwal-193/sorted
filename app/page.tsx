"use client";

import { useEffect, useRef, useState } from "react";
import { ITEM_TYPES, TYPE_LABELS, type CheckResult, type MemoryItem } from "@/lib/types";

type SaveStatus = "off" | "saving" | "saved" | "error" | "idle";

// Calls one of our API routes and turns any failure into a friendly message.
async function callApi<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  } catch {
    throw new Error("Couldn't reach the app's server. Is it still running?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}

export default function Home() {
  const [clients, setClients] = useState(["Client A", "Client B"]);
  const [client, setClient] = useState("Client A");
  const [newClient, setNewClient] = useState("");

  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loadingMemory, setLoadingMemory] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const [request, setRequest] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [openOriginal, setOpenOriginal] = useState<string | null>(null);

  // Saves happen one after another so two quick clicks don't overwrite each other.
  const saveQueue = useRef(Promise.resolve());

  // Load this client's saved memory whenever the client changes.
  useEffect(() => {
    let cancelled = false;
    callApi<{ memory: { items: MemoryItem[] }; saving: boolean }>(
      `/api/memory?client=${encodeURIComponent(client)}`,
    )
      .then((data) => {
        if (cancelled) return;
        setItems(data.memory.items ?? []);
        setSaveStatus(data.saving ? "idle" : "off");
      })
      .catch((err) => !cancelled && setExtractError(err.message))
      .finally(() => !cancelled && setLoadingMemory(false));
    return () => {
      cancelled = true;
    };
  }, [client]);

  function switchClient(name: string) {
    setClient(name);
    setItems([]);
    setLoadingMemory(true);
    setResult(null);
    setExtractError("");
    setCheckError("");
  }

  function addClient() {
    const name = newClient.trim();
    if (!name) return;
    if (!clients.includes(name)) setClients([...clients, name]);
    setNewClient("");
    switchClient(name);
  }

  function save(nextItems: MemoryItem[], commitMessage: string) {
    if (saveStatus === "off") return;
    setSaveStatus("saving");
    saveQueue.current = saveQueue.current.then(() =>
      callApi<{ saved: boolean }>("/api/memory", {
        method: "PUT",
        body: JSON.stringify({ memory: { client, items: nextItems }, commitMessage }),
      })
        .then((r) => setSaveStatus(r.saved ? "saved" : "off"))
        .catch(() => setSaveStatus("error")),
    );
  }

  async function extract() {
    setExtractError("");
    let text = pasted.trim();
    let source: "WhatsApp" | "Email" = "Email";

    if (file) {
      if (!file.name.toLowerCase().endsWith(".txt")) {
        return setExtractError("Please upload a .txt file. In WhatsApp: open the chat → ⋮ → More → Export chat → Without media.");
      }
      if (file.size === 0) return setExtractError("That file is empty. Try exporting the chat again.");
      if (file.size > 1_000_000) return setExtractError("That file is over 1 MB. Try a shorter chat export.");
      text = (await file.text()).trim();
      source = "WhatsApp";
    }
    if (!text) return setExtractError("Upload a WhatsApp chat (.txt) or paste an email first.");

    setExtracting(true);
    try {
      const data = await callApi<{ items: MemoryItem[] }>("/api/extract", {
        method: "POST",
        body: JSON.stringify({ client, text, source }),
      });
      const next = [...items, ...data.items];
      setItems(next);
      save(next, `Add ${data.items.length} unconfirmed items from ${source} (${client})`);
      setFile(null);
      setPasted("");
      if (fileInput.current) fileInput.current.value = "";
    } catch (err) {
      setExtractError((err as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  function confirmItem(id: string) {
    const item = items.find((it) => it.id === id);
    const next = items.map((it) => (it.id === id ? { ...it, confirmed: true } : it));
    setItems(next);
    save(next, `Confirm: ${item?.text} (${client})`);
  }

  function discardItem(id: string) {
    const item = items.find((it) => it.id === id);
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    save(next, `Discard: ${item?.text} (${client})`);
  }

  async function check() {
    setCheckError("");
    setResult(null);
    setOpenOriginal(null);
    if (!request.trim()) return setCheckError("Type or paste the new request first.");
    if (!items.some((it) => it.confirmed)) {
      return setCheckError("Confirm at least one item on the brief card first. Only confirmed items are checked.");
    }
    setChecking(true);
    try {
      setResult(
        await callApi<CheckResult>("/api/check", {
          method: "POST",
          body: JSON.stringify({ client, request, items }),
        }),
      );
    } catch (err) {
      setCheckError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  const conflicting = items.filter((it) => result?.conflictsWith.includes(it.id));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 text-slate-900">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Client Memory AI</h1>
          <p className="text-slate-600">Upload a client&apos;s chats, confirm their brief, and check new requests against it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-md border border-slate-300 bg-white px-3 py-2"
            value={client}
            onChange={(e) => switchClient(e.target.value)}
          >
            {clients.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            className="w-36 rounded-md border border-slate-300 bg-white px-3 py-2"
            placeholder="New client…"
            value={newClient}
            onChange={(e) => setNewClient(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addClient()}
          />
          <button className="rounded-md border border-slate-300 bg-white px-3 py-2 hover:bg-slate-100" onClick={addClient}>
            Add
          </button>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_1.3fr]">
        {/* Left column: add messages, then check a request */}
        <div className="flex flex-col gap-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 font-semibold">1. Add messages</h2>
            <p className="mb-3 text-sm text-slate-600">Upload a WhatsApp chat export (.txt) or paste an email.</p>
            <input
              ref={fileInput}
              type="file"
              accept=".txt,text/plain"
              className="mb-3 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <textarea
              className="mb-3 h-24 w-full rounded-md border border-slate-300 p-2 text-sm disabled:bg-slate-50"
              placeholder="…or paste an email here"
              value={pasted}
              disabled={!!file}
              onChange={(e) => setPasted(e.target.value)}
            />
            <button
              className="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              onClick={extract}
              disabled={extracting}
            >
              {extracting ? "Reading messages…" : "Extract"}
            </button>
            {extractError && <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">{extractError}</p>}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 font-semibold">3. Check a new request</h2>
            <p className="mb-3 text-sm text-slate-600">Compared only against confirmed items.</p>
            <textarea
              className="mb-3 h-20 w-full rounded-md border border-slate-300 p-2 text-sm"
              placeholder={`e.g. Let's do a 20% off Diwali post for ${client}`}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
            />
            <button
              className="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              onClick={check}
              disabled={checking}
            >
              {checking ? "Checking…" : "Check"}
            </button>
            {checkError && <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">{checkError}</p>}

            {result?.status === "ok" && (
              <div className="mt-3 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900">
                <p className="font-semibold">✓ OK</p>
                <p>{result.reason}</p>
              </div>
            )}
            {result?.status === "conflict" && (
              <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                <p className="font-semibold">⚠ Warning: this may contradict what {client} said before</p>
                <p className="mb-2">{result.reason}</p>
                <p className="mb-2 rounded bg-white/70 p-2">
                  <span className="text-xs uppercase text-red-700">New request</span>
                  <br />
                  {request}
                </p>
                {conflicting.map((it) => (
                  <div key={it.id} className="mb-2 rounded bg-white/70 p-2">
                    <span className="text-xs uppercase text-red-700">Conflicts with</span>
                    <br />
                    <button
                      className="text-left underline decoration-dotted"
                      onClick={() => setOpenOriginal(openOriginal === it.id ? null : it.id)}
                    >
                      &ldquo;{it.quote}&rdquo; ({it.source}, {it.date || "no date"})
                    </button>
                    {openOriginal === it.id && (
                      <p className="mt-1 rounded bg-slate-100 p-2 font-mono text-xs text-slate-700">{it.original}</p>
                    )}
                  </div>
                ))}
                <p className="text-xs text-red-700">The AI only flags this. You decide whether to go ahead.</p>
                <button className="mt-2 text-xs underline" onClick={() => setResult(null)}>
                  Dismiss
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Right column: the brief card */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">2. Brief card: {client}</h2>
            <SaveBadge status={saveStatus} />
          </div>
          {loadingMemory ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing here yet. Add some messages to build {client}&apos;s brief.</p>
          ) : (
            ITEM_TYPES.map((type) => {
              const group = items.filter((it) => it.type === type);
              if (group.length === 0) return null;
              return (
                <div key={type} className="mb-4">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{TYPE_LABELS[type]}</h3>
                  <ul className="flex flex-col gap-2">
                    {group.map((it) => (
                      <li
                        key={it.id}
                        className={`rounded-lg border p-3 text-sm ${
                          it.confirmed ? "border-slate-300 bg-white" : "border-dashed border-slate-300 bg-slate-50 text-slate-600"
                        }`}
                      >
                        <p className="font-medium text-slate-900">{it.text}</p>
                        <p className="mt-1 italic">&ldquo;{it.quote}&rdquo;</p>
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span>
                            {it.source} · {it.date || "no date"}
                          </span>
                          {it.confirmed ? (
                            <span className="font-medium text-green-700">✓ Confirmed</span>
                          ) : (
                            <span className="flex gap-2">
                              <button className="text-slate-500 underline" onClick={() => discardItem(it.id)}>
                                Discard
                              </button>
                              <button
                                className="rounded-md bg-slate-900 px-2 py-1 font-medium text-white hover:bg-slate-700"
                                onClick={() => confirmItem(it.id)}
                              >
                                Confirm
                              </button>
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}

function SaveBadge({ status }: { status: SaveStatus }) {
  const text: Record<SaveStatus, string> = {
    idle: "Saved in GitHub",
    saving: "Saving…",
    saved: "✓ Saved to GitHub",
    error: "⚠ Not saved to GitHub",
    off: "Not saving (GitHub not set up)",
  };
  return <span className={`text-xs ${status === "error" ? "text-amber-700" : "text-slate-500"}`}>{text[status]}</span>;
}
