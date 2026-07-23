# Neon Data Repo Layer

> The shared data-access backbone every dashboard surface sits on: a thin repo over
> Neon Postgres with tagged-template SQL, hand-written typed row models, a demo-mode
> fallback (no `DATABASE_URL` means reads return fixtures and writes no-op), and a
> single-user sentinel id.

- **Slug:** `neon-data-repo-layer`
- **Tags:** `infra`, `data-layer`, `neon`, `postgres`, `backbone`
- **Source project:** KIID
- **Stack:** Next.js 15 App Router (server components + server actions) + Neon Postgres (`@neondatabase/serverless` HTTP driver, raw tagged-template SQL, no ORM)
- **Reuse confidence:** adapt-the-shape (the `getSql` + demo-fallback + sentinel pattern is the reusable core; the files ship KIID's exact tables and type models, which you replace)
- **Status in origin:** live (single-user personal OS)

## Problem it solves
Every dashboard page needs to read and write data, work in production against a real
Postgres, AND still render locally / in static builds with no database configured. This
layer gives one consistent read/write surface so the same component tree runs in both
modes without per-page branching, and keeps the app buildable with no live DB.

## When to reach for this
- You want a single-file repo over Postgres with raw SQL and no ORM weight.
- You need the app to render with zero DB config (local dev, CI, static build,
  preview deploys without secrets) by transparently falling back to fixtures.
- You are building single-user / single-tenant first but want the schema
  forward-compatible with real multi-user auth later.
- You want typed row models without a code-gen step (hand-written, stays in sync by hand).

## How it works
- **`getSql()` is the gate.** It reads `DATABASE_URL`; if set, it caches and returns a
  Neon HTTP client (`neon(url)`); if absent, it returns `null`. Every repo function and
  every mutation calls `getSql()` first and branches on null.
- **Demo-mode fallback.** When `getSql()` returns null: list/read functions return an
  in-memory fixture (`demoGoals`, `demoFinances`, ...); mutations short-circuit and
  return a success-shaped `MutationState` (`"Demo mode: changes are not persisted."`)
  without touching the DB. The UI never knows the difference.
- **Sentinel-user scoping.** `DEMO_SENTINEL_USER_ID` (a fixed UUID, overridable via
  `OWNER_USER_ID`) owns every row. Writes stamp it; reads currently do NOT filter by it
  (a deliberate reversal documented in the source). Every user-scoped table carries a
  `user_id` column so the schema is forward-compatible with real auth.
- **Read contract.** `lib/repo.ts` (actually `database.ts` in the file map below, see
  note) exposes `listGoals()`, `listActions()`, `listContacts()`, `listFinances()`,
  `listCareerEvents()`, `listSkills()`, `listJournalEntries()`, discovery lists,
  `listProspects()`, and `getProfileQuestionnaire()`. Each is `getSql()` → fixture-or-query,
  every query wrapped in try/catch that logs and returns `[]` (or the demo seed) on error.
- **Write contract.** Mutations live next to each page (`*/mutations.ts`, `"use server"`),
  not in these three files. Shape: `getSql()` → `demoOk()` if null → validate FormData →
  tagged-template `insert/update` stamping the sentinel id → `revalidatePath()` →
  return `MutationState`. Errors are caught and returned as `{ ok: false, error }`.
- **Typed models + helpers.** `database.ts` is the schema mirror: hand-written row types
  (`Goal`, `Action`, `Finance`, `Prospect`, ...), enum string-unions + label maps, the
  shared `MutationState` discriminated union (`{ok:true}|{ok:false}|{ok:null}`) +
  `initialMutationState` that every server action uses with `useActionState`, and pure
  domain helpers (`totalExpenses`, `netMonthly`, `computeRunwayMonths`,
  `profileSectionsComplete`).

## Data model
Defined in `db/migrations/0001_initial.sql` (single consolidated Neon-native script,
idempotent via `IF NOT EXISTS`, `pgcrypto` for `gen_random_uuid()`, a shared
`set_updated_at()` trigger). Tables: `profiles`, `goals`, `actions`, `contacts`,
`interactions`, `career_events`, `skills`, `finances`, `journal_entries`,
`ai_sessions`, `discovery_ideas`, `revenue_projections`, `idea_kpis`,
`idea_milestones`, `profile_questionnaire`, `prospects`. Every user-scoped table has a
`user_id uuid not null`, `created_at`/`updated_at timestamptz`, and per-table indexes
(e.g. `goals_user_idx`, `goals_status_idx`). Money columns are `numeric` (returns as
strings from Postgres). The original Supabase build's `auth.users` FKs and RLS policies
were stripped; the `user_id` columns are kept purely for forward-compatibility.

## Key decisions & gotchas
- **Demo-mode is a silent no-op on writes.** A missing `DATABASE_URL` does not error: a
  mutation returns `{ ok: true, message: "Demo mode..." }`. If env wiring is wrong in a
  real deploy, the app looks like it is saving while persisting nothing. The only signal
  is the demo message string.
- **Single-user sentinel, not real multi-tenant.** All rows belong to one hardcoded
  UUID. There is no session, no auth check, no per-user isolation. Do not ship this
  multi-user without reintroducing `where user_id = ${session.userId}` on reads and a
  real session source. The source comments mark exactly where to re-add it.
- **Reads do NOT filter by sentinel (on purpose).** An earlier version filtered reads by
  the sentinel and rows inserted via the Neon Console / seed scripts with any other
  `user_id` vanished. Reads were opened up; a column default keeps new inserts on the
  sentinel. This is the opposite of what you would assume from "single-user scoped."
- **`numeric` returns as strings from Postgres.** Every arithmetic helper wraps values in
  `Number()` (see `totalExpenses`/`netMonthly`). Forget this and you get string
  concatenation, not addition.
- **Hand-written types can drift.** No code-gen. `database.ts` types are asserted onto
  query rows via `as unknown as T[]` with zero runtime validation, so a schema change
  that is not mirrored here compiles fine and fails at runtime.
- **Two SQL accessors.** `getSql()` is the non-throwing gate (preferred); `client()` is a
  throwing variant kept only for the prospects path. `hasNeonConfig()` is a cheap boolean
  check pages use to degrade gracefully.
- **Server-only.** Importing any of these from a client component pulls the connection
  string into the client bundle and fails the build.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/neon.ts` | The gate: `getSql()` (cached client or null), `client()` (throwing), `hasNeonConfig()`, `DEMO_SENTINEL_USER_ID`, and the one throwing `listProspects()`. | `@neondatabase/serverless`, `DATABASE_URL`/`OWNER_USER_ID` env, `./database` types |
| `code/repo.ts` | Read layer: every `listX()` / `getX()` with the `getSql()` → fixture-or-query → try/catch fallback. | `@/lib/neon`, the demo-data fixture modules, `@/lib/database` + `@/lib/discovery-types` types |
| `code/database.ts` | Schema mirror: hand-written row types, enum unions + label maps, `MutationState` + `initialMutationState`, and pure helpers (`totalExpenses`, `netMonthly`, `computeRunwayMonths`, `profileSectionsComplete`). | none (pure types + functions) |

Note: in the origin the read functions actually live in `repo.ts` AND a near-duplicate
set lived in `database.ts`'s sibling; the copied `repo.ts` here is the canonical read
layer pages call. Mutations (the write half of the contract) are NOT in these files, 
they live per-page as `app/(dashboard)/*/mutations.ts`. See `finances-runway` for one
concrete mutation example.

## Structure to keep, skin to drop
This is backbone/infra, so there is essentially **no skin** here. Almost everything is
load-bearing.
- **Keep (the idea):** the `getSql()` null-gate, the demo-mode fixture fallback on reads,
  the no-op `demoOk()` on writes, the sentinel-user ownership column for
  forward-compatibility, the `MutationState` discriminated union as the universal
  server-action return shape, the `Number()`-wrap discipline for `numeric` columns, and
  the "reads return `[]` on error, never throw" contract.
- **Drop / replace (project-specific, not styling):** KIID's exact tables and the
  hand-written row types in `database.ts`, the Meridian/Jordan-specific enums and label maps,
  the questionnaire model, and the demo-data fixture modules. These are content, not
  pattern. There is no layout/color/typography to drop here.

## Adaptation notes
- Swap `@neondatabase/serverless` if your destination is not Neon (e.g. `postgres`,
  `@vercel/postgres`); keep the `getSql()` shape and the null-on-missing-env contract.
- Replace every row type in `database.ts` and every `listX` table name in `repo.ts` with
  your own schema; regenerate the matching migration.
- Rebuild the demo-data fixture modules (`@/lib/demo-data`, `@/lib/demo-discovery`) for
  your tables, or return `[]` if you do not need a demo mode.
- Before going multi-user: add a real session source, reintroduce
  `where user_id = ${session.userId}` on reads, stamp the real id on writes instead of
  `DEMO_SENTINEL_USER_ID`, and add the FK + (if desired) RLS the Neon build stripped.
- Keep the `Number()` wrap on any `numeric`/money column you add.

## Provenance
- Origin files: `Loft/apps/web/src/lib/{repo.ts,database.ts,neon.ts}` @ `5a1adfb`
  (schema in `db/migrations/0001_initial.sql`; example write path in
  `apps/web/src/app/(dashboard)/journal/mutations.ts`)
- Related features: [[finances-runway]]
