"use client";

import { useSyncExternalStore } from "react";

// A small value remembered in this browser (localStorage), shared by every component that reads it.
// Returns null while the page is first rendered on the server.

const listeners = new Set<() => void>();

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return ""; // Private window or blocked storage
  }
}

export function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered for next time, but this visit still updates below.
  }
  memory.set(key, value);
  listeners.forEach((l) => l());
}

// Values written this visit, so things still work when localStorage is blocked.
const memory = new Map<string, string>();

export function useStored(key: string): string | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      window.addEventListener("storage", onChange);
      return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    () => memory.get(key) ?? read(key),
    () => null,
  );
}
