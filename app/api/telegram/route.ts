import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { githubEnabled } from "@/lib/github";
import { ingestLiveMessage } from "@/lib/liveIngest";
import { telegramEnabled, updateRegistry, webhookSecret } from "@/lib/telegram";

// Telegram webhook: Telegram calls this for every message the bot receives.
export const maxDuration = 60;

type TgMessage = {
  message_id: number;
  date: number;
  text?: string;
  caption?: string;
  chat: { id: number; type: string; title?: string; first_name?: string; last_name?: string; username?: string };
  from?: { is_bot?: boolean; first_name?: string; last_name?: string; username?: string };
};

const name = (u?: { first_name?: string; last_name?: string; username?: string }) =>
  [u?.first_name, u?.last_name].filter(Boolean).join(" ") || (u?.username ? `@${u.username}` : "Unknown");

export async function POST(request: Request) {
  if (!telegramEnabled()) return new Response("Telegram isn't configured", { status: 503 });
  const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const want = webhookSecret();
  if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return new Response("Bad secret", { status: 401 });
  }

  const update = await request.json().catch(() => null);
  const msg: TgMessage | undefined = update?.message ?? update?.edited_message;
  const text = (msg?.text ?? msg?.caption ?? "").trim();
  // Only real text from people. Stickers, joins and the bot's own messages are ignored.
  if (!msg || !text || msg.from?.is_bot) return new Response("ok");

  const edited = Boolean(update?.edited_message);
  const chatId = String(msg.chat.id);
  const title = msg.chat.title || name(msg.chat) || chatId;
  const sender = name(msg.from);
  const sentAt = new Date(msg.date * 1000);
  const messageId = `telegram:${chatId}:${msg.message_id}${edited ? ":edited" : ""}`;
  const body = edited ? `(edited) ${text}` : text;
  const isCommand = /^\/(start|help|stop)\b/.test(text);

  // Reply to Telegram straight away; record the chat and process the message afterwards.
  after(async () => {
    if (!githubEnabled()) return console.error("Telegram: GitHub saving isn't set up, so the message can't be stored.");
    try {
      let linkedClient: string | null = null;
      await updateRegistry((r) => {
        const now = new Date().toISOString();
        const chat = r.chats[chatId] ?? { chatId, title, type: msg.chat.type, client: null, firstSeen: now, lastSeen: now, messageCount: 0, pending: [] };
        linkedClient = chat.client;
        const pending =
          chat.client || isCommand
            ? chat.pending
            : [...chat.pending, { messageId, sender, text: body.slice(0, 4000), sentAt: sentAt.toISOString() }].slice(-50);
        return { chats: { ...r.chats, [chatId]: { ...chat, title, lastSeen: now, messageCount: chat.messageCount + 1, pending } } };
      }, `Telegram: message in "${title}"`);

      if (!linkedClient) return console.log(`Telegram: chat "${title}" (${chatId}) isn't linked to a client yet; message held in Settings.`);
      if (isCommand) return;
      const result = await ingestLiveMessage({ client: linkedClient, channel: "telegram", messageId, chatTitle: title, sender, text: body, sentAt });
      console.log(`Telegram: ${linkedClient} <- "${title}": ${result.status}: ${result.note}`);
    } catch (err) {
      console.error("Telegram webhook processing failed:", err);
    }
  });
  return new Response("ok");
}
