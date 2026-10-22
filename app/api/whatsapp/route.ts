import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { githubEnabled } from "@/lib/github";
import { ingestLiveMessage } from "@/lib/liveIngest";

// WhatsApp Cloud API webhook. Meta calls this when a client messages our business number.
// We only receive messages; we never reply.

export const maxDuration = 60; // seconds, so the AI work after the response has time to finish

// Meta's one-time check when you save the webhook URL in the Meta dashboard.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expected) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Verify token doesn't match", { status: 403 });
}

type IncomingMessage = { id: string; from: string; timestamp: string; type: string; text?: { body: string } };

export async function POST(request: Request) {
  const raw = await request.text();

  // Only accept requests really signed by Meta with our app secret.
  const secret = process.env.WHATSAPP_APP_SECRET;
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const expected = secret ? "sha256=" + createHmac("sha256", secret).update(raw).digest("hex") : "";
  if (!secret || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    console.warn("WhatsApp webhook: rejected a request with a missing or wrong signature");
    return new Response("Bad signature", { status: 401 });
  }

  const body = JSON.parse(raw);
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const names = new Map<string, string>(
        (value?.contacts ?? []).map((c: { wa_id: string; profile?: { name?: string } }) => [c.wa_id, c.profile?.name ?? c.wa_id]),
      );
      for (const message of (value?.messages ?? []) as IncomingMessage[]) {
        // Reply to Meta straight away; do the slow AI work afterwards.
        after(() =>
          handleMessage(message, names.get(message.from) ?? message.from).catch((err) =>
            console.error("WhatsApp message failed:", err),
          ),
        );
      }
    }
  }
  return new Response("ok", { status: 200 });
}

// WHATSAPP_CLIENTS="919812345678=Client A,447700900123=Client B"
function clientForNumber(number: string) {
  const digits = (s: string) => s.replace(/\D/g, "");
  for (const pair of (process.env.WHATSAPP_CLIENTS ?? "").split(",")) {
    const [phone, name] = pair.split("=");
    if (phone && name && digits(phone) === digits(number)) return name.trim();
  }
  return null;
}

async function handleMessage(message: IncomingMessage, senderName: string) {
  const client = clientForNumber(message.from);
  if (!client) return console.warn("WhatsApp: message from a number not in WHATSAPP_CLIENTS, ignored");
  if (message.type !== "text" || !message.text?.body?.trim()) {
    return console.log(`WhatsApp: skipped a ${message.type} message from ${client} (only text is read)`);
  }
  if (!githubEnabled()) return console.error("WhatsApp: GitHub saving isn't set up, so there's nowhere to store memory");
  const result = await ingestLiveMessage({
    client,
    channel: "whatsapp",
    messageId: message.id,
    chatTitle: senderName,
    sender: senderName,
    text: message.text.body.trim(),
    sentAt: new Date(Number(message.timestamp) * 1000),
  });
  console.log(`WhatsApp: ${client} -> ${result.status}: ${result.note}`);
}
