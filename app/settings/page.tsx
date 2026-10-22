"use client";

import { Check, CircleDashed } from "lucide-react";
import { Card, Page, PageHeader, Skeleton } from "@/components/ui";
import { useStatus } from "@/lib/useStatus";

const CONNECTIONS = [
  {
    id: "ai",
    name: "AI (Gemini via OpenRouter)",
    on: "Reads messages and checks requests.",
    off: "Add OPENROUTER_API_KEY to .env.local, then restart the app.",
  },
  {
    id: "github",
    name: "GitHub memory",
    on: "Every client's memory is saved as a file, and every change is a commit, so you have a full decision log.",
    off: "Memory is saved in this browser only. Add GITHUB_TOKEN to .env.local to share it with the team and keep a decision log.",
  },
  {
    id: "whatsapp",
    name: "Live WhatsApp",
    on: "New messages to the business number update brand memory and raise conflict alerts automatically.",
    off: "Add WHATSAPP_APP_SECRET and WHATSAPP_CLIENTS to .env.local and connect the webhook in Meta. Until then, upload chat exports.",
  },
] as const;

export default function SettingsPage() {
  const status = useStatus();
  return (
    <Page>
      <PageHeader eyebrow="Settings" title="Connections" />
      <div className="flex max-w-2xl flex-col gap-3">
        {CONNECTIONS.map((c) => {
          const on = status?.[c.id];
          return (
            <Card key={c.id} className="flex items-start gap-4 p-5">
              {status === null ? (
                <Skeleton className="h-6 w-6" />
              ) : on ? (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-card">
                  <Check size={15} />
                </span>
              ) : (
                <CircleDashed size={26} className="shrink-0 text-muted" />
              )}
              <div>
                <p className="flex flex-wrap items-center gap-2 font-display text-[17px] font-bold">
                  {c.name}
                  {status !== null && (
                    <span className={`text-[12px] font-semibold ${on ? "text-ok" : "text-muted"}`}>
                      {on ? "Connected" : "Not connected"}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[14px] text-muted">{on ? c.on : c.off}</p>
              </div>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}
