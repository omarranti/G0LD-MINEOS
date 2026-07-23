# Journal Log

> A single-user journaling surface: a server-action form writes a timestamped
> entry to Postgres, and the page lists every entry back, newest-first.

- **Slug:** `journal-log`
- **Tags:** `journal`, `dashboard`, `notes`
- **Source project:** KIID (personal OS dashboard)
- **Stack:** Next.js 15 App Router + React 19 Server Actions + Neon Postgres (HTTP driver)
- **Reuse confidence:** adapt-the-shape (the form / action / list mechanism is drop-in, but it carries KIID couplings: a sentinel single-user id, a `getSql()`-or-demo fallback, and a separate insights layer the list page calls)
- **Status in origin:** prototype (single-user, cookie-gated, no real auth yet)

## Problem it solves
You want one place to dump meeting notes, half-ideas, reflections, and strategy
thoughts, then see them back in recency order. Not a rich-text editor, not a
sync engine. A textarea, a Save button, and a reverse-chronological feed backed
by a real database row so the entries survive a refresh.

## When to reach for this
- You need a basic "write a note, list the notes" surface inside an authenticated
  dashboard and want the canonical Next.js 15 Server Actions shape for it (form ->
  `"use server"` insert -> `revalidatePath` -> re-render).
- You are fine with the write being a plain SQL `insert` and the read being a
  `select * order by date desc`. No pagination, no search, no infinite scroll.
- You want a graceful "no DB configured" path: with no `DATABASE_URL` the same
  code falls back to an in-memory demo seed instead of crashing the build.
- You want the empty state and the optimistic-ish form reset already handled.

## How it works
- **Form (client).** `JournalForm` is a `"use client"` component driven by React 19
  `useActionState(createJournalEntry, initialMutationState)`. It renders an optional
  title, a required content textarea, and a comma-separated tags input. While the
  action is `pending` every field and the button are disabled.
- **Write (server action).** `createJournalEntry` is `"use server"`. It pulls
  `content` / `title` / `tags` off `FormData`, trims, rejects empty content, splits
  tags on commas, stamps `date` as today (`new Date().toISOString().slice(0,10)`),
  and runs one parameterized `insert into public.journal_entries`. On success it
  calls `revalidatePath("/journal")` and `revalidatePath("/dashboard")` so both
  surfaces re-fetch.
- **Read (server component).** `JournalPage` is an async server component that awaits
  `listJournalEntries()` (a `select * ... order by date desc`) and maps each row to a
  `JournalEntryCard`. If the list is empty it renders a dedicated empty-state card
  instead of a bare list.
- **Reset.** After a successful submit, a `useEffect` watching `state.ok === true`
  calls `formRef.current?.reset()` to clear the form (the server already revalidated,
  so the new entry is already in the list on the next render).
- **Insights side-channel.** Each card is passed `insight={getInsight("journal", e.id)}`.
  In KIID this is a hand-written lookup table keyed by entry id, NOT generated from
  the entry. See the gotcha below.

## Data model
One Postgres table (`public.journal_entries`). The slice this feature touches:

```sql
create table if not exists public.journal_entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  title              text,
  content            text not null,
  tags               text[] default '{}',
  linked_goal_id     uuid references public.goals(id) on delete set null,
  linked_contact_id  uuid references public.contacts(id) on delete set null,
  date               date not null default current_date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists journal_user_idx
  on public.journal_entries(user_id, date desc);
```

Notes:
- The insert only writes `user_id`, `title`, `content`, `tags`, `date`. `id`,
  `created_at`, `updated_at` come from column defaults.
- `linked_goal_id` / `linked_contact_id` exist in the schema (entries can be linked
  to a goal or contact elsewhere in KIID) but this capture form never sets them.
- `user_id` is always the sentinel id `DEMO_SENTINEL_USER_ID`
  (`process.env.OWNER_USER_ID ?? "00000000-0000-0000-0000-000000000001"`), because
  KIID is single-user with no auth provisioned yet.

## Key decisions & gotchas
- **Entries do NOT feed the AI / insights layer (yet).** The page calls
  `getInsight("journal", e.id)`, which in KIID is a hand-authored lookup table keyed
  by demo-data ids. The entry content is never sent to an LLM. The repo comment is
  explicit that Phase 4 will "swap `getInsight` for a server action that calls the
  Claude API with dashboard state as context, and caches the result per-card." So
  treat the insight panel as a placeholder, not a working summarizer. For a real
  journal -> AI loop you have to build that path; it is a stub here.
- **Ordering is by `date desc` only, and `date` is day-granular.** The insert stamps
  `date` to the day (`YYYY-MM-DD`), not a full timestamp, and the list orders solely
  on `date desc`. Two entries written the same day have an undefined relative order.
  If intra-day ordering matters, order by `created_at desc` (it exists and is
  `timestamptz`) instead of / in addition to `date`.
- **Empty state is a real branch, not an empty map.** When `entries.length === 0`
  the page renders a styled "No entries yet" card with copy, rather than an empty
  feed. Worth keeping; it is the difference between "looks broken" and "looks ready."
- **No-DB fallback is load-bearing.** Both the read (`listJournalEntries`) and the
  write (`createJournalEntry`) call `getSql()`, which returns `null` when
  `DATABASE_URL` is unset. The read then returns an in-memory demo seed and the
  write returns a "Demo mode: changes are not persisted." success. This keeps local
  dev and static builds working with zero DB config, but it also means a
  misconfigured prod env silently runs in demo mode instead of erroring. Verify
  `DATABASE_URL` is actually set in prod.
- **Validation is minimal and server-side.** Only `content` is required (checked
  both via the textarea `required` attribute and a server-side trim-and-reject).
  Title and tags are optional. Tags are split on commas, trimmed, and empties
  dropped; there is no de-dupe, no max count, no max length.
- **Errors surface as raw DB messages.** On insert failure the action returns
  `(err as Error).message` straight to the user via the `role="status"` live region.
  Fine for a single-user internal tool; sanitize before exposing to real users.
- **`deleteJournalEntry` exists but the page never calls it.** `mutations.ts` ships a
  delete-by-id action (same demo-fallback + revalidate shape), but `page.tsx` renders
  no delete control. If you want delete, wire a button to it; the action is ready.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/page.tsx` | Server component. Lists entries newest-first via `listJournalEntries()`, renders the form in a card, handles the empty state, passes each card a `getInsight("journal", id)`. | `@/components/dashboard/{PageHead,Card,JournalForm,JournalEntryCard}`, `@/lib/repo` (`listJournalEntries`), `@/lib/insights` (`getInsight`) |
| `code/mutations.ts` | `"use server"` actions: `createJournalEntry` (validate -> `insert` -> revalidate) and unused `deleteJournalEntry`. Demo-mode fallback when no DB. | `@/lib/neon` (`getSql`, `DEMO_SENTINEL_USER_ID`), `@/lib/database` (`MutationState`), `next/cache` (`revalidatePath`) |
| `code/JournalForm.tsx` | `"use client"` form. `useActionState` wraps `createJournalEntry`, disables on pending, resets on success, shows errors in a live region. | `@/app/(dashboard)/journal/mutations` (`createJournalEntry`), `@/lib/database` (`initialMutationState`) |

Not copied but required to run: `@/lib/repo#listJournalEntries`
(`select * from public.journal_entries order by date desc`, with a `demoJournalEntries`
fallback), `@/lib/neon` (`getSql` HTTP client + `DEMO_SENTINEL_USER_ID` sentinel),
`@/lib/database` (`MutationState` type + `initialMutationState`), and
`JournalEntryCard` + `getInsight` (the per-entry display + insight panel).

## Adaptation notes
- **Auth.** Replace `DEMO_SENTINEL_USER_ID` in the insert with your real auth user id,
  and add a `where user_id = ...` filter to the list query (`listJournalEntries`
  currently selects ALL rows because it is single-user). Add the FK constraint on
  `user_id` once you have a users table.
- **DB driver.** `getSql()` returns a `@neondatabase/serverless` HTTP client. To move
  off Neon, swap it for your client (Prisma, `pg`, Drizzle) and keep the
  `null`-when-unconfigured demo fallback only if you actually want it; otherwise drop
  the `demoOk()` / `null` branches so a missing DB fails loudly.
- **Insights.** Decide what `getInsight("journal", id)` should do. Either delete the
  prop and render the card without it, or build the real Phase-4 path (entry content
  -> LLM summary, cached per id). Do not ship the hand-written lookup table as-is; it
  only has rows for the demo ids.
- **Revalidate paths.** `createJournalEntry` revalidates `/journal` and `/dashboard`.
  Update those to your route names.
- **Schema.** Run the `journal_entries` migration. Drop `linked_goal_id` /
  `linked_contact_id` if you do not have `goals` / `contacts` tables (the capture form
  never sets them anyway).

## Provenance
- Origin files (KIID) @ `5a1adfb`:
  - `apps/web/src/app/(dashboard)/journal/page.tsx`
  - `apps/web/src/app/(dashboard)/journal/mutations.ts`
  - `apps/web/src/components/dashboard/JournalForm.tsx`
- Schema: `db/migrations/0001_initial.sql` (lines 160-173, `journal_entries`)
- Sibling deps (not copied): `apps/web/src/lib/repo.ts` (`listJournalEntries`),
  `apps/web/src/lib/neon.ts` (`getSql`, `DEMO_SENTINEL_USER_ID`),
  `apps/web/src/lib/insights.ts` (`getInsight`)
- Related features: [[recently-viewed]]
