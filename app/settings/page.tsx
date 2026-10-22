"use client";

import { useRouter } from "next/navigation";
import { Check, CircleDashed } from "lucide-react";
import { Button, Card, Page, PageHeader, Skeleton } from "@/components/ui";
import { TelegramSettings } from "@/components/TelegramPanels";
import { useClients } from "@/lib/clients";
import { clearDemoData, loadDemoData } from "@/lib/demoData";
import { useStatus } from "@/lib/useStatus";

const CONNECTIONS = [
  {
    id: "ai",
    name: "AI (Gemini via OpenRouter)",
    on: "Reads messages and checks requests.",
    off: "Add OPENROUTER_API_KEY to .env.local, then restart the app.",
  },
  {
    id: "apify",
    name: "Apify (Instagram trends)",
    on: "Trend Radar reads recent public Instagram posts and Reels for each client's niche.",
    off: "Add APIFY_TOKEN to .env.local (and to Vercel) to use Trend Radar.",
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
  const router = useRouter();
  const { clients } = useClients();
  return (
    <Page>
      <PageHeader eyebrow="Settings" title="Connections" />
      <div className="mb-6">
        <TelegramSettings clients={clients} />
      </div>
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

      <h2 className="mb-3 mt-10 font-display text-[19px] font-bold">Demo data</h2>
      <Card className="max-w-2xl p-5">
        <p className="text-[14px] text-muted">
          Three made-up clients (Spice Route, Bloom Bakery, Ivy &amp; Thread) with confirmed brand memory, real Instagram trend
          scans and content reviews from testing. Loading replaces what&apos;s saved in this browser for those three clients.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={status?.github}
            onClick={() => {
              if (!window.confirm("Load demo data? This replaces anything saved in this browser for Spice Route, Bloom Bakery and Ivy & Thread.")) return;
              loadDemoData();
              router.push("/");
            }}
          >
            Load demo data
          </Button>
          <Button
            variant="ghost"
            disabled={status?.github}
            onClick={() => {
              if (!window.confirm("Clear all data saved in this browser for Spice Route, Bloom Bakery and Ivy & Thread?")) return;
              clearDemoData();
              router.push("/");
            }}
          >
            Clear it
          </Button>
        </div>
        {status?.github && (
          <p className="mt-3 text-[12px] text-muted">Turned off while GitHub saving is on, so shared team memory is never replaced.</p>
        )}
      </Card>
    </Page>
  );
}
