# Action Items Queue

> A prioritized daily action queue: items carry a must/should/could priority, check
> off optimistically, edit inline, and can be created either by hand or by the AI
> insights engine applying a suggestion from a chat session.

<!-- GUIDING PRINCIPLE: capture the STRUCTURE, not the skin. The reusable value is
the idea, the data model, the logic, the contracts, the flow. The visuals are
disposable and should be regenerated to fit the destination project. -->

- **Slug:** `action-items-queue`
- **Tags:** `tasks`, `productivity`, `dashboard`, `ai-origin`
- **Source project:** KIID (a private single-user "personal OS" dashboard)
- **Stack:** Next.js 15 App Router + Server Actions + Neon Postgres (`@neondatabase/serverless` HTTP driver), React 19
- **Reuse confidence:** adapt-the-shape (the model and the optimistic write loop are clean and portable, but everything is wired to KIID's hand-written row types, `getSql` sentinel-user scoping, `getInsight` ambient annotations, and Tailwind design tokens, so nothing is literally drop-in)
- **Status in origin:** live in the private dashboard (single user)

## Problem it solves
A solo operator wants one prioritized list of "what moves forward today," not a
generic to-do app. Each item needs a priority so the most important work floats to
the top, a one-tap done toggle, and inline editing without a modal. Crucially, items
should be able to appear two ways: typed in by hand, OR pushed in automatically when
an AI chat session surfaces a concrete next action. This captures that minimal queue
plus the AI-to-queue bridge.

## When to reach for this
- You want a single prioritized task list (not Kanban, not projects) where priority
  drives sort order and the top of the list is always the highest-leverage item.
- You are on Next.js 15 and want the Server-Action + `revalidatePath` + `useOptimistic`
  pattern for instant check-off that persists server-side, with no client data library.
- You have an AI/insights surface that extracts suggested next-actions and you want a
  one-click "apply" that materializes them as real rows (see [[ai-insights-engine]]).
- You want inline-editable rows (double-click title to edit, dropdown to change
  priority) that feel native but write through to the DB.
- You are single-user (or pre-auth) and fine scoping rows to a sentinel user id for now.

## How it works
- **Server component reads + sorts, client components mutate.** `page.tsx` is an async
  server component that calls `listActions()` and `listGoals()` (plain SQL over the Neon
  HTTP driver), sorts actions by `PRIORITY_ORDER` (must < should < could) then newest-first
  by `created_at`, builds a goal-id-to-title lookup, and hands rows to the client `ActionList`.
- **The priority sort is the whole point.** `PRIORITY_ORDER` is `{ must:0, should:1, could:2 }`;
  the page sorts by it before render so the queue is always priority-ranked, ties broken by
  recency. No drag-to-reorder; priority IS the ordering.
- **Lifecycle is a flat status enum, toggled optimistically.** An action is `pending`,
  `done`, or `rolled` (rolled-over to another day). The UI surfaces only the pending↔done
  toggle and a delete; `ActionItem` flips `useOptimistic` state on click inside a
  `useTransition`, then calls `setActionStatus(id, done)` which writes `status` +
  `completed_at` and `revalidatePath`s. `ActionList` splits the filtered rows into Pending
  and Done sections.
- **Inline edits, each its own Server Action.** Double-click the title to edit
  (`updateActionTitle`), pick from a priority `<select>` (`updateActionPriority`), delete
  via a confirm dialog (`deleteAction`). Every edit is a separate `"use server"` action that
  ends in `revalidatePath("/actions")` + `revalidatePath("/dashboard")`.
- **Two creation paths into ONE table.** (1) `ActionForm` is a `useActionState(createAction)`
  quick-add (title + priority + optional due date + optional linked goal) that resets on
  success. (2) The AI path: an `InsightApplier` row POSTs `{ type:"action", data:{title,priority} }`
  to `/api/insights/apply`, which `insert`s straight into `public.actions` with
  `status='pending'`. Both routes produce identical rows; the queue does not distinguish origin.
- **Client-side filter** lives in `ActionList` via `useMemo` (text match over title /
  priority / linked-goal name), shown only when there are more than 3 actions.
- **Demo-mode graceful degradation.** When `getSql()` returns null (no `DATABASE_URL`),
  every mutation no-ops and returns a "Demo mode, not persisted" success so forms still
  clear cleanly instead of erroring.

## Data model
One table. `priority` and `status` are the load-bearing fields; both are Postgres `check`
enums AND re-validated in the Server Actions (defense in depth).

```sql
create table public.actions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,                         -- sentinel for now (single user)
  goal_id             uuid references public.goals(id) on delete set null,  -- optional link to a goal
  title               text not null,
  description         text,
  priority            text not null default 'should'
                        check (priority in ('must','should','could')),      -- drives sort order
  status              text not null default 'pending'
                        check (status in ('pending','done','rolled')),      -- lifecycle
  due_date            date,
  completed_at        timestamptz,                           -- set when status -> done
  is_recurring        boolean not null default false,        -- present in schema, not wired in this UI
  recurrence_pattern  text check (recurrence_pattern in ('daily','weekly','monthly')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index actions_user_idx        on public.actions(user_id);
create index actions_user_status_idx on public.actions(user_id, status);
create index actions_due_idx         on public.actions(user_id, due_date);
```
`PRIORITY_LABELS` (`Must`/`Should`/`Could`) and `PRIORITY_ORDER` (`0/1/2`) live in
`lib/database.ts` as the display + sort layer over the raw enum.

## Key decisions & gotchas
- **There is NO `category` field on actions.** The brief's "category badges" do not exist
  on this table, the only badge dimension is `priority` (must/should/could), rendered by
  `PriorityBadge`. Goals carry a `category`; the `/api/insights/apply` route accepts a
  `category` only on the goal branch. If you need categorized actions, you are adding a
  column, not copying one.
- **"Dismiss" is delete, and `rolled` is a third state most UIs ignore.** The status enum
  is `pending | done | rolled`. `rolled` means "rolled over to a later day," not dismissed.
  The shipped UI only toggles pending↔done and offers a hard `deleteAction` (the closest
  thing to dismiss). If you want a true non-destructive dismiss, add a `dismissed` status or
  repurpose `rolled` and give it its own filter section.
- **Priority is the sort key, not a manual order.** Reordering happens by changing an item's
  priority. There is no drag handle and no `position` column. Simple and good for one operator;
  add an explicit order column if users want intra-priority hand-sorting.
- **Two writers, one shape, no provenance flag.** Manual `createAction` (Server Action,
  FormData) and AI `/api/insights/apply` (route handler, JSON) both insert the same row with
  `status='pending'`. The queue cannot tell an AI-suggested action from a typed one. If you
  need to attribute or audit AI-origin items, add a `source`/`origin` column, the apply route
  is the single choke point to set it.
- **The apply route is auth-gated; the page Server Actions are not scoped.** `/api/insights/apply`
  checks `isAuthenticated()` (cookie gate) before writing. The on-page mutations write against
  the sentinel `user_id` with no per-session scoping (single-user app). Going multi-user means
  threading the real session id through both `createAction`/`setActionStatus`/etc. AND the apply
  route, and adding `where user_id =` to reads and writes.
- **Optimistic toggle snaps forward; failure only self-corrects on refetch.** `useOptimistic`
  flips the checkbox instantly; the action result `{ ok }` is not inspected, so a failed write
  is reconciled by the next `revalidatePath` refetch, not an immediate rollback. Read the result
  and re-apply the old state inside the transition if you need true rollback.
- **`completed_at` is only set, never cleared back to a tombstone.** Toggling done sets
  `completed_at = now()`; toggling back to pending sets it to `null`. Fine for display; if you
  want completion history, log to a separate table instead of overwriting.
- **`description`, `is_recurring`, `recurrence_pattern` exist in the schema but this UI never
  touches them.** They are there for a future recurring-actions feature. Don't assume they are live.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/page.tsx` | Server component: load actions + goals, priority-sort, build goal lookup, attach per-action insights, render form/list/empty-state | `@/lib/repo` (`listActions`,`listGoals`), `@/lib/database` (`PRIORITY_ORDER`,`ActionPriority`), `@/lib/insights` (`getInsight`), local `PageHead`/`Card`/`SuggestionChip` |
| `code/mutations.ts` | `"use server"` actions: `createAction`, `setActionStatus`, `updateActionTitle`, `updateActionPriority`, `deleteAction`; each validates, SQL-writes, `revalidatePath`; demo-mode no-op | `@/lib/neon` (`getSql`,`DEMO_SENTINEL_USER_ID`), `@/lib/database` (`ActionPriority`/`ActionStatus`/`MutationState`), `DATABASE_URL` |
| `code/ActionList.tsx` | Client: text filter (`useMemo`, shown >3 rows), splits into Pending / Done sections | `@/lib/database` (`Action`), `@/lib/insights` (`CardInsight`), `./ActionItem` |
| `code/ActionItem.tsx` | Client row: optimistic done toggle (`useOptimistic`+`useTransition`), double-click title edit, priority `<select>`, delete-with-confirm, due/goal meta | `@/lib/utils` (`cn`), `./mutations`, `@/lib/database` (`PRIORITY_LABELS`), `@/lib/insights`, `./InsightReveal`, `./ConfirmDialog` |
| `code/ActionForm.tsx` | Client quick-add via `useActionState(createAction)`, resets on success; title + priority + due date + optional goal | `./mutations` (`createAction`), `@/lib/database` (`PRIORITY_LABELS`,`initialMutationState`) |
| `code/PriorityBadge.tsx` | Pure presentational badge mapping priority -> Tailwind badge class + label | `@/lib/utils` (`cn`), `@/lib/database` (`ActionPriority`) |

Not copied but required to run: `lib/repo.ts` (`listActions`/`listGoals`), `lib/neon.ts`
(`getSql`/sentinel id), `lib/database.ts` (row types + `PRIORITY_*` maps + `MutationState`),
`lib/insights.ts` (`getInsight`/`CardInsight` ambient annotations), `lib/auth.ts` (cookie gate),
and the AI bridge `app/api/insights/apply/route.ts` + `components/dashboard/InsightApplier.tsx`.

## Structure to keep, skin to drop
- **Keep (the idea):**
  - The action row model: `priority` enum (must/should/could) + `status` enum
    (pending/done/rolled) + `completed_at` + optional `goal_id` link.
  - The priority-driven sort (`PRIORITY_ORDER`, ties by recency), this is what makes it a
    queue, not a list.
  - The optimistic check-off loop: `useOptimistic` + `useTransition` + Server Action +
    `revalidatePath`.
  - The two-writers-one-table pattern, and specifically the **AI-origin bridge**: an apply
    endpoint that turns an extracted insight into a real `pending` action. This is the link
    to [[ai-insights-engine]] and the reason this entry is worth keeping.
  - Demo-mode no-op fallback so a missing DB never white-screens.
- **Drop (regenerate natively):** the `badge-red`/`badge-amber`/`badge-muted` colors, the
  rounded-pill / checkmark-circle styling, `font-mono` uppercase micro-labels, all the
  `text-text-dim`/`bg-bg-raised`/`border-emerald-dim` Tailwind design tokens, the empty-state
  suggestion chips, and the "Daily operating system. Not a to-do list." copy. Restyle the
  badges and rows to the destination's design system; never paste these classes in.

## Adaptation notes
- **Types:** KIID hand-writes `Action`, `ActionPriority`, `ActionStatus`, and the
  `PRIORITY_LABELS`/`PRIORITY_ORDER` maps in `lib/database.ts` (no ORM). With Prisma/Drizzle,
  regenerate the row type from the schema and keep the label + order maps as the UI layer.
- **DB access:** swap `@neondatabase/serverless` + raw SQL for your driver. Keep the shape:
  server-component read helper that priority-sorts + per-mutation Server Action ending in
  `revalidatePath`.
- **AI bridge:** the load-bearing contract is `POST /api/insights/apply` with
  `{ type:"action", data:{ title, priority } }` -> `insert ... status='pending'`. Keep that
  endpoint as the single place AI-suggested actions enter the table; wire your own insights/
  chat surface ([[ai-insights-engine]]) to call it. Add a `source` column here if you want to
  flag AI-origin rows.
- **Auth / scoping:** the apply route gates on `isAuthenticated()`; the page mutations do not
  scope by user. To go multi-user, thread a real session id through all five mutations and the
  apply route and add `where user_id =` to reads and writes; drop the sentinel.
- **Design tokens:** markup leans on `badge`, `btn btn-primary`, `bg-bg-raised`, `text-text-med`,
  `border-emerald-dim`, etc. Map these to your system or the UI renders unstyled.
- **Validation:** mutations re-check priority/status against constant arrays (no Zod). Keep the
  DB `check` constraints as the real guard; the JS check is a friendly early-out.

## Provenance
- Origin files @ commit `5a1adfb`:
  - `apps/web/src/app/(dashboard)/actions/page.tsx`
  - `apps/web/src/app/(dashboard)/actions/mutations.ts`
  - `apps/web/src/components/dashboard/ActionList.tsx`
  - `apps/web/src/components/dashboard/ActionItem.tsx`
  - `apps/web/src/components/dashboard/ActionForm.tsx`
  - `apps/web/src/components/dashboard/PriorityBadge.tsx`
- Schema: `db/migrations/0001_initial.sql` (`public.actions` table + indexes)
- AI bridge (not copied): `apps/web/src/app/api/insights/apply/route.ts`,
  `apps/web/src/components/dashboard/InsightApplier.tsx`
- Supporting (not copied): `apps/web/src/lib/repo.ts`, `lib/neon.ts`, `lib/database.ts`,
  `lib/insights.ts`, `lib/auth.ts`
- Related features: [[ai-insights-engine]], [[prospects-crm]]
