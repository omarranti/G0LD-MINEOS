# Career Timeline + Skills Inventory

> A career surface for a personal-OS dashboard: a reverse-chronological timeline
> of career events plus a categorized skills inventory with a 1-10 proficiency
> rating, both editable on Server Actions, and both fed into the AI context as
> grounding for strategy answers.

<!-- Capture the STRUCTURE, not the skin. -->

- **Slug:** `career-timeline-skills`
- **Tags:** `career`, `timeline`, `skills`, `dashboard`, `ai-grounding`
- **Source project:** KIID (personal OS dashboard)
- **Stack:** Next.js 15 App Router + Server Actions + Neon Postgres (`@neondatabase/serverless` HTTP driver)
- **Reuse confidence:** adapt-the-shape (the two data models, the timeline sort, the proficiency-dot pattern and the AI-grounding hook are the value; every file is wired to KIID's `lib/neon`, `lib/database`, `lib/repo`, `lib/insights` and Tailwind design tokens, so they need rehoming)
- **Status in origin:** live (single-user app behind a password cookie)

## Problem it solves
A personal operating dashboard needs two long-lived inputs that the AI advisor can
reason over: a record of what the owner has actually done (the timeline) and an
honest inventory of what they can do and how well (skills). The career surface lets
the owner log events as they happen and rate skills inline, then both feed the
strategy AI so its advice is grounded in real history and real capability instead
of generic prompting.

## When to reach for this
- You want two sibling CRUD lists on one page: an append-mostly event log sorted
  newest-first, and a rated inventory grouped by category.
- You want a 1-10 rating you click rather than type (a row of dots), with the bar
  painting optimistically before the round-trip.
- You want a "current vs target" split on the inventory (things you have vs things
  you want), rendered as separate sections off one boolean flag.
- You want the surface to double as AI context: top-N items by rating get
  serialized into the model's grounding block.
- You want Server-Action mutations (no client fetch layer, no API routes) with a
  demo-mode fallback so the page renders with no database.

## How it works
- The page is a server component: `listCareerEvents()` and `listSkills()` run in a
  `Promise.all`, then everything is partitioned in memory. Events are re-sorted
  newest-first by `date.localeCompare`. Skills split on `is_target` into
  current vs target, and the current set is grouped into a
  `Record<category, Skill[]>` for the section headers.
- Timeline ordering is enforced twice: `listCareerEvents` does `order by date desc`
  in SQL, and the page sorts again client-side (defensive, since the demo array and
  any out-of-order insert still need to render newest-first).
- Every write is a Server Action in `mutations.ts` (`"use server"`):
  create-event / delete-event / create-skill / set-proficiency / delete-skill.
  Each grabs the Neon client, runs one parameterized statement, then `refresh()`.
- `refresh()` is `revalidatePath("/career")` plus `/dashboard`, because the
  dashboard reads skills for the AI context.
- `SkillItem` is the only optimistic component: `useOptimistic` holds the
  proficiency value so clicking dot N paints immediately, and the real action runs
  inside `useTransition`. The dot color keys off `is_target` (amber for target,
  emerald for current).
- `CareerEventForm` uses `useActionState` against `createCareerEvent`; on
  `state.ok === true` it resets via a ref. Tags are a single comma-separated input
  parsed into a `text[]` server-side.
- AI grounding (in `lib/claude.ts`, not copied): skills are filtered to non-target,
  sorted by proficiency desc, top 5 taken, and emitted as a `## Top skills`
  markdown block (`- name (n/10)`) into the model context. Career events feed the
  same context object but the copied page is what populates the timeline the AI
  reasons against.

## Data model
The `career_events` and `skills` tables (Postgres, `0001_initial.sql`):
```sql
create table if not exists public.career_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  title          text not null,
  description    text,
  date           date not null,
  category       text check (category in ('work','creative','personal','financial')),
  tags           text[] default '{}',
  evidence_type  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists career_events_user_idx on public.career_events(user_id);
create index if not exists career_events_date_idx on public.career_events(user_id, date desc);

create table if not exists public.skills (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  name         text not null,
  category     text check (category in ('technical','interpersonal','creative','industry')),
  proficiency  integer check (proficiency between 1 and 10),
  is_target    boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists skills_user_idx on public.skills(user_id);
```
Notes on the shape:
- `career_events.date` is the load-bearing sort key (a real date, distinct from
  `created_at`), so you can log a past event and it still sorts correctly.
  `career_events_date_idx` is `(user_id, date desc)` to back the timeline query.
- `tags text[]` is a native Postgres array; the form sends a comma string and the
  action parses + filters empties.
- `evidence_type` exists in the table and `CareerEvent` type but is never written
  or read in this feature. Dead column carried over; drop it unless you wire it.
- `skills.proficiency` is 1-10 (DB `check`), nullable (a skill can be unrated, the
  UI shows ", "). `is_target` is the single flag that drives the current/target
  split everywhere. `notes` is in the type but unused by the copied files.
- An `updated_at` trigger (`set_updated_at`) is shared across all tables in the
  schema.

## Key decisions & gotchas
- **Proficiency is optimistic, deletes are not.** Clicking a dot applies
  `useOptimistic` so the bar moves before the round-trip; delete just runs in the
  transition and waits for revalidation (an optimistic delete would need the
  section-partition render to drop the row, which it does not support cleanly).
- **Rating is clamped twice.** `createSkill` and `updateSkillProficiency` both do
  `Math.max(1, Math.min(10, Math.round(n)))` server-side, never trusting the
  client value, on top of the SQL `check`.
- **Current vs target is one boolean, three render branches.** `is_target` splits
  the list into the grouped "Skills" section (current, grouped by category) and a
  flat "Target skills" section. The dot color also forks on it. If you add more
  states, this boolean has to become an enum.
- **Category grouping tolerates nulls.** Skills with no category fall into an
  `"uncategorized"` bucket rendered as "Other"; events with a null category just
  carry none. Both category sets are validated against an allowlist in the action
  and a SQL `check`, so the union is duplicated in three places per table
  (`*_CATEGORIES` const in `mutations.ts`, `*_CATEGORY_LABELS` in `database.ts`,
  the SQL `check`) and must stay in sync.
- **Demo-mode fallback is load-bearing.** Every mutation checks `getSql()`; if
  `DATABASE_URL` is missing it returns `{ ok: true, message: "Demo mode..." }`
  instead of throwing, and the `list*` repo functions return seeded demo arrays.
  This is what lets the page render in a static build or local dev with no DB.
- **No `user_id` guard on writes-by-id.** `createCareerEvent` / `createSkill`
  insert with the `DEMO_SENTINEL_USER_ID` sentinel, but `deleteCareerEvent`,
  `deleteSkill`, and `updateSkillProficiency` match on `id` alone. Fine for a
  single-user app, must add `user_id = ${session.userId}` before multi-user.
- **Events are append/delete only.** There is no edit-event action; to fix a typo
  you delete and re-add. Deliberate minimalism, re-litigate if you need editing.
- **Errors surface as raw messages.** Mutations return `(err as Error).message`
  straight to the form status line. Leaks DB detail in a multi-tenant build.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/page.tsx` | Server component: parallel-fetch events + skills, sort timeline desc, split skills into current/target, group current by category, render the cards + empty state | `@/components/dashboard/*` (`PageHead`, `Card`, `CareerEventItem`, `SkillForm`), `@/lib/database` (`Skill`, `SkillCategory`, `SKILL_CATEGORY_LABELS`), `@/lib/repo` (`listCareerEvents`, `listSkills`), `@/lib/insights` (`getInsight`) |
| `code/mutations.ts` | Server Actions: create/delete event, create/set-proficiency/delete skill, each + `revalidatePath`; category allowlists; tag parser; proficiency clamp | `@/lib/neon` (`getSql`, `DEMO_SENTINEL_USER_ID`), `@/lib/database` types (`CareerCategory`, `SkillCategory`, `MutationState`) |
| `code/CareerEventForm.tsx` | Client create form on `useActionState`, self-resetting, date defaults to today, category select, comma-tags input, inline status | `@/app/(dashboard)/career/mutations` (`createCareerEvent`), `@/lib/database` (`initialMutationState`, `CAREER_CATEGORY_LABELS`, `CareerCategory`) |
| `code/SkillItem.tsx` | Client skill row: 10-dot optimistic proficiency, target badge, delete; color forks on `is_target` | `@/lib/utils` (`cn`), `@/app/(dashboard)/career/mutations` (`updateSkillProficiency`, `deleteSkill`), `@/lib/database` (`Skill`), `@/lib/insights` (`CardInsight`), sibling `InsightReveal` |

Not copied but referenced and needed when porting: `CareerEventItem` and
`SkillForm` (siblings, same dashboard primitives), `lib/neon.ts` (Neon HTTP client +
sentinel id), `lib/database.ts` (`CareerEvent` / `Skill` types, the two category
unions + label records, `MutationState`, `initialMutationState`), `lib/repo.ts`
(`listCareerEvents` / `listSkills` with demo fallback), `lib/utils.ts` (`cn`),
`lib/insights` + `InsightReveal`, and the `lib/claude.ts` `## Top skills` grounding
block if you want the AI-context tie-in.

## Structure to keep, skin to drop
- **Keep (the idea):**
  - The two data models: `career_events` (event log with a real `date` sort key,
    nullable category, `text[]` tags) and `skills` (rated 1-10, nullable category,
    `is_target` boolean).
  - Timeline ordering: sort by `date desc` (SQL + in-memory belt-and-braces).
  - The proficiency shape: integer 1-10, nullable = unrated, clamped server-side,
    rendered as a clickable dot row with optimistic paint.
  - The current/target split off a single boolean, and category grouping that
    tolerates nulls into an "Other" bucket.
  - The AI-grounding hook: top-N skills by proficiency serialized into the model
    context (`- name (n/10)`); keep this even if you restyle everything else, it is
    why the surface earns its keep beyond a plain CRUD list.
- **Drop (regenerate natively):** the `<ol>`/timeline visual styling, the dot
  colors (`bg-emerald` / `bg-amber`), every Tailwind design-token class
  (`bg-bg-raised`, `border-border`, `text-text-dim`, `font-mono` micro-labels,
  `btn`/`badge` classes), the `Card` chrome, the copy ("Timeline of where you've
  been...", empty-state text), and the spacing scale. Rebuild the timeline and the
  rating bar to match the destination project; do not paste these classes in.

## Adaptation notes
- Run the `career_events` + `skills` slice of `0001_initial.sql` as a migration, or
  fold the columns into your existing schema. Drop `evidence_type` and `notes`
  unless you wire them.
- Replace the `@/lib/database` import surface with your own `CareerEvent` / `Skill`
  types, the two category unions, and the `*_CATEGORY_LABELS` records (the form and
  page read those records directly for dropdowns and section headers).
- Swap `@/lib/neon` for your DB client. If not single-user, add
  `user_id = ${session.userId}` to every statement (especially the three that match
  on `id` alone) and remove the `DEMO_SENTINEL_USER_ID` sentinel.
- Re-point the `@/app/(dashboard)/career/mutations` import paths in the two client
  components to wherever the actions land.
- `getInsight` / `InsightReveal` are KIID's AI-insight overlay; pass `undefined`
  and delete the `InsightReveal` line if you have no equivalent.
- Retune the `revalidatePath` targets (drop `/dashboard` if skills are not
  cross-referenced) and recreate the AI-grounding block in your own model-context
  builder if you want the strategy tie-in.
- Restyle from scratch per "Structure to keep, skin to drop."

## Provenance
- Origin files (KIID, commit `5a1adfb`):
  - `apps/web/src/app/(dashboard)/career/page.tsx`
  - `apps/web/src/app/(dashboard)/career/mutations.ts`
  - `apps/web/src/components/dashboard/CareerEventForm.tsx`
  - `apps/web/src/components/dashboard/SkillItem.tsx`
  - Schema: `db/migrations/0001_initial.sql` (`public.career_events`, `public.skills`)
- Shared deps referenced: `apps/web/src/lib/{neon,database,repo,utils,insights,claude}.ts`
- Related features: [[goal-idea-builder]]
- Related memory: `project_loft.md`
