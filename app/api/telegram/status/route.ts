import { connection, after } from "next/server";
import { githubEnabled } from "@/lib/github";
import { ingestLiveMessage } from "@/lib/liveIngest";
import { readRegistry, telegramApi, telegramEnabled, updateRegistry, webhookSecret, type TelegramChat } from "@/lib/telegram";

export const maxDuration = 120;

type WebhookInfo = { url: string; pending_update_count: number; last_error_date?: number; last_error_message?: string };

// GET: the real connection state, straight from Telegram (never assumed).
export async function GET(request: Request) {
  await connection();
  const expectedUrl = `${new URL(request.url).origin}/api/telegram`;
  if (!telegramEnabled()) return Response.json({ configured: false, storage: githubEnabled(), expectedUrl });
  try {
    const [me, hook] = await Promise.all([
      telegramApi<{ username: string; first_name: string; can_read_all_group_messages?: boolean }>("getMe"),
      telegramApi<WebhookInfo>("getWebhookInfo"),
    ]);
    const registry = githubEnabled() ? await readRegistry().catch(() => null) : null;
    return Response.json({
      configured: true,
      storage: githubEnabled(),
      bot: { username: me.username, name: me.first_name, readsAllGroupMessages: Boolean(me.can_read_all_group_messages) },
      webhook: {
        url: hook.url,
        connected: hook.url === expectedUrl,
        pending: hook.pending_update_count,
        lastError: hook.last_error_message ? { message: hook.last_error_message, at: new Date((hook.last_error_date ?? 0) * 1000).toISOString() } : null,
      },
      expectedUrl,
      chats: registry ? Object.values(registry.chats).map((c) => ({ ...c, pending: c.pending.length })) : null,
    });
  } catch (err) {
    return Response.json({ configured: true, storage: githubEnabled(), expectedUrl, error: (err as Error).message });
  }
}

// POST { action: "connect" } points Telegram at this app. POST { action: "link", chatId, client } links a chat.
export async function POST(request: Request) {
  if (!telegramEnabled()) return Response.json({ error: "Add TELEGRAM_BOT_TOKEN first." }, { status: 400 });
  const body = await request.json().catch(() => null);
  try {
    if (body?.action === "connect") {
      const url = `${new URL(request.url).origin}/api/telegram`;
      if (!url.startsWith("https://")) {
        return Response.json({ error: "Telegram only delivers to a public https address. Connect from the live site (Vercel), not localhost." }, { status: 400 });
      }
      await telegramApi("setWebhook", { url, secret_token: webhookSecret(), allowed_updates: ["message", "edited_message"] });
      return Response.json({ ok: true, url });
    }

    if (body?.action === "link") {
      if (!githubEnabled()) return Response.json({ error: "Turn on GitHub saving first (GITHUB_TOKEN), so linked chats and memory persist." }, { status: 400 });
      const chatId = String(body.chatId ?? "");
      const client = typeof body.client === "string" && body.client.trim() ? body.client.trim() : null;
      let held: TelegramChat["pending"] = [];
      let title = "";
      await updateRegistry((r) => {
        const chat = r.chats[chatId];
        if (!chat) return null;
        held = client ? chat.pending : [];
        title = chat.title;
        return { chats: { ...r.chats, [chatId]: { ...chat, client, pending: client ? [] : chat.pending } } };
      }, client ? `Telegram: link "${chatId}" to ${client}` : `Telegram: unlink "${chatId}"`);
      // Messages received before linking are processed into the newly linked client's memory, oldest first.
      if (client && held.length) {
        after(async () => {
          for (const p of held) {
            await ingestLiveMessage({ client, channel: "telegram", messageId: p.messageId, chatTitle: title, sender: p.sender, text: p.text, sentAt: new Date(p.sentAt) });
          }
        });
      }
      return Response.json({ ok: true, processing: client ? held.length : 0 });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
