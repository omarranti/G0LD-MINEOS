# AI Insights Engine

> Turns dashboard data into structured "insights" (framing, next steps, the one
> high-leverage move) and lets the user apply a suggested goal or action back
> into the underlying data with a single click.

<!-- Capture the STRUCTURE, not the skin. The reusable value is the Insight
contract, the suggest -> reveal -> apply flow, and the apply-route mutation
pattern. The CRT/zinc/emerald Tailwind look and the reveal animation are
disposable and should be regenerated to match the destination project. -->

- **Slug:** `ai-insights-engine`
- **Tags:** `ai`, `insights`, `dashboard`, `anthropic`, `write-back`
- **Source project:** KIID (personal operator OS dashboard)
- **Stack:** Next.js 15 App Router + Anthropic SDK (`@anthropic-ai/sdk`) + Neon Postgres (`@neondatabase/serverless` HTTP driver)
- **Reuse confidence:** adapt-the-shape (the Insight contract, the reveal component, and the apply-route mutation pattern are drop-in shapes; the actual insight *content* is hand-written demo data and the *generation* path is not wired in this code, it lives in the sibling chat feature)
- **Status in origin:** prototype (insights are hand-authored against demo ids; live Claude generation is the documented Phase 4 swap, not yet in these files)

## Problem it solves
A dashboard full of rows (goals, actions, contacts, skills, journal, runway) is
inert. The user has to figure out, per card, what it means and what to do next.
This engine attaches a consistent "intel" layer to every card: a one-line
framing, a numbered checklist, strategic guides, the single golden opportunity,
and the risks. Separately, when the AI surfaces a *new* goal or action worth
adding, the user applies it back into the real tables with one tap instead of
retyping it into a form. Reading and writing the user's data both run through
the same insight vocabulary.

## When to reach for this
- You have a card-based dashboard and want a uniform "what does this mean / what
  do I do" panel under every card, regardless of the card's data type.
- You want AI suggestions to be *actionable in place*, not just text. The user
  should accept a suggestion and have it become a real row.
- You want the reveal affordance present on every card (even empty ones) so the
  pattern is learnable, with an obvious seam to later drop in "generate with AI."
- You want the generation backend swappable: start with hand-written or
  deterministic insights, move to a Claude call later, without changing the
  contract or the UI.

## How it works
- **One contract, many card types.** Every insight is a `CardInsight`: optional
  `context` (one-line framing), `instructions` (numbered steps), `guides`
  (strategic bullets), `goldenOpportunity` (the one move), `risks`. Goals,
  actions, contacts, skills, career events, journal, runway, and dashboard
  summary cards all render through this single shape. `getInsight(kind, id)`
  dispatches on `kind` to the right keyed record; `hasInsightContent()` decides
  whether any section is non-empty.
- **Generation is pluggable, and currently hand-written.** In *these* files the
  insights are static records keyed by demo-data id (`goal-1`, `c-1`, etc.).
  The file header documents the intended swap: replace `getInsight` with a
  server action that calls Claude with dashboard state as context and caches per
  card. The contract is what survives that swap.
- **Reveal is the read path.** `InsightReveal` renders a tap bar under any card.
  If `hasInsightContent` is true it expands to show `CardInsights`; if not it
  shows a dimmed "no intel yet" bar (the future "generate" slot). It
  `stopPropagation`s so the bar never fights inline controls above it, and takes
  a `compact` prop for row-style cards.
- **Apply is the write path, and it is a different insight notion.** The
  applicable suggestions are `ExtractedInsight` (goals + actions), produced by
  the sibling chat feature's extraction pass, not by `CardInsight`.
  `InsightApplier` lists them and POSTs `{ type, data }` to
  `/api/insights/apply`. Each row tracks its own idle/pending/done/error state.
- **The apply route mutates the real tables.** It auth-gates, validates
  `category` against a fixed allowlist (`career|financial|creative|personal|
  network`) and `priority` against (`must|should|could`), inserts one row into
  `goals` or `actions` for the sentinel user, then `revalidatePath`s the
  affected pages so the new row shows up immediately.

## Data model
The insight *display* layer is **stateless** (records compiled into the bundle).
The *apply* layer writes to two existing tables:

```sql
-- goal apply: quarter/year computed server-side from now()
insert into public.goals
  (user_id, title, description, category, progress, status, quarter, year)
values
  (<sentinel_user_id>, <title>, <description|null>, <category|null>,
   0, 'active', <quarter>, <year>);

-- action apply
insert into public.actions (user_id, title, priority, status)
values (<sentinel_user_id>, <title>, <priority>, 'pending');
```

All rows are owned by a single sentinel `user_id` (`DEMO_SENTINEL_USER_ID`)
because per-user auth is not wired. The two applicable types map to:

```ts
type ExtractedInsight = {
  goals: Array<{ title: string; description: string; category: string }>;
  actions: Array<{ title: string; priority: "must" | "should" | "could" }>;
};
```

## Key decisions & gotchas
- **Two distinct "insight" concepts, do not conflate them.** `CardInsight` is
  the rich per-card intel panel (framing + steps + guides + golden + risks),
  read-only. `ExtractedInsight` is the small {goals, actions} payload the chat
  extracts and the apply route writes back. They share the word "insight" and
  nothing else. The reveal/CardInsights path renders the first; the
  applier/route path consumes the second.
- **The contract is the asset; the content here is demo scaffolding.** All the
  `CardInsight` records in `insights.ts` are hand-written copy keyed to specific
  demo ids. That copy is throwaway. What you keep is the `CardInsight` type, the
  `getInsight(kind, id)` dispatch, and `hasInsightContent`. The header comment is
  explicit that Phase 4 swaps the lookup for a Claude call.
- **Generation model id: `claude-sonnet-4-6`.** Not referenced in these five
  files; it lives in the sibling `lib/claude.ts` `extractInsights` pass
  (`process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"`, `max_tokens: 400`,
  strict "return ONLY valid JSON" system prompt, capped at 3 goals / 5 actions).
  Pin this to a current published Anthropic model id when adapting; consult the
  claude-api reference.
- **Apply validates against allowlists, then silently coerces.** Bad `category`
  becomes `null`; bad `priority` falls back to `"should"`. It never rejects on a
  bad enum, it normalizes. `title` is required (400 if missing).
- **Demo mode is a real path.** If `getSql()` returns null (no `DATABASE_URL`),
  the apply route returns `{ ok: true, message: "Demo mode, not persisted." }`
  so the one-click UX still resolves to "Added" without a database.
- **Per-row apply state, not a global spinner.** `InsightApplier` tracks
  idle/pending/done/error *per suggestion row*, and the error state turns the
  control into a Retry button. Applying one row does not block the others.
- **Empty state is deliberate.** `InsightReveal` always renders a bar, even with
  no content, so the affordance is learnable and there is a fixed place to later
  attach "generate with Claude." Do not delete the no-content branch when
  adapting; it is the seam for live generation.
- **`revalidatePath` is how the new row appears.** The route revalidates both
  the list page (`/goals` or `/actions`) and `/dashboard` after insert. If your
  destination uses client fetching or a different cache strategy, replace this
  with the equivalent invalidation or the new row will not show until reload.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/insights.ts` | The `CardInsight` contract, hand-written insight records keyed by demo id, `getInsight(kind, id)` dispatch, `hasInsightContent`. The generation seam. | none (self-contained types + data; swap the records / lookup for a Claude call) |
| `code/CardInsights.tsx` | Renders one `CardInsight`: conditional context / instructions / guides / golden / risks sections in a fixed order. | `@/lib/insights` (the type) |
| `code/InsightReveal.tsx` | Tap-to-expand bar that drops under any card; empty "no intel yet" state; `compact` density; stops propagation. | `@/lib/utils` (cn), `./CardInsights`, `@/lib/insights` |
| `code/InsightApplier.tsx` | Lists `ExtractedInsight` goals/actions; per-row apply with idle/pending/done/error; POSTs to the apply route. | `@/lib/claude` (the `ExtractedInsight` type) |
| `code/insights-apply-route.ts` | `POST /api/insights/apply`. Auth-gate -> validate enums -> insert goal or action for sentinel user -> `revalidatePath`. | `@/lib/auth`, `@/lib/neon` (`getSql`, `DEMO_SENTINEL_USER_ID`), `next/cache`, `next/server` |

Supporting deps referenced (not copied, needed to understand the shape):
- `@/lib/claude.ts`, owns `ExtractedInsight` and the actual Claude generation
  (`extractInsights`) that feeds `InsightApplier`. This is the live-generation
  path; the captured files only render and apply its output.
- `@/lib/neon.ts`, `getSql()` (nullable Neon HTTP client) + `DEMO_SENTINEL_USER_ID`.
- `@/lib/database.ts`, row types for `goals` / `actions` mirroring the schema.
- `@/lib/auth.ts`, `isAuthenticated()` cookie gate.
- `@/lib/utils.ts`, `cn` class merger.

## Structure to keep, skin to drop
- **Keep (the idea):**
  - The `CardInsight` contract (context / instructions / guides /
    goldenOpportunity / risks) and the `getInsight(kind, id)` dispatch over many
    card types. This uniformity across data types is the whole point.
  - The suggest -> reveal -> apply flow: a read panel that always shows an
    affordance (with an explicit empty seam for generation), and a separate
    write path that turns an AI suggestion into a real row.
  - The apply-route mutation pattern: auth-gate, validate enums against fixed
    allowlists with silent coercion, insert for the (sentinel) user, then
    `revalidatePath` the affected pages. Demo-mode short-circuit when no DB.
  - `hasInsightContent` as the gate for whether to render the expand control.
- **Drop (regenerate natively):**
  - All KIID Tailwind / design-system classes: the `emerald` / `amber` /
    `danger` / `text-dim` / `bg-raised` tokens, the CRT mono uppercase labels
    with `tracking-[0.14em]`, the `⦿` golden and `⚠` risk glyphs, the pill
    "+ Add" button styling, the left-border italic context block.
  - The reveal animation styling: the `animate-fadeUp` expand, the pulsing
    emerald dot, the chevron rotate. Rebuild these to the destination's motion
    system, not pasted in.
  - All hand-written insight *copy* in `insights.ts` (Jordan-specific, keyed to
    demo ids). This is placeholder, not content to ship.

## Adaptation notes
1. **Wire generation.** These files render and apply insights; they do not
   generate the rich `CardInsight` panels (those are hand-written here). Replace
   `getInsight` with a server action that builds a `CardInsight` from your data,
   ideally via Claude, and cache per card. Pin a current model id; set
   `ANTHROPIC_API_KEY` server-side.
2. **Repoint the apply route.** Swap `goals` / `actions` for your tables, the
   two enum allowlists (`category`, `priority`) for your domain's enums, and
   `DEMO_SENTINEL_USER_ID` for the real session user once auth exists. Update
   the `revalidatePath` targets to your actual route segments.
3. **Add real auth scoping.** Reads and writes are unscoped to a sentinel user.
   For multi-user, scope every read by the session user and stamp the real
   `user_id` on insert.
4. **Restyle from scratch.** Rebuild `CardInsights`, `InsightReveal`, and
   `InsightApplier` against the destination design system (see Structure to
   keep, skin to drop). Keep the conditional-section order and the per-row apply
   state machine; replace every class.
5. **Decide on the empty state.** Keep `InsightReveal`'s no-content branch if you
   want a learnable affordance and a generation slot on every card; drop it if
   you only ever render cards that already have insights.

## Provenance
- Origin files @ commit `5a1adfb`:
  - `apps/web/src/lib/insights.ts` -> `code/insights.ts`
  - `apps/web/src/components/dashboard/InsightApplier.tsx` -> `code/InsightApplier.tsx`
  - `apps/web/src/components/dashboard/CardInsights.tsx` -> `code/CardInsights.tsx`
  - `apps/web/src/components/dashboard/InsightReveal.tsx` -> `code/InsightReveal.tsx`
  - `apps/web/src/app/api/insights/apply/route.ts` -> `code/insights-apply-route.ts`
- Related (not copied): `apps/web/src/lib/claude.ts` (owns `ExtractedInsight` +
  `extractInsights` generation), `lib/neon.ts`, `lib/database.ts`, `lib/auth.ts`,
  `lib/utils.ts`
- Related features: [[smart-chat-over-data]] (the sibling chat feature that
  generates the `ExtractedInsight` payload this engine applies)
