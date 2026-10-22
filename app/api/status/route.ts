import { connection } from "next/server";
import { githubEnabled } from "@/lib/github";

// Which connections are set up. Only true/false, never the secret values.
export async function GET() {
  await connection(); // check on every request, not once at build time
  return Response.json({
    ai: Boolean(process.env.OPENROUTER_API_KEY),
    github: githubEnabled(),
    whatsapp: Boolean(
      process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_CLIENTS,
    ),
  });
}
