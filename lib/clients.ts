"use client";

import { useMemo } from "react";
import { useStored, writeStored } from "./useStored";

export type { ClientProfile } from "./clientProfiles";
export { DEMO_CLIENTS } from "./clientProfiles";
import { DEMO_CLIENTS, type ClientProfile } from "./clientProfiles";

// Calm colour pairings for clients added in the app, until their real brand colours are known.
const PALETTES: [string, string][] = [
  ["#5C6B57", "#E3E6D8"],
  ["#8A6A55", "#F1E4D6"],
  ["#4F5D6B", "#DCE3E8"],
  ["#76606F", "#EEE2EA"],
  ["#6E7559", "#ECEBDA"],
  ["#9A6E57", "#F4E2D4"],
];
function paletteFor(name: string): [string, string] {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

const STORAGE_KEY = "sorted.customClients";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

// Demo clients plus any the team added in this browser.
export function useClients() {
  const stored = useStored(STORAGE_KEY);
  const custom = useMemo<ClientProfile[]>(() => {
    try {
      const parsed = JSON.parse(stored || "[]");
      if (!Array.isArray(parsed)) return [];
      const demoSlugs = new Set(DEMO_CLIENTS.map((c) => c.slug));
      // Clients added before each got its own colours used a plain dark/sage pair; give them one now.
      return parsed.filter((c: ClientProfile) => !demoSlugs.has(c.slug)).map((c: ClientProfile) =>
        c.colors?.[0] === "#302C28" && c.colors?.[1] === "#E9E9E0" ? { ...c, colors: paletteFor(c.name) } : c,
      );
    } catch {
      return [];
    }
  }, [stored]);

  function addClient(name: string, category?: string): ClientProfile | null {
    const clean = name.trim();
    const slug = slugify(clean);
    if (!clean || !slug) return null;
    const existing = [...DEMO_CLIENTS, ...custom].find((c) => c.slug === slug || c.key === clean);
    if (existing) return existing;
    const type = category?.trim();
    const profile: ClientProfile = { key: clean, slug, name: clean, category: type || undefined, colors: paletteFor(clean) };
    writeStored(STORAGE_KEY, JSON.stringify([...custom, profile]));
    return profile;
  }

  return { clients: [...DEMO_CLIENTS, ...custom], addClient, ready: stored !== null };
}
