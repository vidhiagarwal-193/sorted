import { createHash } from "node:crypto";
import { updateJson, readJson } from "./github";

// Telegram Bot API (https://core.telegram.org/bots/api). Sorted only RECEIVES messages; it never replies.
// A bot only sees messages sent to it after it joined: private chats the client started with /start, or groups
// the bot was added to (with privacy mode off to see every message). It can't read history from before that.

export const telegramToken = () => process.env.TELEGRAM_BOT_TOKEN ?? "";
export const telegramEnabled = () => Boolean(telegramToken());

// Telegram sends this back in the X-Telegram-Bot-Api-Secret-Token header, proving a request really came from it.
// Derived from the bot token, so there's no extra secret to configure.
export const webhookSecret = () => createHash("sha256").update(`sorted-webhook:${telegramToken()}`).digest("hex").slice(0, 48);

export async function telegramApi<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${telegramToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!body.ok) throw new Error(body.description || `Telegram ${method} failed (${res.status})`);
  return body.result as T;
}

// ---- Which Telegram chat belongs to which client (explicit, set by the team in Settings) ----

export type PendingMessage = { messageId: string; sender: string; text: string; sentAt: string };
export type TelegramChat = {
  chatId: string;
  title: string; // group name, or the person's name for a private chat
  type: string; // "private" | "group" | "supergroup"
  client: string | null; // linked client key; null until the team links it
  firstSeen: string;
  lastSeen: string;
  messageCount: number;
  pending: PendingMessage[]; // received before the chat was linked (kept so nothing is lost)
};
export type TelegramRegistry = { chats: Record<string, TelegramChat> };

const REGISTRY = "telegram/chats.json";
const emptyRegistry: TelegramRegistry = { chats: {} };

export async function readRegistry(): Promise<TelegramRegistry> {
  return (await readJson<TelegramRegistry>(REGISTRY))?.data ?? emptyRegistry;
}

export async function updateRegistry(change: (r: TelegramRegistry) => TelegramRegistry | null, message: string) {
  return updateJson<TelegramRegistry>(REGISTRY, emptyRegistry, change, message);
}
