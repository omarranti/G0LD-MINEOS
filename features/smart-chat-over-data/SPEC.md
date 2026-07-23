# Smart Chat Over Your Own Dashboard Data

> An AI assistant ("Smart") that chats grounded in the user's own dashboard
> state (goals, actions, network, finances, journal, skills, prospects), by
> stuffing that data into a Claude system prompt via the Anthropic SDK.

- **Slug:** `smart-chat-over-data`
- **Tags:** `ai`, `assistant`, `dashboard`, `anthropic`
- **Source project:** Loft (personal operator OS dashboard)
- **Stack:** Next.js 15 App Router route handler + Anthropic SDK (`@anthropic-ai/sdk`) + Neon Postgres (`@neondatabase/serverless` HTTP driver)
- **Reuse confidence:** adapt-the-shape (the gather-data → build-prompt → call-Claude → render pattern is the reusable spine; the prompt content and data schema are Loft-specific and must be rewritten)
- **Status in origin:** prototype (single-user, cookie-gated, no per-user auth yet)

## Problem it solves
A dashboard already holds everything that matters about a user: their goals,
their to-do list, their CRM, their runway, their journal. A generic chatbot
knows none of it and gives generic advice. This wires the user's live data into
every Claude call so the assistant answers about *their* situation by name
("book two DJ gigs for May", "call Rob about the consulting ask") instead of
producing productivity boilerplate. No separate "ask the AI" silo, the AI sees
the same data the UI renders.

## When to reach for this
- You have a data-rich dashboard and want an assistant grounded in that data.
- The dataset is small enough to fit in one prompt (no retrieval needed yet).
- You want a few "modes" (brainstorm, decide, draft, etc.) that reshape the
  system prompt rather than separate endpoints.
- You want the thing to render and demo even before an API key is provisioned.
- You want each chat turn to optionally extract structured follow-ups (goals,
  actions) back into the dashboard.

## How it works
- **Server page** (`page.tsx`) loads the user's data via repo helpers and
  renders `SmartChat` plus a read-only context panel. It is `robots: noindex`.
- **Client component** (`SmartChat.tsx`) holds the mode + message state and
  POSTs `{ mode, messages }` to `/api/chat`. It is a thin chat shell: a mode
  selector, a scrolling transcript, a minimal inline markdown renderer (bold /
  italic / inline-code only, deliberately not a full parser), and ⌘+Enter send.
- **Route handler** (`chat-route.ts`) auth-gates, then `Promise.all`s nine repo
  reads (goals, actions, contacts, finances, journal, skills, prospects,
  discovery ideas, profile) into a single `DashboardContext` object, calls
  `callClaude`, then runs extraction + session-save in parallel (neither blocks
  the reply). Returns `{ reply, insights }`.
- **Claude helper** (`claude.ts`) is where the grounding happens.
  `buildSystemPrompt(mode, ctx)` concatenates: a hardcoded persona block, the
  user's questionnaire answers (or a per-vertical slice), an optional
  deterministic next-steps block, the selected mode's instruction string, and a
  rendered text dump of the live dashboard context. That whole string is passed
  as `system`; the conversation messages are passed as `messages`.
- **No RAG, no embeddings, no tools.** The entire grounding strategy is "stuff
  the relevant rows into the system prompt as text." Each section is trimmed
  (top 8 pending actions, top 6 contacts by strength, top 5 skills, etc.) so the
  prompt stays bounded without a token budgeter.

## Data model
The chat itself is **mostly stateless**: the client keeps the message array in
React state and re-sends the full history each turn. Two persistence touches:

- **Reads** span the whole dashboard through `@/lib/repo` (which queries Neon
  when `DATABASE_URL` is set, else falls back to an in-memory demo seed):
  `goals`, `actions`, `contacts`, `finances`, `journal_entries`, `skills`,
  `prospects`, `discovery_ideas`, `profile_questionnaire`.
- **Writes** one row per completed turn to a `chat_sessions` table (best-effort,
  fire-and-forget):
```sql
insert into public.chat_sessions (user_id, mode, vertical, messages)
values (<sentinel_user_id>, <mode>, <vertical|null>, <messages>::jsonb)
```
All rows are owned by a single sentinel `user_id` (`DEMO_SENTINEL_USER_ID`,
default `00000000-…-0001`) because real per-user auth is not wired yet.

## Key decisions & gotchas
- **Grounding = context stuffing, not retrieval.** The deliberate tradeoff: zero
  infra (no vector DB, no chunking, no retrieval eval) at the cost of a hard
  ceiling on dataset size. This works because the dashboard is single-user and
  small. The moment the data outgrows a prompt, this needs RAG, and the
  `contextToString` trim caps (top-N per section) are the seam where that
  pressure shows up first.
- **Exact model id: `claude-sonnet-4-6`.** Set as the fallback in two places:
  `process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"` (in both `callClaude` and
  `extractInsights`). Override via env without a code change. Note this is the
  string the source uses verbatim; pin to a real published Anthropic model id
  when adapting (consult the claude-api reference for current ids).
- **Two separate Claude calls per turn, different budgets.** The reply uses
  `max_tokens: 1500`; the insight-extraction pass uses `max_tokens: 400` with a
  strict "return ONLY valid JSON, no fences" system prompt and a regex
  (`/\{[\s\S]*\}/`) to salvage the JSON if the model wraps it. Extraction is
  capped to 3 goals / 5 actions and swallows all parse errors to `{goals:[],
  actions:[]}`. It is non-streaming on both calls (`messages.create`, then read
  `response.content[0]`); if `block.type !== "text"` it returns a placeholder.
- **Demo mode is a first-class path.** If `ANTHROPIC_API_KEY` is missing or
  starts with `your-`, `callClaude` returns a hand-written, mode-specific canned
  response (and extraction returns empty). This is why the UI renders and
  "works" before any key exists. Keep or strip this when adapting, but know it
  is load-bearing for the no-key demo.
- **API key lives server-side only**, read from `process.env.ANTHROPIC_API_KEY`
  inside the route/helper. The Anthropic client is constructed per call
  (`new Anthropic({ apiKey })`), not module-scoped.
- **Errors never hard-fail the chat.** A Claude error returns a string that
  prepends `[Claude API error: …]` then falls back to the demo response. The
  `chat_sessions` insert is wrapped in try/catch and only `console.error`s.
- **Modes reshape the prompt, not the endpoint.** Nine modes (brainstorm,
  decision, strategy, draft, briefing, outreach, content, spec, analyze) are
  just different instruction strings in `MODE_INSTRUCTIONS`; the transport is
  identical. Adding a mode is one map entry plus one button.
- **Voice rule baked into the prompt:** "Never use em dashes." (Matches the
  origin project's content rules; carry or drop per your brand.)
- **Optional `vertical` hint** swaps the full questionnaire dump for a narrowed
  per-vertical Q&A block plus a deterministic next-steps list, so the model
  extends grounded moves instead of inventing them. The default (no hint) keeps
  the full questionnaire in scope.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/page.tsx` | Server component. Loads dashboard data, renders `SmartChat` + context panel. noindex. | `@/lib/repo`, `@/components/dashboard/*` |
| `code/SmartChat.tsx` | Client chat shell: mode selector, transcript, minimal markdown, ⌘+Enter, POSTs to `/api/chat`. | `@/lib/utils` (cn), `./InsightApplier`, types from `@/lib/claude` |
| `code/chat-route.ts` | `POST /api/chat`. Auth-gate → `Promise.all` 9 repo reads → `callClaude` → parallel extract + save → `{reply, insights}`. | `@/lib/auth`, `@/lib/repo`, `@/lib/profile-mapping`, `@/lib/neon`, `@/lib/claude` |
| `code/claude.ts` | Prompt assembly + Anthropic SDK calls. `buildSystemPrompt`, `callClaude`, `extractInsights`, demo responses. | `@anthropic-ai/sdk`, `@/lib/database`, `@/lib/discovery-types`, `@/content/profile-questionnaire`, `@/lib/profile-mapping` |

Supporting deps referenced (not copied, needed to understand the shape):
- `@/lib/repo.ts`, list helpers; query Neon when `DATABASE_URL` set, else demo seed.
- `@/lib/database.ts`, hand-written row types mirroring the Neon schema (Goal, Action, Contact, Finance, JournalEntry, Skill, Prospect, etc.) plus `computeRunwayMonths`.
- `@/lib/discovery-types.ts`, `DiscoveryIdea` type used in the prompt's "Discovery ideas" section.
- `@/content/profile-questionnaire.ts`, `questionnaireSections` used by `profileToString` to render the user's own answers into the prompt.
- `@/lib/neon.ts`, `getSql()` (nullable Neon HTTP client) and `DEMO_SENTINEL_USER_ID`.

## Adaptation notes
The two things a future session must change are **the data-gathering and the
model/prompt**:
1. **Swap the data layer.** Replace the nine `@/lib/repo` reads and the
   `DashboardContext` shape with your own tables, then rewrite `contextToString`
   to render *your* rows as text (keep the top-N trims to bound the prompt).
2. **Rewrite the persona + voice.** `BASE_SYSTEM_PROMPT` is a hardcoded bio of
   one specific user ("Jordan Lane…"). Replace wholesale. Drop or rewrite the
   em-dash voice rule and the per-mode instruction strings to fit your product.
3. **Pin the model.** Change `claude-sonnet-4-6` (or set `ANTHROPIC_MODEL`) to a
   current published Anthropic model id. Set `ANTHROPIC_API_KEY` server-side.
4. **Decide on the extras.** Keep the demo-mode fallback only if you want a
   no-key preview. Keep `chat_sessions` persistence and `extractInsights` only if
   you want history + write-back; both are independent and removable.
5. **Add real auth.** Reads are currently unscoped to a sentinel user. For
   multi-user, scope every repo read by the session user and stamp `user_id` on
   the `chat_sessions` insert.

## Provenance
- Origin files @ commit `5a1adfb`:
  - `apps/web/src/app/(dashboard)/smart/page.tsx` → `code/page.tsx`
  - `apps/web/src/components/dashboard/SmartChat.tsx` → `code/SmartChat.tsx`
  - `apps/web/src/app/api/chat/route.ts` → `code/chat-route.ts`
  - `apps/web/src/lib/claude.ts` → `code/claude.ts`
- Related (not copied): `apps/web/src/lib/repo.ts`, `lib/database.ts`, `lib/discovery-types.ts`, `lib/neon.ts`, `content/profile-questionnaire.ts`, `lib/profile-mapping.ts`, `components/dashboard/InsightApplier.tsx`
