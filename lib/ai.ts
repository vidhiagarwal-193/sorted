// An error whose message is safe and friendly to show on screen.
export class FriendlyError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: "media_rejected",
  ) {
    super(message);
  }
}

// Gemini models, reached through OpenRouter (this key only allows Google models). You can override them in .env.local.
export const MODELS = {
  fast: process.env.AI_FAST_MODEL || "google/gemini-3.8-flash", // reads chats
  smart: process.env.AI_SMART_MODEL || "google/gemini-3.8-flash", // checks conflicts
};

// An image or video sent along with the question, e.g. "Slide 2" or "Frame at 0:04".
export type MediaPart = { label: string; kind: "image" | "video"; dataUrl: string };

// Ask the AI a question and get back JSON in the exact shape of `schema`.
// Runs only on the server, so the API key never reaches the browser.
export async function askAIForJSON<T>(opts: {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  media?: MediaPart[];
  effort?: "low" | "medium" | "high"; // how much the model thinks first; low is fastest
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
        reasoning: { effort: opts.effort ?? "low" }, // judgement-heavy jobs ask for more thinking
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.media?.length ? withMedia(opts.user, opts.media) : opts.user },
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
    if (res.status === 400 && opts.media?.some((m) => m.kind === "video")) {
      throw new FriendlyError("The AI couldn't open this video file.", 422, "media_rejected");
    }
    if (res.status === 413) {
      throw new FriendlyError("The upload is too large for the AI. Try fewer or smaller files.", 413);
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

// Text first, then each image or video with its label, so the AI can refer to "Slide 2" or "0:04".
function withMedia(text: string, media: MediaPart[]) {
  return [
    { type: "text", text },
    ...media.flatMap((m) => [
      { type: "text", text: `[${m.label}]` },
      m.kind === "video"
        ? { type: "video_url", video_url: { url: m.dataUrl } }
        : { type: "image_url", image_url: { url: m.dataUrl } },
    ]),
  ];
}
