# Discovery / Idea Builder

> An AI session that turns raw business or career ideas into revenue blueprints,
> grounded in the user's own profile, then persists each idea as a detail page
> with 12-month projections, KPIs, and a phased execution roadmap.

- **Slug:** `discovery-tool`
- **Tags:** `ai`, `ideation`, `dashboard`
- **Source project:** Loft (personal operating-system dashboard, Jordan's build)
- **Stack:** Next.js 15 App Router + Server Actions + Neon Postgres + Anthropic SDK
- **Reuse confidence:** adapt-the-shape (the UI + types are portable, but persistence is tied to Neon's `getSql()` + repo + sentinel-user auth, and AI grounding is tied to this dashboard's profile model)
- **Status in origin:** prototype (single-user, sentinel owner, no real multi-tenant auth)

## Problem it solves
A solo operator generates business ideas constantly but loses them, and never
pressure-tests them with numbers. This makes idea generation a structured loop:
the user describes a problem / skill / contact, the AI returns 3 to 5 grounded
revenue ideas, and each idea becomes a first-class record with a business case
(scenarios, costs, break-even, KPIs, milestones) instead of a note that rots.

## When to reach for this
- You want an "ideas in, business cases out" surface on a personal/founder dashboard.
- You already have profile/goals/skills/network data and want the AI grounded in it,
  not generic ("recommend the best one for THIS person").
- You want every idea to carry projections + KPIs + a phased roadmap, not just a title.
- You want the whole thing to render and demo with zero database (demo-seed fallback).

## How it works
- **Generate:** `SessionLauncher` (client) offers 4 entry shapes (blank / problem /
  skill / network), POSTs to `/api/chat` with `vertical="discovery"` and
  `mode="brainstorm"`. The server builds a system prompt in `lib/claude.ts` that
  leads with the user's profile answers and appends goals/skills/network/finances,
  then calls the Anthropic SDK. The reply comes back with extractable "insights"
  the user can apply into the dashboard.
- **Persist:** ideas are written via server actions in `mutations.ts`
  (`createDiscoveryIdea`, `setIdeaStatus`, `deleteDiscoveryIdea`) into
  `discovery_ideas`. Projections / KPIs / milestones are richer records seeded in
  `demo-discovery.ts` (and read from their tables when a DB is present).
- **List:** `page.tsx` reads ideas + projections via `lib/repo`, groups projections
  by `idea_id`, precomputes annual totals per idea (`computeAnnualTotals`), and
  buckets ideas into active / explored / parked with a leaderboard sidebar.
- **Detail:** `detail-page.tsx` (`/discovery/[id]`) renders the why, revenue model,
  a 12-month three-scenario chart with `actual` overlaid, computed Y1 totals,
  net-of-cost, a break-even month walk over the moderate scenario, plus the KPI
  board and phased execution roadmap.
- **Demo fallback:** when `DATABASE_URL` is unset, `getSql()` returns `null`, every
  repo read returns the `demo-discovery` seed, and every mutation returns a
  "Demo mode: changes are not persisted" success. The UI is fully explorable dry.

## Data model
Four tables (Postgres), all keyed to a `user_id` and cascading off the idea:
```sql
discovery_ideas (
  id uuid pk, user_id uuid, session_id uuid -> ai_sessions(id) on delete set null,
  name text not null, one_line_pitch, why_jordan, revenue_model, target_customer,
  startup_cost_estimate, time_to_first_dollar,
  effort_level  check in ('low','medium','high'),
  risk_level    check in ('low','medium','high'), risk_explanation,
  comparison_score int check between 1 and 100,
  status text default 'explored' check in ('explored','active','parked','killed'),
  assumptions jsonb default '{}',           -- { conservative, moderate, aggressive } prose
  execution_phase check in ('validate','build','launch','grow','optimize'),
  created_at, updated_at
)
revenue_projections (
  id, idea_id -> discovery_ideas on delete cascade, user_id,
  month 1..12, year, conservative, moderate, aggressive numeric(12,2),
  actual numeric(12,2) null, monthly_costs numeric(12,2), notes,
  unique (idea_id, year, month)
)
idea_kpis      ( idea_id (cascade), kpi_name, kpi_target, kpi_actual, month, year, category )
idea_milestones( idea_id (cascade), phase (same 5-phase enum), title, description,
                 status check in ('pending','done'), due_date, completed_at, sort_order )
```
Note `why_jordan` is a literal column name (the owner is "Jordan"). It is the
"why is this person the right one to build this" field, rename it for any other user.

## Key decisions & gotchas
- **Projections are the slow part, ideas are the cheap part.** Only the idea itself
  is created through a server action. Revenue curves, KPIs, and milestones are richer
  records that the prototype only ships as demo seed. A future build needs its own
  write path (or AI generation) for those, the read + render side is already done.
- **Demo-vs-real is a hard binary on `DATABASE_URL`.** No `DATABASE_URL` means every
  read returns the seed and every write silently no-ops with an "ok" demo message.
  This keeps the page renderable in a portfolio/dry environment, but it also means a
  misconfigured env looks like success while persisting nothing. Watch for that.
- **AI grounding leads with the profile, not the prompt.** In `lib/claude.ts` the
  profile block is pushed to the front of the system prompt because it is the
  strongest signal of who the user is; `vertical="discovery"` narrows the questionnaire
  to discovery-relevant answers and appends a deterministic next-step list so the model
  builds on grounded moves instead of inventing generic ones. Idea quality depends on
  this context existing, with an empty profile you get generic output.
- **`assumptions` is prose JSON, not numbers.** It holds one sentence per scenario
  (e.g. "8 agencies x 8 seats by month 12"). The actual scenario math lives in
  `revenue_projections`. The detail page surfaces the moderate assumption as a caption
  next to the chart, the two are intentionally decoupled.
- **Break-even is computed at render, not stored.** The detail page walks projections
  in month order accumulating `moderate - monthly_costs` and reports the first month
  cumulative net crosses zero. No break-even column exists.
- **Money formatting differs by page.** Both pages carry a local `formatMoney`; the
  detail copy handles negatives (net can be negative) with a minus sign, the list copy
  does not. They are deliberately duplicated, not shared.
- **Single-owner by sentinel.** Writes hardcode `DEMO_SENTINEL_USER_ID`
  (`OWNER_USER_ID` env or a fixed UUID). There is no per-request auth; this is a
  one-user dashboard. Multi-tenant use needs a real `user_id` from session.
- **Pages are `noindex` and the detail page is `force-dynamic`** (private dashboard).

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/page.tsx` | Discovery index: stats, add-idea form, session launcher, active/explored/parked buckets, leaderboard | `@/lib/repo` (`listDiscoveryIdeas`, `listRevenueProjections`), `@/components/dashboard/*` (PageHead, Card, Stat, SessionLauncher, IdeaCard, Leaderboard, DiscoveryIdeaForm) |
| `code/detail-page.tsx` | `/discovery/[id]`: why + revenue model, 12-month scenario chart, Y1 totals, break-even, KPI board, execution roadmap | `@/lib/repo` (idea/projection/milestone/kpi reads), `@/components/dashboard/discovery/*` (RevenueChart, ExecutionRoadmap, KPIBoard), `@/lib/utils` (`cn`) |
| `code/mutations.ts` | Server actions: create / set-status / delete idea, with demo-mode no-op | `@/lib/neon` (`getSql`, `DEMO_SENTINEL_USER_ID`), `@/lib/database` (types), `next/cache` (`revalidatePath`) |
| `code/discovery-types.ts` | Row types for all 4 tables + label maps + `computeAnnualTotals` (pure) | `@/lib/database` (enum types only) |
| `code/demo-discovery.ts` | Tailored demo seed (ideas, scenario curves, milestones, KPIs) + per-idea getters | `@/lib/discovery-types` (types only) |

**Shared deps you do NOT copy (swap these):**
- `lib/claude.ts` (Anthropic SDK wrapper, builds the profile-grounded system prompt, called via `/api/chat`).
- `lib/repo.ts` (the demo-vs-real read layer; each function returns the demo seed when `getSql()` is null).
- `lib/database.ts` (the `IdeaStatus` / `IdeaEffort` / `IdeaRisk` / `ExecutionPhase` enums + `MutationState`).
- `lib/auth.ts` and the sentinel-user model (`lib/neon.ts` `getSql` + `DEMO_SENTINEL_USER_ID`).
- UI primitives under `components/dashboard/` and `components/dashboard/discovery/` (RevenueChart etc.).

## Adaptation notes
- Rename the `why_jordan` column/field to something user-neutral, and replace the
  sentinel-owner writes with a real `user_id` from your session/auth.
- Re-point the AI generation: `/api/chat` + `lib/claude.ts` are Loft-specific. Keep the
  shape (profile-first system prompt, return structured insights) but wire your own
  Anthropic key, profile model, and `vertical` routing. Without a profile source the
  output degrades to generic.
- Map the 4 tables into your schema and provide your own write path for projections /
  KPIs / milestones (the prototype only seeds them). Decide whether the AI generates
  these or the user enters them.
- Swap `@/lib/repo` + `@/lib/neon` for your data layer, or keep the demo-fallback
  pattern (read returns seed + mutation returns demo-ok when no DB) if you want the
  zero-config-renders property.
- Tune the demo seed in `demo-discovery.ts` to your owner, and replace the dashboard
  UI primitives (Card / Stat / chart) with your design system.

## Provenance
- Origin files @ `5a1adfb`:
  - `apps/web/src/app/(dashboard)/discovery/page.tsx`
  - `apps/web/src/app/(dashboard)/discovery/[id]/page.tsx`
  - `apps/web/src/app/(dashboard)/discovery/mutations.ts`
  - `apps/web/src/lib/discovery-types.ts`
  - `apps/web/src/lib/demo-discovery.ts`
  - schema: `db/migrations/0001_initial.sql` (discovery_ideas / revenue_projections / idea_kpis / idea_milestones)
- Shared deps (not copied): `apps/web/src/lib/claude.ts`, `lib/repo.ts`, `lib/database.ts`, `lib/auth.ts`, `lib/neon.ts`, `components/dashboard/discovery/*`
