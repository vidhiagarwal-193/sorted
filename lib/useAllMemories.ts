"use client";

import { useEffect, useState } from "react";
import { callApi, localMemoryFor } from "./useClientMemory";
import type { ClientMemory } from "./types";

// Loads every client's memory for the Overview and Clients pages, refreshing every 10 seconds.
export function useAllMemories(keys: string[]) {
  const [memories, setMemories] = useState<Record<string, ClientMemory>>({});
  const [loading, setLoading] = useState(true);
  const joined = keys.join("|");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const results = await Promise.all(
        joined.split("|").filter(Boolean).map((key) =>
          callApi<{ memory: ClientMemory; saving: boolean }>(`/api/memory?client=${encodeURIComponent(key)}`)
            // Without GitHub saving, show what's been added in this browser tab instead.
            .then((d) => [key, d.saving ? d.memory : (localMemoryFor(key) ?? d.memory)] as const)
            .catch(() => null),
        ),
      );
      if (cancelled) return;
      setMemories(Object.fromEntries(results.filter((r) => r !== null)));
      setLoading(false);
    };
    load();
    const timer = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [joined]);

  return { memories, loading };
}

export function summarize(memory?: ClientMemory) {
  const items = memory?.items ?? [];
  return {
    confirmed: items.filter((it) => it.confirmed).length,
    toReview: items.filter((it) => !it.confirmed).length,
    conflicts: (memory?.alerts ?? []).filter((a) => !a.dismissed).length,
    live: items.some((it) => it.source === "WhatsApp (live)"),
    offer: items.find((it) => it.confirmed && it.type === "offer")?.text,
  };
}
