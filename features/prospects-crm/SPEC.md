# Prospects / Contacts CRM Surface

> A lightweight personal-CRM dashboard: a dense, sortable prospects table with
> inline status and relationship editing, plus warm-contact cards and an add-form,
> all backed by Server Actions writing to Neon Postgres.

- **Slug:** `prospects-crm`
- **Tags:** `crm`, `prospects`, `dashboard`
- **Source project:** KIID (a private single-user "personal OS" dashboard)
- **Stack:** Next.js 15 App Router + Server Actions + Neon Postgres (`@neondatabase/serverless` HTTP driver), React 19
- **Reuse confidence:** adapt-the-shape (the patterns are clean and portable, but everything is wired to KIID's hand-rolled types, sentinel-user scoping, and Tailwind design tokens, so nothing is literally drop-in)
- **Status in origin:** live in the private dashboard (single user)

## Problem it solves
A solo operator needs to track two distinct kinds of people: **prospects** (cold,
sourced names ranked by fit and reachability that you are trying to break into) and
**contacts** (your existing warm network you want to stay in touch with). Both need a
fast surface to see everyone, change a status or relationship inline, and add new
rows, without standing up a full CRM product. This captures that minimal surface.

## When to reach for this
- You want an internal dashboard table with inline-editable cells (status pipeline,
  relationship level) that feels instant but persists server-side.
- You are on Next.js 15 and want the Server-Action + `revalidatePath` + `useOptimistic`
  pattern for write-then-refetch, without a client data-fetching library.
- You need a "prospects vs contacts" split: a ranked cold-outreach list distinct from
  a warm-relationship list, sharing one design language.
- You are single-user (or pre-auth) and fine scoping rows to a sentinel for now.

## How it works
- **Server component reads, client component mutates.** `page.tsx` is an async server
  component that calls `listProspects()` (a plain SQL query over the Neon HTTP driver),
  computes header stats (total, title-verified, cold, departments) and a "top picks"
  grid, then hands the rows to the client `ProspectTable`.
- **Inline edits via Server Actions + optimistic UI.** `ProspectTable` (client) renders
  `<select>` cells for status and relationship. On change it calls
  `updateProspectStatus` / `updateProspectRelationship` (the `"use server"` actions in
  `mutations.ts`) inside a `startTransition`, and uses React 19's `useOptimistic` to
  patch the row immediately. Each action runs one `UPDATE ... set ..., updated_at = now()`
  and calls `revalidatePath("/prospects")` so the next navigation refetches.
- **Client-side sort + filter** live entirely in `ProspectTable` via `useMemo`: a text
  filter across name/title/department/org/location/tags, and sort keys (fit, reach,
  name, department, seniority) with a `descNullsLast` comparator that always bubbles
  unscored rows to the bottom.
- **The contacts (warm) side** is a sibling surface. `ContactForm` is an add-form using
  `useActionState(createContact, ...)` that resets on success; `ContactCard` shows a
  contact with an inline interaction logger, a 1-5 strength bar, and a delete button,
  each firing its own Server Action against the `network` route's `mutations.ts`.
- **Graceful degradation.** `page.tsx` renders a "setup required" panel when
  `DATABASE_URL` is missing and a "load error" panel (with the raw error) when the query
  throws, so a missing migration or env var does not white-screen the page.

## Data model
Two tables. Prospects (cold/sourced) and contacts (warm/known) are deliberately separate;
a prospect can be "promoted" into a contact via `promoted_contact_id`.

```sql
create table public.prospects (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,  -- sentinel (migration 0002)
  name                 text not null,
  title                text,
  target_org           text not null,
  department           text,
  location             text,
  email                text,
  phone                text,
  linkedin_url         text,
  source               text check (source in ('apollo','manual','gmail','csv_import','web','other')),
  source_id            text,
  last_enriched_at     timestamptz,
  tenure_years         numeric(4,1),
  recent_role_change   boolean not null default false,
  seniority            text check (seniority in ('intern','assistant',...,'executive','support','other')),
  fit_score            integer check (fit_score between 0 and 100),
  accessibility_score  integer check (accessibility_score between 0 and 100),
  relationship_to_user text not null default 'unknown'
    check (relationship_to_user in ('unknown','colleague','mutual_intro_available','met_once','acquainted','close')),
  status               text not null default 'new'
    check (status in ('new','researching','queued','contacted','responded','meeting_scheduled','engaged','dead','promoted')),
  promoted_contact_id  uuid references public.contacts(id) on delete set null,
  angle                text,
  mutual_connections   text[] default '{}',
  tags                 text[] default '{}',
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- a partial unique index dedupes imports: (user_id, source, source_id) where source_id is not null

create table public.contacts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null,
  name                  text not null,
  title                 text,
  company               text,
  relationship_strength integer check (relationship_strength between 1 and 5),
  how_met               text,
  tags                  text[] default '{}',
  notes                 text,
  last_interaction_date date,
  follow_up_days        integer,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
-- public.interactions (type/date/notes, fk contact_id on delete cascade) logs touchpoints
```
Both tables carry `user_id` and a `set_updated_at` trigger. Status and relationship
are enforced as Postgres `check` constraints AND re-validated in the Server Action
against the same list (defense in depth).

## Key decisions & gotchas
- **Per-user scoping is present in the schema but bypassed in the query.** Every table
  has `user_id`, but `listProspects()` runs with **no `where user_id =` filter** and the
  write actions do not scope either. This was deliberate: the app is single-user, and the
  sentinel-filter approach silently hid any row inserted through the Neon Console with a
  different `user_id`. Migration `0002` adds a column **default** of the sentinel so manual
  inserts pick it up for free. The code comments say: when real auth (Neon Auth) lands,
  reintroduce `and user_id = ${session.userId}` on both reads and writes AND drop the
  column default. If you reuse this multi-user, that scoping is the first thing to add back.
- **Prospects vs contacts is the core distinction, not an accident.** Prospects = cold,
  sourced, ranked by `fit_score` + `accessibility_score`, moving through an outreach
  `status` pipeline. Contacts = warm, already-known people you nurture (1-5 strength,
  follow-up cadence, logged interactions). `promoted_contact_id` + the `promoted` status
  is the bridge: a prospect you actually meet becomes a contact.
- **The status pipeline is a flat enum, not a state machine.** Any select can jump to any
  status; nothing enforces `new -> contacted -> responded`. Simple and good enough for one
  operator; add transition rules if multiple people touch the same record.
- **Optimistic UI snaps forward but does not roll back on its own.** `useOptimistic`
  applies the patch immediately; the comment claims it reverts on error, but in practice the
  action's failure result is swallowed (`await update...` without inspecting `{ ok }`), so a
  failed write only corrects on the next `revalidatePath` refetch. If you need true rollback,
  read the action result and re-throw inside the transition.
- **`descNullsLast` exists so unverified rows sink.** Prospects with null `fit_score` /
  `accessibility_score` (not yet researched) always sort to the bottom regardless of
  direction, so the table top is always your best-known leads.
- **`force-dynamic` on the page.** No caching; the list is small and there is one writer,
  so freshness beats cache. Revisit if your prospect count grows large.
- **ContactCard / ContactForm import from the `network` route, not `prospects`.** They are
  the warm-contact half of the CRM and call `@/app/(dashboard)/network/mutations`
  (`createContact`, `logInteraction`, `deleteContact`, `updateContactStrength`). Those
  action files are NOT in `code/` here; copy the patterns and rewrite the SQL.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/page.tsx` | Server component: load prospects, compute stats + top picks, render table, degrade gracefully when DB is missing | `@/lib/neon` (`hasNeonConfig`, `listProspects`), `@/lib/database` (`Prospect`), local `PageHead`/`Card`/`Stat` components |
| `code/mutations.ts` | `"use server"` actions: validate + `UPDATE` status / relationship, `revalidatePath` | `@neondatabase/serverless`, `@/lib/database` (status/relationship types), `DATABASE_URL` env |
| `code/ProspectTable.tsx` | Client table: filter, sort, inline `<select>` edits with `useOptimistic` + `startTransition` | `@/lib/utils` (`cn`), `@/lib/database` (types + `*_LABELS`), `./mutations` |
| `code/ContactCard.tsx` | Warm-contact card: inline interaction logging, 1-5 strength bar, delete | `@/lib/utils`, `@/lib/database` (`Contact`, `INTERACTION_LABELS`), `@/lib/insights`, `./InsightReveal`, `network/mutations` |
| `code/ContactForm.tsx` | Add-contact form via `useActionState`, resets on success | `network/mutations` (`createContact`), `@/lib/database` (`initialMutationState`) |

Not copied but required to run: `lib/neon.ts` (HTTP client, `getSql`/`hasNeonConfig`/
`listProspects`, sentinel id), `lib/database.ts` (hand-written row types + label maps +
`MutationState`), `lib/auth.ts` (cookie-password gate, no DB), and the `network/mutations.ts`
contact actions.

## Adaptation notes
- **Types:** KIID hand-writes `Prospect`, `Contact`, the status/relationship/seniority enums,
  and the `PROSPECT_*_LABELS` / `INTERACTION_LABELS` maps in `lib/database.ts`. There is no
  ORM. If you use Prisma/Drizzle, regenerate these from your schema and keep the label maps as
  the UI display layer.
- **DB access:** swap `@neondatabase/serverless` + raw SQL for your driver. The shape to keep
  is: server-component read helper + per-mutation Server Action that ends in `revalidatePath`.
- **Auth / scoping:** decide your owner field. To go multi-user, add `where user_id = <session>`
  to every read and write, drop the `0002` column default, and pass the real session id.
- **Design tokens:** the markup leans on Tailwind classes like `bg-bg-raised`, `text-text-med`,
  `border-emerald-dim`, `badge`, `btn btn-primary`. Map these to your design system or the page
  renders unstyled.
- **Validation:** mutations re-check status/relationship against a constant array (no Zod here).
  Keep the DB `check` constraints as the real guard; the JS check is a friendly early-out.

## Provenance
- Origin files @ commit `5a1adfb`:
  - `apps/web/src/app/(dashboard)/prospects/page.tsx`
  - `apps/web/src/app/(dashboard)/prospects/mutations.ts`
  - `apps/web/src/components/dashboard/ProspectTable.tsx`
  - `apps/web/src/components/dashboard/ContactCard.tsx`
  - `apps/web/src/components/dashboard/ContactForm.tsx`
- Schema: `db/migrations/0001_initial.sql` (prospects + contacts + interactions),
  `db/migrations/0002_prospects_user_id_default.sql` (sentinel default + backfill)
- Supporting (not copied): `apps/web/src/lib/neon.ts`, `lib/database.ts`, `lib/auth.ts`,
  `app/(dashboard)/network/mutations.ts`
