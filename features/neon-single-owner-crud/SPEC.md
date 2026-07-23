# Neon Single-Owner CRUD Module

> The one server-action CRUD shape every list feature in a single-user dashboard reuses: nullable Neon client with a demo-mode fallback, rows scoped to a sentinel owner, validate then write then `revalidatePath`. Build it once, vary the table.

- **Slug:** `neon-single-owner-crud`
- **Tags:** `crud, neon, server-actions, dashboard, data-layer, pattern`
- **Source project:** personal-OS dashboard
- **Stack:** Next.js 15 App Router (Server Actions) + Neon Postgres
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** live in prod

## Problem it solves
A single-user dashboard grows one list module after another (tasks, goals, journal, finances, contacts, a timeline). Each one is the same `mutations.ts` with a different table name and a few different fields. Capturing all of them separately just dilutes a catalog with near-duplicates. This is the pattern captured once, with a table mapping the variants that used to be their own entries.

## When to reach for this
- Building any owned-list feature in a single-user (or pre-auth) app: create rows, edit a field, delete, re-render.
- You want server actions returning a form-friendly result, and a deployed demo that works with no database attached.
- You are about to write your third `mutations.ts` that looks like the first two.

## How it works
1. **Nullable client, demo fallback.** `getSql()` returns `null` when `DATABASE_URL` is unset. Each action early-returns a demo-success `MutationState`, so a public demo build renders and clears forms without a DB.
2. **Sentinel owner scoping.** Rows are stamped with `DEMO_SENTINEL_USER_ID` on insert and matched on `id AND user_id` for update/delete, so the same code becomes real multi-user auth by swapping that id for the session user id.
3. **Validate -> write -> revalidate.** Each action trims and validates input, runs one parameterized `sql` statement, then `revalidatePath`s the routes that render the data.
4. **`MutationState` everywhere.** Every action returns `{ ok, message }` or `{ ok:false, error }`, so `useActionState` forms show success/error uniformly.
5. **One statement per action.** No transactions here (single-row writes). Reach for `$transaction` only when a write spans rows (see the seat-claim in [[stripe-subscription-webhook]]).

## Data model
```
Item   id (PK)   user_id   title   note   created_at   ...   -- swap per variant
```
The shared contract is `user_id` scoping + an `id` PK. Everything else is per-entity fields.

### Variants (folded from what used to be separate entries)
| Variant | Table | Distinct fields / verbs |
|---|---|---|
| Action items queue | `actions` | `priority` (must/should/could), `status`, `due_date`, `goal_id`; `setActionStatus` toggles `completed_at` |
| Goal / idea builder | `goals` | `category`, `progress` (0-100), `status`; `setGoalProgress` |
| Journal log | `journal_entries` | `content`, `tags[]`, `date`; create + delete only |
| Finances + runway | `finances` | `month`, `year`, `income`, `side_income`; `upsertFinance` (upsert on month+year) |
| Career timeline + skills | `career_events` + `skills` | two tables; `proficiency` clamp, `is_target`, tag parser |
| Prospects CRM | `prospects` | update-only: `status`, `relationship` (no create/delete in-app) |

## Key decisions & gotchas
- **Scope update/delete by `id AND user_id`, not `id` alone.** With a sentinel it looks harmless, but the moment you add real auth, `where id = ${id}` lets any user edit any row. Bake the owner match in now.
- **Demo-mode is a feature, not a stub.** Returning `demoOk()` when there is no DB is what lets these ship as a public, no-backend demo. Keep it.
- **Upsert vs insert.** Most variants insert; period-keyed data (finances by month+year) upserts. That is the only real branch in the family.
- **Two-table variants still fit.** The career/skills variant writes two tables from one module; it is the same pattern twice, not a new one.
- **Not included:** reads (those live in the repo/query layer, see [[neon-data-repo-layer]]), pagination, and optimistic UI.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/mutations.ts` | The canonical create / update / delete with demo fallback, owner scoping, and `revalidatePath`. `Item` stands in for the entity. | `@/lib/neon` (`getSql`, `DEMO_SENTINEL_USER_ID`), `@/lib/database` (`MutationState`), `next/cache` |

## Structure to keep, skin to drop
- **Keep (the idea):** nullable-client demo fallback, sentinel owner scoping on write AND match, validate/write/revalidate, and the `MutationState` return contract.
- **Drop (regenerate natively):** the table name, the entity fields, the validated enums, and the revalidated route paths. all per-variant.

## Adaptation notes
- Pair with [[neon-data-repo-layer]] for `getSql()` + `DEMO_SENTINEL_USER_ID` and the read side.
- Copy `mutations.ts`, rename `Item` -> your entity, set the table and fields, and list the routes to revalidate.
- When real auth lands, replace `DEMO_SENTINEL_USER_ID` with the session user id in one place; the owner-scoped writes already behave.

## Provenance
- Origin: `code/mutations.ts` across the dashboard's list modules (actions, goals, journal, finances, career, prospects) @ `origin/main`. This entry consolidates six near-identical modules; their distinct fields are the variants table above.
- Related features: [[neon-data-repo-layer]], [[network-map]], [[discovery-tool]], [[stripe-subscription-webhook]]
- Related memory: personal-OS dashboard data layer.
