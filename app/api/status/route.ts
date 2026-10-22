import { connection } from "next/server";
import { apifyEnabled } from "@/lib/apify";
import { githubEnabled } from "@/lib/github";
import { telegramEnabled } from "@/lib/telegram";

// Which connections are set up. Only true/false, never the secret values.
export async function GET() {
  await connection(); // check on every request, not once at build time
  return Response.json({
    ai: Boolean(process.env.OPENROUTER_API_KEY),
    apify: apifyEnabled(),
    telegram: telegramEnabled() && githubEnabled(), // the bot token is set and messages can be stored
    github: githubEnabled(),
    whatsapp: Boolean(
      process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_CLIENTS,
    ),
  });
}
