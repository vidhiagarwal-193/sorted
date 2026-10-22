# Sorted

**Less chasing. More creating.**

Sorted is an internal workspace for small digital marketing agencies that run Instagram for local businesses. It remembers what each client has told the team across WhatsApp and email, checks new requests and finished creatives (posts, carousels, Reels) against that memory before anything reaches the client, and suggests trend-based post ideas that fit each client (**Trend Radar**).

Clients never log in. The AI only flags problems; a person on the team always makes the final call.

---

## Job to be done

> **When** a client sends a new request, or the team finishes a post for them,
> **I want to** check it against everything that client has told us before,
> **so I can** catch contradictions and mistakes before the team does the wrong work or the client sees it.

**User:** an account manager at a small digital marketing agency who handles about 13 clients over WhatsApp and email.

## The 3 tests

Each test uses the real app with real AI calls: upload in the browser, then click **Review with Client Memory**.

| # | Input | Pass when |
|---|---|---|
| **1** | A realistic **café discount post**: Bloom Bakery's "Buy 1 Get 1 FREE cupcakes, every Tuesday this October", in pastel pink and mint, with a playful caption. This offer matches what the client asked for. | No false conflicts. The approved offer, colours and tone are recognised. Verdict is *Good to Go* or *Minor Changes Suggested*. |
| **2** | A **boutique product carousel** (4 slides) for Ivy & Thread: the hook, *"The Linen Kurta, Rs 2,499"*, *"Free alterations… until 31 October"*, and the store address with the WhatsApp number. | Every slide is reviewed in order. The price, offer, address and phone number are confirmed as matching memory, with no false flags. Slide-specific notes name the slide. |
| **3** | A **deliberately bad promo post** for Ivy & Thread: a contradictory discount ("FLAT 40% OFF" plus "25% off new arrivals"), a wrong price (Rs 1,999), an expired offer ("ends 12 Oct"), a wrong WhatsApp number (…11332), and red and neon colours with all caps, "CHEAPEST" and "STEAL", and the retired "I&T" monogram. | *Needs Revision*, with **all 5 problems** caught as separate findings, each citing the client's own words. Nothing wrong is listed as a strength. |

**Latest result: all 3 pass.** In Test 3, all 5 problems came back as critical findings across repeated runs, for example *"Wrong WhatsApp number: the creative displays '+91 98200 11332', whereas approved memory specifies '+91 98200 11223'."*

Demo clients, chats and creatives are made up (see [`demo-data/`](demo-data)). Never use real client messages.

### Feature 2: Trend Radar

> **When** I plan a client's next posts, **I want to** know what's working on Instagram in their niche right now, **so I can** ride a real trend without breaking anything the client told us.

| # | Input | Pass when | Latest result |
|---|---|---|---|
| **1** | Spice Route (chat confirmed) → **Find trends** | 3 ideas, each with format, hook, hashtags and **at least 2 proof links to real Instagram posts from the last 14 days**, plus a freshness line | **PASS**: 3 ideas in 34 s from 71 posts. All proof links open real Instagram posts. |
| **2** | The same for Ivy & Thread, then Approve one idea, Dismiss one, reload | Ideas cite real brand memory. No discounts for Spice Route, and no red, neon, "cheap" or "steal" for Ivy & Thread. Decisions survive a reload. | **PASS**: different ideas per brand, with none breaking a rule, and Approved/Dismissed kept after a reload |
| **3** | Bad cases: no confirmed memory, missing or wrong Apify token, hashtags with no posts, AI-invented proof posts | Plain messages. Hashtags with no posts are skipped and named. Invented proof is dropped by code. | **PASS**, including 12 direct code tests of the safety checks |

**Analyse a Reel link** (on the Trend Radar page): paste any Instagram Reel you like. Sorted opens it (Apify), **watches the video with its sound** (Gemini), judges it against **every** client's brand memory and recent content, ranks them (Strong, Good, Possible, Not suitable, with the AI's fit score), and writes an adaptation for each suitable client: concept, hook, shot list, call to action, caption starter, and what to keep from the original. Ideas can cross industries; for example, a recipe's "watch it come together" rhythm becomes a boutique's "watch an outfit come together". If no client fits, it says so and explains why. **Use for [client]** saves the adaptation into that client's Trend Radar, where it can be approved, copied as a brief and checked in Content Review. If Instagram blocks the link, or the video is too large (over 20 MB) for the AI to watch from the link, you can upload the video or paste the caption instead. The result always says exactly what was analysed.

---

## Current workflow → future workflow

**Today**, the account manager is the human router. Every instruction and piece of feedback lives in their inbox and their head.

| | Today | With Sorted |
|---|---|---|
| 1 | Client instructions arrive in WhatsApp, email and calls, and live in people's memory | Chats and emails are added to Sorted. Live WhatsApp messages arrive automatically once the WhatsApp Cloud API is connected. |
| 2 | Before working, someone scrolls back through hundreds of messages | Each client has a **brand card**: preferences, don'ts, current offers, decisions and key facts, each linked to the exact message and date |
| 3 | A new request ("20% off for Diwali!") gets started, even if it contradicts an earlier "no discounts" | **Request check**: the request is compared with confirmed memory and warns, showing both messages, plus a **"Try instead"** that keeps the goal but fits the client ("Promote the ₹499 Festive Thali with a free dessert") |
| 4 | Finished creatives go to the client and come back with "we said no discounts", "wrong number", "old logo" | **Content review**: the post, carousel or Reel is checked against the client's memory first, with a verdict, findings, evidence, a fix checklist and a **corrected caption** ready to copy |
| 5 | Revisions repeat and nobody knows which issues were fixed | **Re-review** marks each earlier issue *Resolved* or *Still there*, and every version is kept |
| 6 | Ideas come from scrolling Instagram and guessing what fits | **Trend Radar** reads recent posts and Reels in the client's niche, spots what's working, and suggests 3 ready-to-shoot ideas that fit the client's brand memory: a shot list or slide plan, when to post, hook, caption starter and hashtags, each with real posts as proof and no repeats of earlier ideas |
| 7 | Publishing happens in Sprout Social, Hootsuite or similar | Unchanged. Sorted never publishes or sends anything. |

---

## Architecture

```
 INPUT                 AI                      LOGIC (plain code)               ACTION                    OUTPUT
 ─────                 ──                      ──────────────────               ──────                    ──────
 WhatsApp export  ─┐                         ┌─ quote must appear word-for-   ┌─ save memory as one       Brand card with
 Pasted email     ─┼─► Extract memory ──────►│  word in the source, or it's   │  JSON file per client     quotes, dates and
 Live WhatsApp    ─┘   (Gemini 3.8 Flash)    │  dropped                       │  (GitHub commit, or this  Confirm buttons
 (Cloud API)                                 └─ human Confirm                 │  browser if GitHub is off)
                                                                              │
 New request text ───► Conflict check ──────► only confirmed items are used;  ├─ alert on the dashboard    Red warning with
                       (Gemini 3.8 Flash)     ids must exist in memory        │  (live WhatsApp)           both messages
                                                                              │
 Image / carousel /──► Content review ──────► phone and price check, digit    ├─ add to review history     Verdict, findings by
 video + context       (Gemini 3.8 Flash,     by digit, against Key facts;    │  (never overwritten)       severity, evidence,
 (browser resizes      vision: reads text,    evidence ids verified;          │                            what's missing, fix
 images, samples       layout, video)         verdict computed by fixed rules;│                            checklist, limitations
 video frames)                                limitations added               │
                                                                              │
 Confirmed memory ───► Pick hashtags ─► Apify Instagram scrape ─► 14-day      ├─ save trend snapshot       3 ideas with hook,
 (+ team hashtags)     (Gemini), then   filter, engagement score, rising      │  (last 5); Approve /       caption, hashtags,
                       Write ideas      audio & hashtags; proof posts must    │  Dismiss saved             audio, why it fits,
                       (Gemini)         be real; rule-breaking or wrong-      │                            proof posts
                                        price ideas dropped                   └─ nothing is sent or published
```

| Layer | What | Where |
|---|---|---|
| **Input** | Chat export (`.txt`), pasted email, live WhatsApp webhook, request text, images, carousels, video | `components/AddMessages.tsx`, `app/api/whatsapp/route.ts`, `components/ContentReview.tsx`, `lib/media.ts` |
| **AI** | Extract memory, check a request, review a creative. Every call returns JSON in a fixed shape. | `lib/extract.ts`, `lib/check.ts`, `lib/review.ts`, `lib/ai.ts` |
| **Logic** | Validates every quote and id, runs digit-by-digit fact checks, computes the verdict, handles signature checks and duplicate messages, spots trends and checks every trend idea | `lib/review.ts`, `lib/extract.ts`, `lib/trends.ts`, `lib/suggest.ts`, `app/api/*/route.ts` |
| **Action** | Saves memory and review history as one change at a time (no overwrites), raises alerts | `lib/github.ts`, `lib/useClientMemory.ts`, `app/api/memory/route.ts` |
| **Output** | Next.js dashboard: Overview, Clients, client workspace (Brand Memory, Content Review), Settings | `app/`, `components/` |

---

## Where AI is used, and what stays human

| Step | Who | Why |
|---|---|---|
| Pulling preferences, don'ts, offers, decisions and facts out of messy chats | **AI**, then a **human confirms** each item | Needs language understanding: a keyword rule can't tell that "10% off this time" overrides "no discounts" |
| Deciding what counts as client memory | **Human** (Confirm / Discard) | A wrong extraction must never silently become a rule |
| Checking a request for contradictions | **AI flags**, **human decides** | Spotting a contradiction across weeks of history takes reasoning; the AI never blocks anything |
| Reading a creative's text and visuals | **AI** (vision) | Reading text from images, checking layout, slide order and video frames |
| Prices and phone numbers | **Plain code**, as well as the AI | Numbers are too important for AI alone: every number is compared digit by digit with Key facts |
| The verdict | **Plain code** | Computed from the findings with fixed rules, so it always matches what's listed. A wrong price or phone number is always critical. |
| Suggested captions and "Try instead" alternatives | **AI** writes them; **plain code** withholds any that use a price or number not in memory | The team gets a usable fix, never an invented fact |
| Approving, sending, publishing | **Human only** | Sorted is a review assistant. It has no send or publish button. |
| Matching WhatsApp numbers to clients, signatures, duplicates, saving | **Plain code** | Fixed logic: AI would only add cost and risk |
| Picking hashtags and writing trend ideas | **AI** suggests; a **human** approves or dismisses | Whether a trend fits a brand is a judgement call |
| Spotting trends (rising audio, hashtags, formats) and checking proof posts | **Plain code** | Counting and ranking are fixed rules that anyone can check |

## Why these tools

| Tool | Why |
|---|---|
| **Next.js** (App Router) | One codebase for the dashboard and the API routes. Secrets stay on the server, and it deploys to Vercel in one step. |
| **Gemini 3.8 Flash via OpenRouter** | Reads text, images and video in one model, returns JSON in a fixed shape, and replies in seconds. OpenRouter lets the model be swapped through one setting (`AI_FAST_MODEL` / `AI_SMART_MODEL`). |
| **GitHub** for memory (optional) | One JSON file per client. Every change is a commit, so the history is a free, readable **decision log**. Without a token, memory is saved in the browser. |
| **Apify Instagram Hashtag Scraper** | The official, widely used Apify actor for public Instagram posts and Reels by hashtag, with likes, plays, audio and hashtags. Instagram has no public trends API. |
| **WhatsApp Cloud API** | The official way to receive messages, with no risk of a number ban. Unofficial "WhatsApp Web" libraries break WhatsApp's terms. |
| **Tailwind CSS** + Bricolage Grotesque / Geist | A calm "Quiet Luxury" design system defined with theme variables (`app/globals.css`) |

## Failure cases, and what protects against them

| Failure | Example | Protection |
|---|---|---|
| AI invents a quote | A "preference" the client never said | The quote must appear word for word in the source, or it's dropped. Each item shows its source and date and needs a human Confirm. |
| AI cites memory that doesn't exist | A finding "based on" a made-up instruction | Every evidence id is checked against real memory items; unknown ids are removed |
| Wrong number or price slips through, or is praised | "+91 98200 11332" called a strength | Plain-code phone and price check against Key facts. Strengths mentioning a detail with a problem are removed. |
| Outdated or unrecorded preference | The client approved something on a call the AI never saw | Only confirmed items count. If memory has nothing on a topic, the review says "can't tell" instead of guessing. |
| Missed or false conflict | Sarcasm, mixed languages, "same as last time" | The AI only flags; the person sees both messages and decides |
| Only part of a video is analysed | A Reel over 3 MB | It's sent as 6–12 sampled frames, and the review says so, including that the audio wasn't analysed |
| Inconsistent verdicts | The same post gets different results | Strict severity rules in the prompt, and the verdict is computed in code from the findings |
| Same creative re-reviewed as "version 2" | A misleading "feedback unaddressed" | Re-review only unlocks after the creative or its context changes |
| Logo or fonts can't be checked | No brand asset files are stored | Every review states this limitation |
| AI invents a "proof" post for a trend | An idea backed by posts that don't exist | Proof post ids must exist in the Apify data. Ideas with fewer than 2 real, well-performing posts are dropped. |
| A shared Reel is forced onto a client | Every client "fits" | Clients are judged one by one, and "not suitable" is a valid answer. A client rule the idea would break caps the fit at "possible", with the reason shown. Prices and numbers not in memory withhold that client's adaptation. |
| A Reel can't be opened or watched | Private Reel, robots block, or a 30 MB video | A plain message, then a fallback: cover image and caption (labelled as such), or upload the video or paste the caption |
| A trend idea breaks the client's rules | A discount Reel for "no discounts" Spice Route | Ideas that list a conflict, or use a price or number that isn't in memory, are dropped, and the panel says why |
| Hashtags with no posts, Apify out of credit, or a slow scrape | No ideas, or a timeout | Hashtags with no posts are skipped and named. Plain messages for credit, token and timeout problems, and the last scan stays. |
| Spoofed WhatsApp webhook | A fake POST to `/api/whatsapp` | Meta's `X-Hub-Signature-256` is verified with the app secret; anything else gets 401 |

**Trend Radar limits:** a free Apify plan returns only the first page per hashtag, so each scan is a sample of the niche, not all of Instagram. Trends come from the hashtags searched, because Instagram publishes no trending list. Thumbnails can expire, but links don't. A daily automatic scan needs GitHub saving.

**Known limits:** videos over 3 MB are reviewed from frames only, without audio. Images and video are supported, but not PDFs or design files. Live WhatsApp only receives messages sent to the business number, and only new ones. Memory is shared across devices only when GitHub saving is set up.

---

## Run it locally

You need **Node.js 20+** (LTS) and an **OpenRouter API key**.

```bash
git clone https://github.com/vidhiagarwal-193/sorted.git
cd sorted
npm install
```

Create `.env.local` in the project folder. It's ignored by git, so never commit it.

```bash
# Required: AI (https://openrouter.ai/settings/keys)
OPENROUTER_API_KEY=

# Required for Trend Radar (https://console.apify.com/settings/integrations)
APIFY_TOKEN=

# Optional: save memory to a GitHub repo (fine-grained token, "Contents: Read and write" on that repo only)
GITHUB_TOKEN=
GITHUB_DATA_REPO=your-username/client-memory-data

# Optional: live WhatsApp (Meta WhatsApp Cloud API)
WHATSAPP_VERIFY_TOKEN=any-random-string-you-also-type-into-meta
WHATSAPP_APP_SECRET=
WHATSAPP_CLIENTS=919812345678=Client A
```

```bash
npm run dev
```

Open http://localhost:3000. **Quickest way to look around:** click **Load demo data** on the Overview (also in Settings). It loads three made-up clients with confirmed memory, real trend scans and content reviews into your browser.

Or build it yourself:

1. **Clients → Spice Route → Brand Memory**: upload `demo-data/client-a-whatsapp.txt`, click **Extract details**, then **Confirm** the items.
2. **Overview tab**: check *"Let's do a 20% off Diwali post"*. It's flagged against *"No discounts, it cheapens our brand"*.
3. **Content Review tab**: upload `demo-data/creatives/spice-route-diwali-v1.jpg`, click **Review with Client Memory**, then upload `…-v2.jpg` and review the new version.

4. **Trend Radar tab**: click **Find trends** (40–90 s). Approve or dismiss the ideas, and open the proof posts.

**Settings** shows which connections are set up. For a demo, run a production build (`npm run build && npm start`), or use the Vercel deployment.

### Deploy

Import the repo on [vercel.com](https://vercel.com/new) and add the same variables under **Settings → Environment Variables**. For live WhatsApp, set Meta's webhook URL to `https://<your-app>.vercel.app/api/whatsapp` and subscribe to **messages**.

---

*A hackathon MVP. The AI assists; people decide.*
