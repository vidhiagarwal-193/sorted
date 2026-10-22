// An error whose message is safe and friendly to show on screen.
export class FriendlyError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// Gemini models, reached through OpenRouter (this key only allows Google models). You can override them in .env.local.
export const MODELS = {
  fast: process.env.AI_FAST_MODEL || "google/gemini-3.8-flash", // reads chats
  smart: process.env.AI_SMART_MODEL || "google/gemini-3.8-flash", // checks conflicts
};

// Ask the AI a question and get back JSON in the exact shape of `schema`.
// Runs only on the server, so the API key never reaches the browser.
export async function askAIForJSON<T>(opts: {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}): Promise<T> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new FriendlyError(
      "The OpenRouter API key is missing. Add OPENROUTER_API_KEY to .env.local and restart the app.",
      500,
    );
  }

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Title": "Client Memory AI" },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        reasoning: { effort: "low" }, // less "thinking time" so answers come back in seconds
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "result", strict: true, schema: opts.schema },
        },
      }),
    });
  } catch (err) {
    console.error("OpenRouter network error:", err);
    throw new FriendlyError("Couldn't reach the AI. Check your internet connection and try again.", 502);
  }

  if (!res.ok) {
    const detail = await res.text();
    console.error(`OpenRouter error ${res.status}:`, detail.slice(0, 1000));
    if (res.status === 401 || res.status === 403) {
      throw new FriendlyError("The OpenRouter API key was rejected. Check OPENROUTER_API_KEY in .env.local.", 500);
    }
    if (res.status === 402) {
      throw new FriendlyError("Your OpenRouter account is out of credit. Add credit at openrouter.ai.", 500);
    }
    if (res.status === 429) {
      throw new FriendlyError("The AI is busy right now. Wait a few seconds and try again.", 503);
    }
    throw new FriendlyError("The AI returned an error. Please try again.", 502);
  }

  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(text) as T;
  } catch {
    console.error("AI returned non-JSON:", data?.choices?.[0]?.finish_reason, text.slice(0, 500));
    throw new FriendlyError("The AI's answer was garbled. Please try again.", 502);
  }
}
