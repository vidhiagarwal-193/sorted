"use client";

import { useEffect, useState } from "react";

export type Status = { ai: boolean; github: boolean; whatsapp: boolean; apify: boolean; telegram: boolean };

// Which connections are set up, so the UI never claims something works when it doesn't.
export function useStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ ai: false, github: false, whatsapp: false, apify: false, telegram: false }));
  }, []);
  return status;
}
