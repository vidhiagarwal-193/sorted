// How a client looks in Sorted. `key` is the internal id used for the memory file,
// WhatsApp matching (WHATSAPP_CLIENTS) and the AI prompts, so it must not change.
export type ClientProfile = {
  key: string;
  slug: string;
  name: string; // business name shown in the UI
  category?: string;
  contact?: string;
  description?: string;
  colors: [string, string]; // brand colours: [main, accent]
  monogramText?: string; // initials colour when the accent is too light to read on the main colour
};

// The two demo clients. Names, contacts and colours come from their (made-up) chats in demo-data/.
export const DEMO_CLIENTS: ClientProfile[] = [
  {
    key: "Client A",
    slug: "spice-route",
    name: "Spice Route",
    category: "Indian restaurant",
    contact: "Priya",
    description: "Warm, classy food brand. Real food photos, festive thalis.",
    colors: ["#7A1F2B", "#D4A017"], // "maroon and gold only"
  },
  {
    key: "Client B",
    slug: "bloom-bakery",
    name: "Bloom Bakery",
    category: "Bakery",
    contact: "Arjun",
    description: "Playful, all-natural bakery. Puns welcome, cupcakes on Tuesdays.",
    colors: ["#E7A6B8", "#9FD8C0"], // "pastel pink and mint green"
    monogramText: "#3B2A2F",
  },
];

// The business name for an internal client key, e.g. "Client A" -> "Spice Route".
export function displayName(key: string) {
  return DEMO_CLIENTS.find((c) => c.key === key)?.name ?? key;
}
