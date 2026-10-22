"use client";

import { useEffect, useRef, useState } from "react";
import { applyOp, type ClientMemory, type MemoryOp } from "./types";

export type SaveStatus = "unknown" | "off" | "saving" | "saved" | "error" | "idle";

// Calls one of our API routes and turns any failure into a friendly message.
export async function callApi<T>(url: string, init?: RequestInit): Promise<T> {
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

const empty = (client: string): ClientMemory => ({ client, items: [], alerts: [], updatedAt: "" });

// When GitHub saving is off, memory is kept in this browser: in a shared map, so every page sees the same
// details as you move around, and in localStorage, so it survives a page reload.
const localMemory = new Map<string, ClientMemory>();
const storageKey = (client: string) => `sorted.memory.${client}`;

export function localMemoryFor(client: string): ClientMemory | undefined {
  if (localMemory.has(client)) return localMemory.get(client);
  try {
    const saved = localStorage.getItem(storageKey(client));
    if (saved) {
      const parsed = JSON.parse(saved) as ClientMemory;
      localMemory.set(client, parsed);
      return parsed;
    }
  } catch {
    // Private window or blocked storage: memory just won't survive a reload.
  }
  return undefined;
}

export function forgetLocally(client: string) {
  localMemory.delete(client);
  try {
    localStorage.removeItem(storageKey(client));
  } catch {
    // Nothing to clear.
  }
}

export function rememberLocally(client: string, memory: ClientMemory) {
  localMemory.set(client, memory);
  try {
    localStorage.setItem(storageKey(client), JSON.stringify(memory));
  } catch {
    // Storage full or blocked: still works for this visit.
  }
}

// Loads one client's memory, checks for updates (e.g. new WhatsApp messages) every 5 seconds,
// and saves changes as small operations so nothing overwrites anything else.
export function useClientMemory(clientKey: string) {
  const [memory, setMemoryState] = useState<ClientMemory>(() => localMemory.get(clientKey) ?? empty(clientKey));
  const setMemory = (next: ClientMemory | ((m: ClientMemory) => ClientMemory)) =>
    setMemoryState((m) => {
      const value = typeof next === "function" ? next(m) : next;
      rememberLocally(clientKey, value);
      return value;
    });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("unknown");
  const saveQueue = useRef(Promise.resolve());
  const pendingSaves = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (pendingSaves.current > 0) return; // don't overwrite a change that's still saving
      callApi<{ memory: ClientMemory; saving: boolean }>(`/api/memory?client=${encodeURIComponent(clientKey)}`)
        .then((data) => {
          if (cancelled || pendingSaves.current > 0) return;
          setLoadError("");
          if (!data.saving) {
            // Nothing is stored on the server: use what this browser saved, and stop checking.
            clearInterval(timer);
            const saved = localMemoryFor(clientKey);
            if (saved) setMemoryState(saved);
            setSaveStatus("off");
            return;
          }
          localMemory.set(clientKey, data.memory);
          setMemoryState(data.memory);
          setSaveStatus((s) => (s === "off" || s === "unknown" ? "idle" : s));
        })
        .catch((err) => !cancelled && setLoadError(err.message))
        .finally(() => !cancelled && setLoading(false));
    };
    const timer = setInterval(load, 5000);
    load();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [clientKey]);

  // Shows the change on screen right away, then asks the server to save it to GitHub.
  function change(op: MemoryOp, note: string) {
    setMemory((m) => applyOp(m, op));
    if (saveStatus === "off" || saveStatus === "unknown") return;
    setSaveStatus("saving");
    pendingSaves.current++;
    saveQueue.current = saveQueue.current.then(() =>
      callApi<{ saved: boolean; memory?: ClientMemory }>("/api/memory", {
        method: "POST",
        body: JSON.stringify({ client: clientKey, change: op, note }),
      })
        .then((r) => {
          setSaveStatus(r.saved ? "saved" : "off");
          if (r.memory && pendingSaves.current === 1) setMemory(r.memory);
        })
        .catch(() => setSaveStatus("error"))
        .finally(() => pendingSaves.current--),
    );
  }

  return { memory, loading, loadError, saveStatus, change };
}

// Saves one change to any client's memory, even one that isn't open on screen:
// to GitHub when saving is set up, otherwise to this browser.
export async function saveChangeFor(clientKey: string, op: MemoryOp, note: string) {
  try {
    const r = await callApi<{ saved: boolean; memory?: ClientMemory }>("/api/memory", {
      method: "POST",
      body: JSON.stringify({ client: clientKey, change: op, note }),
    });
    if (r.saved && r.memory) {
      rememberLocally(clientKey, r.memory);
      return;
    }
  } catch {
    // Fall through and keep it in this browser.
  }
  rememberLocally(clientKey, applyOp(localMemoryFor(clientKey) ?? empty(clientKey), op));
}
