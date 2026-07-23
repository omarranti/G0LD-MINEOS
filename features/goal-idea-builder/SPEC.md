# Goals Tracker with Optimistic Progress

> A goals surface for a personal-OS dashboard: create goals with a category and
> target date, nudge progress in 5-point steps, and roll them through an
> active / completed / archived lifecycle, all on Server Actions with optimistic
> UI feedback.

- **Slug:** `goal-idea-builder`
- **Tags:** `goals`, `planning`, `dashboard`
- **Source project:** KIID (personal OS dashboard)
- **Stack:** Next.js 15 App Router + Server Actions + Neon Postgres (`@neondatabase/serverless` HTTP driver)
- **Reuse confidence:** adapt-the-shape (`ProgressBar` is drop-in; the page, card, form and mutations are wired to KIID's `lib/repo`, `lib/database` types, `lib/neon`, and the project's Tailwind token classes, so they need rehoming)
- **Status in origin:** live (single-user app behind a password cookie)

## Problem it solves
A personal operating dashboard needs durable, top-level commitments that the rest
of the app can hang off (actions, insights, the AI tool context). The goals
surface lets the owner write a goal once, track its progress with low-friction
nudges, and retire it without deleting history, so the dashboard always shows
what is active versus done versus shelved.

## When to reach for this
- You want a CRUD list where each item has a 0 to 100 progress value the user
  bumps inline rather than typing a number.
- You want Server-Action mutations (no client fetch layer, no API routes) with
  optimistic progress that feels instant.
- You want a three-bucket lifecycle (active / completed / archived) rendered as
  sections, with archived tucked behind a `<details>` disclosure.
- You want the create form to reset itself on success and surface inline status
  without a full client form library.

## How it works
- The page is a server component: `listGoals()` runs at render, the result is
  partitioned into active / completed / archived in memory, and each bucket is a
  grid of `GoalCard`s. An empty-state card offers seed suggestions.
- Every write is a Server Action in `mutations.ts` (`"use server"`): create,
  set-progress, set-status, update-title, update-category, delete. Each one grabs
  the Neon client, runs one parameterized SQL statement, then calls `refresh()`.
- `refresh()` is `revalidatePath("/goals")` plus `/dashboard` and `/actions`,
  because progress and status changes ripple into those other surfaces.
- `GoalCard` is the only client component doing optimistic work: `useOptimistic`
  holds the progress value so `+5 / -5 / Mark complete` paint immediately, and
  the real Server Action runs inside `useTransition`. Title edit (double-click to
  an input) and category change (an inline `<select>`) fire their own actions.
- `GoalForm` uses `useActionState` against `createGoal`; on `state.ok === true`
  it resets the form via a ref and shows an `aria-live` confirmation.
- Progress is computed, never trusted from the client: `setGoalProgress` clamps
  to 0..100 and rounds server-side, and `ProgressBar` clamps again at render.

## Data model
The `goals` table (Postgres, `0001_initial.sql`):
```sql
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  title         text not null,
  description   text,
  category      text check (category in ('career','financial','creative','personal','network')),
  target_date   date,
  progress      integer not null default 0 check (progress between 0 and 100),
  status        text not null default 'active' check (status in ('active','completed','archived')),
  quarter       integer check (quarter between 1 and 4),
  year          integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals(user_id);
create index if not exists goals_status_idx on public.goals(user_id, status);
```
`quarter` and `year` are stamped at create time from the current date but are not
edited or filtered on anywhere in this feature. An `updated_at` trigger
(`set_updated_at`) is shared across all tables in the schema.

## Key decisions & gotchas
- **Optimistic only on progress, not status.** `+5 / -5 / complete` apply
  `useOptimistic` so the bar moves before the round-trip; archive and delete just
  run in the transition and wait for revalidation. Mixing the two would have meant
  optimistic removal from a bucket, which the section-partition render does not
  support cleanly.
- **Demo-mode fallback is load-bearing.** Every mutation checks `getSql()`; if
  `DATABASE_URL` is missing it returns `{ ok: true, message: "Demo mode..." }`
  instead of throwing, and `listGoals()` returns a seeded `demoGoals` array. This
  is what lets the app render in a static build or local dev with no database.
- **Single-user sentinel, not real auth.** Writes are scoped to
  `DEMO_SENTINEL_USER_ID` (env `OWNER_USER_ID`, default all-zeros-...0001). Note
  the inconsistency carried over from the source: `createGoal`,
  `updateGoalTitle`, and `updateGoalCategory` filter/insert by the sentinel, but
  `setGoalProgress`, `setGoalStatus`, and `deleteGoal` match on `id` alone with
  no `user_id` guard. Fine for single-user, must be tightened before multi-user.
- **Category validation is duplicated.** `VALID_CATEGORIES` in `mutations.ts` and
  the `CATEGORY_LABELS` map in `lib/database.ts` both enumerate the same five
  categories and must stay in sync with the SQL `check` constraint. Three places.
- **`revalidatePath` fan-out is deliberate.** A progress change revalidates
  `/dashboard` and `/actions` too, because those pages read goal progress. Drop
  those calls if your goals are not cross-referenced elsewhere.
- **Errors surface as raw messages.** Mutations return `(err as Error).message`
  straight to the form's status line. Acceptable for a single-owner tool, leaks
  DB detail in a multi-tenant one.
- **Title edit guards no-op saves.** Blur/Enter only fires the action when the
  trimmed draft is non-empty and actually changed; Escape reverts.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/page.tsx` | Server component: fetch, partition into active/completed/archived, render grids + empty state | `@/lib/repo` (`listGoals`), `@/lib/insights` (`getInsight`), `@/components/dashboard/*` (`PageHead`, `Card`, `SuggestionChip`) |
| `code/mutations.ts` | Server Actions: create / set-progress / set-status / update-title / update-category / delete, each + `revalidatePath` | `@/lib/neon` (`getSql`, `DEMO_SENTINEL_USER_ID`), `@/lib/database` types (`GoalCategory`, `GoalStatus`, `MutationState`) |
| `code/GoalCard.tsx` | Client card: optimistic progress nudges, inline title/category edit, complete/archive/delete | `@/lib/utils` (`cn`), `@/lib/database` (`Goal`, `GoalCategory`, `CATEGORY_LABELS`), `@/lib/insights`, sibling `ProgressBar` / `InsightReveal` / `ConfirmDialog`, the `mutations` actions |
| `code/GoalForm.tsx` | Client create form on `useActionState`, self-resetting, inline status | `@/lib/database` (`initialMutationState`, `CATEGORY_LABELS`, `GoalCategory`), `createGoal` action |
| `code/ProgressBar.tsx` | Presentational 0..100 bar, clamps and renders width % | `@/lib/utils` (`cn`, `clamp`), otherwise drop-in |

Shared deps to recreate or stub when porting: `lib/neon.ts` (Neon HTTP client +
sentinel id), `lib/database.ts` (the `Goal` type, `GoalCategory` / `GoalStatus`
unions, `CATEGORY_LABELS`, `MutationState`, `initialMutationState`),
`lib/repo.ts` (`listGoals` with demo fallback), `lib/utils.ts` (`cn`, `clamp`),
and the `lib/insights` + `InsightReveal` / `ConfirmDialog` / `Card` / `PageHead`
/ `SuggestionChip` dashboard primitives.

## Adaptation notes
- `ProgressBar.tsx` is the only genuinely portable piece, just supply `cn` and
  `clamp` (or inline them) and map the Tailwind token classes (`bg-bg-raised`,
  `bg-emerald`, `text-text-muted`).
- Replace the whole `@/lib/database` import surface with your own `Goal` type and
  category union, or generate it from your schema. The components import the
  `CATEGORY_LABELS` record directly for the dropdowns.
- Swap `@/lib/neon` for your DB client. If you are not on the single-user
  sentinel model, add `user_id = ${session.userId}` to every statement
  (especially the three that currently match on `id` alone) and remove the
  `OWNER_USER_ID` sentinel.
- `getInsight` / `InsightReveal` are KIID's AI-insight overlay; pass `undefined`
  and delete the `InsightReveal` line if you do not have an equivalent.
- Retune the `revalidatePath` targets, the seed suggestions in the empty state,
  and the Tailwind design-token class names to your project.
- The `quarter` / `year` stamping in `createGoal` is dead weight unless you add a
  quarterly view; drop those columns and values if not.

## Provenance
- Origin files (KIID, commit `5a1adfb`):
  - `apps/web/src/app/(dashboard)/goals/page.tsx`
  - `apps/web/src/app/(dashboard)/goals/mutations.ts`
  - `apps/web/src/components/dashboard/GoalCard.tsx`
  - `apps/web/src/components/dashboard/GoalForm.tsx`
  - `apps/web/src/components/dashboard/ProgressBar.tsx`
  - Schema: `db/migrations/0001_initial.sql` (`public.goals`)
- Shared deps referenced: `apps/web/src/lib/{neon,database,repo,utils}.ts`
- Related memory: `project_loft.md`
