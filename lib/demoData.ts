"use client";

import bloom from "./demo/bloom-bakery.json";
import ivy from "./demo/ivy-thread.json";
import spice from "./demo/spice-route.json";
import type { ClientMemory } from "./types";
import { forgetLocally, localMemoryFor, rememberLocally } from "./useClientMemory";

// Demo data for trying Sorted without setup: three made-up clients built from demo-data/,
// with the real trend scans and content reviews from testing on 22 Oct 2026.
const DEMO: ClientMemory[] = [spice, bloom, ivy] as ClientMemory[];

export const demoKeys = DEMO.map((m) => m.client);

// Loads into this browser only. Replaces whatever is saved here for these three clients.
export function loadDemoData() {
  for (const m of DEMO) rememberLocally(m.client, structuredClone(m));
}

export function clearDemoData() {
  for (const key of demoKeys) forgetLocally(key);
}

export function hasLocalData() {
  return demoKeys.some((k) => (localMemoryFor(k)?.items.length ?? 0) > 0);
}
