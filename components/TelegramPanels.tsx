"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CircleDashed, RefreshCw, Send, TriangleAlert } from "lucide-react";
import type { ClientProfile } from "@/lib/clients";
import { callApi } from "@/lib/useClientMemory";
import type { ClientMemory } from "@/lib/types";
import { Button, Card, ErrorNote, Skeleton } from "./ui";

type Chat = { chatId: string; title: string; type: string; client: string | null; firstSeen: string; lastSeen: string; messageCount: number; pending: number };
export type TelegramStatus = {
  configured: boolean;
  storage: boolean;
  expectedUrl: string;
  error?: string;
  bot?: { username: string; name: string; readsAllGroupMessages: boolean };
  webhook?: { url: string; connected: boolean; pending: number; lastError: { message: string; at: string } | null };
  chats?: Chat[] | null;
};

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Reads the real connection state from Telegram via the server; refreshes on demand.
export function useTelegramStatus() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await callApi<TelegramStatus>("/api/telegram/status"));
    } catch (err) {
      setStatus({ configured: false, storage: false, expectedUrl: "", error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    callApi<TelegramStatus>("/api/telegram/status")
      .then((s) => !cancelled && setStatus(s))
      .catch((err) => !cancelled && setStatus({ configured: false, storage: false, expectedUrl: "", error: err.message }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);
  return { status, loading, refresh };
}

function Dot({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-card">
      <Check size={12} />
    </span>
  ) : (
    <CircleDashed size={20} className="shrink-0 text-muted" />
  );
}

// Settings: set up the bot, connect the webhook, and link chats to clients.
export function TelegramSettings({ clients }: { clients: ClientProfile[] }) {
  const { status: s, loading, refresh } = useTelegramStatus();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});

  async function act(body: Record<string, unknown>, label: string) {
    setError("");
    setBusy(label);
    try {
      await callApi("/api/telegram/status", { method: "POST", body: JSON.stringify(body) });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  const steps = [
    { ok: Boolean(s?.configured && !s?.error), label: s?.bot ? `Bot @${s.bot.username}` : "Bot token (TELEGRAM_BOT_TOKEN)" },
    { ok: Boolean(s?.storage), label: "Saving to GitHub (GITHUB_TOKEN), so memory persists" },
    { ok: Boolean(s?.webhook?.connected), label: "Webhook connected to this app" },
    { ok: Boolean(s?.chats?.some((c) => c.client)), label: "At least one chat linked to a client" },
  ];

  return (
    <Card className="max-w-2xl p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-display text-[17px] font-bold">
            <Send size={16} /> Telegram (live client conversations)
          </p>
          <p className="mt-1 text-[14px] text-muted">
            Messages clients send to your bot become brand memory to review, and are checked for conflicts. The bot only sees
            messages sent after it joins a chat; it can&apos;t read older history. Sorted never replies.
          </p>
        </div>
        <button onClick={refresh} className="rounded-md p-1.5 text-muted hover:bg-soft hover:text-ink" aria-label="Refresh Telegram status">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading && !s ? (
        <Skeleton className="h-24" />
      ) : (
        <>
          <ul className="mb-4 flex flex-col gap-2">
            {steps.map((st) => (
              <li key={st.label} className="flex items-center gap-2.5 text-[14px]">
                <Dot ok={st.ok} /> {st.label}
              </li>
            ))}
          </ul>

          {s?.error && <ErrorNote>Telegram said: {s.error}</ErrorNote>}
          {s?.webhook?.lastError && (
            <p className="mb-3 flex items-start gap-2 rounded-lg bg-alert-soft px-3 py-2 text-[13px] text-alert-ink">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" /> Last delivery error ({when(s.webhook.lastError.at)}): {s.webhook.lastError.message}
            </p>
          )}

          {!s?.configured && (
            <ol className="mb-2 list-decimal pl-5 text-[13px] text-ink/80">
              <li>In Telegram, message <b>@BotFather</b>, send <code>/newbot</code>, and copy the token.</li>
              <li>For group chats: send BotFather <code>/setprivacy</code>, choose your bot, then <b>Disable</b>.</li>
              <li>Add <code>TELEGRAM_BOT_TOKEN</code> to .env.local and to Vercel, then redeploy.</li>
            </ol>
          )}

          {s?.configured && !s.error && !s.webhook?.connected && (
            <div className="mb-3">
              <Button onClick={() => act({ action: "connect" }, "connect")} disabled={!!busy}>
                {busy === "connect" ? "Connecting…" : "Connect webhook"}
              </Button>
              <p className="mt-1.5 text-[12px] text-muted">
                Points Telegram at {s.expectedUrl}. {s.webhook?.url ? `Currently: ${s.webhook.url}` : "Not connected yet."} Use the live site: Telegram can&apos;t reach localhost.
              </p>
            </div>
          )}

          {s?.webhook?.connected && (
            <p className="mb-3 text-[13px] text-muted">
              Ask the client to open <b>t.me/{s.bot?.username}</b> and press <b>Start</b>, or add the bot to your group with them. Their
              chat then appears below to link.
              {s.bot && !s.bot.readsAllGroupMessages && " Group privacy is on, so in groups the bot only sees commands and replies to it."}
            </p>
          )}

          {s?.chats && s.chats.length > 0 && (
            <div className="rounded-xl border border-line">
              <p className="border-b border-line px-3 py-2 text-[12px] font-semibold text-muted">Chats the bot has received messages from</p>
              <ul className="divide-y divide-line">
                {s.chats.map((c) => (
                  <li key={c.chatId} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-[13px]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.title}</span>
                      <span className="block text-[12px] text-muted">
                        {c.type} · chat {c.chatId} · {c.messageCount} message{c.messageCount === 1 ? "" : "s"} · last {when(c.lastSeen)}
                        {c.pending > 0 && ` · ${c.pending} waiting to be linked`}
                      </span>
                    </span>
                    <select
                      value={picked[c.chatId] ?? c.client ?? ""}
                      onChange={(e) => setPicked({ ...picked, [c.chatId]: e.target.value })}
                      className="h-9 rounded-lg border border-line bg-paper/50 px-2 text-[13px]"
                      aria-label={`Client for ${c.title}`}
                    >
                      <option value="">Not linked</option>
                      {clients.map((cl) => (
                        <option key={cl.key} value={cl.key}>
                          {cl.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant={(picked[c.chatId] ?? c.client ?? "") === (c.client ?? "") ? "ghost" : "primary"}
                      className="min-h-9 px-3"
                      disabled={!!busy || (picked[c.chatId] ?? c.client ?? "") === (c.client ?? "")}
                      onClick={() => act({ action: "link", chatId: c.chatId, client: picked[c.chatId] ?? "" }, c.chatId)}
                    >
                      {busy === c.chatId ? "Saving…" : c.client ? "Change" : "Link"}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s?.webhook?.connected && s.chats?.length === 0 && <p className="text-[13px] text-muted">No messages received yet.</p>}
          {error && <ErrorNote>{error}</ErrorNote>}
        </>
      )}
    </Card>
  );
}

// Client workspace: what has actually arrived from Telegram for this client.
export function TelegramActivity({ client, memory }: { client: Pick<ClientProfile, "key" | "name">; memory: ClientMemory }) {
  const { status: s, loading } = useTelegramStatus();
  const linked = s?.chats?.filter((c) => c.client === client.key) ?? [];
  const messages = (memory.messages ?? []).filter((m) => m.channel === "telegram").slice(-10).reverse();
  const live = Boolean(s?.configured && s.storage && s.webhook?.connected);

  return (
    <section className="mt-4 rounded-2xl border border-line bg-card p-5">
      <h3 className="flex items-center gap-2 font-display text-[17px] font-bold">
        <Send size={15} /> Telegram
      </h3>
      {loading && !s ? (
        <Skeleton className="mt-3 h-12" />
      ) : (
        <>
          <p className="mt-1 flex items-center gap-1.5 text-[13px]">
            <span className={`h-1.5 w-1.5 rounded-full ${live && linked.length ? "bg-ok" : "bg-muted/50"}`} />
            {!s?.configured
              ? "Not set up. See Settings → Telegram."
              : !s.storage
                ? "Bot set up, but GitHub saving is off, so nothing can be stored."
                : !s.webhook?.connected
                  ? "Bot set up, webhook not connected. See Settings."
                  : linked.length
                    ? `Live: ${linked.map((c) => `"${c.title}"`).join(", ")} → ${client.name}`
                    : `Connected, but no chat is linked to ${client.name} yet. Link one in Settings.`}
          </p>
          {s?.error && <p className="mt-1 text-[12px] text-alert-ink">Telegram said: {s.error}</p>}
          {memory.updatedAt && <p className="mt-1 text-[12px] text-muted">Memory last updated {when(memory.updatedAt)}</p>}

          {messages.length > 0 && (
            <ul className="mt-3 flex flex-col divide-y divide-line">
              {messages.map((m) => (
                <li key={m.id} className="py-2 text-[13px] first:pt-0">
                  <p className="text-[12px] text-muted">
                    {m.sender} · {when(m.sentAt)}
                  </p>
                  <p className="mt-0.5 line-clamp-3">{m.text}</p>
                  <p className={`mt-0.5 text-[12px] ${m.status === "failed" ? "text-alert-ink" : m.conflict ? "text-alert-ink" : "text-muted"}`}>
                    {m.status === "failed" ? "⚠ " : ""}
                    {m.note}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {live && linked.length > 0 && messages.length === 0 && <p className="mt-2 text-[13px] text-muted">No messages received from this client yet.</p>}
        </>
      )}
    </section>
  );
}
