# Finances + Runway

> Track monthly income, expenses, and a savings snapshot, then compute runway
> (months of cash left) from the recent burn rate.

- **Slug:** `finances-runway`
- **Tags:** `finance`, `runway`, `dashboard`
- **Source project:** KIID
- **Stack:** Next.js 15 App Router + Server Actions + Neon Postgres (raw SQL, no ORM)
- **Reuse confidence:** reference-only (the runway math is the portable kernel; the files are wired to KIID's data layer and design system)
- **Status in origin:** live (single-user personal OS)

## Problem it solves
A founder/operator wants a dead-simple personal runway readout: how many months
until the money runs out, from real monthly entries, without a spreadsheet or a full
accounting tool.

## When to reach for this
- You want a "months of runway left" number driven by a few monthly figures.
- A monthly income/expense log is enough; you do not need transaction-level accounting.
- You want the math isolated and testable, with the UI as a thin shell over it.

## How it works
- Each month is one row: income, side income, five expense buckets, and a point-in-time
  `savings` snapshot. `FinanceForm` upserts a row (keyed on `unique(user_id, year, month)`).
- `netMonthly = income + side_income - totalExpenses`; `totalExpenses` sums the five buckets.
- `computeRunwayMonths(history)` (history newest-first): take the latest month's
  `savings`, divide by the average burn over the last `min(3, N)` months. Burn per month
  counts only negative-net months (positive months contribute 0). If average burn is
  `<= 0`, runway is `Infinity` (net positive). Empty history returns `null`.
- `RunwayCard` maps the three-state result to `-` / `infinity` / `toFixed(1)`.

## Data model
The `finances` table slice (from `db/migrations/0001_initial.sql`): `user_id`, `year`,
`month`, `income`, `side_income`, five expense columns, `savings`, all
`numeric(12,2)`, with `unique(user_id, year, month)`.

## Key decisions & gotchas
- **Savings is a snapshot column, not accumulated.** Runway = snapshot / avg burn, so a
  stale or mistyped savings figure skews runway directly.
- **3-month rolling burn** smooths spiky months, but positive-cash-flow months are
  floored to 0 burn (they cannot offset negative months inside the average), so a single
  overspend month can show a finite runway even when you are net positive overall.
- **Three-state return** (`null` / `Infinity` / number) must be handled by every caller.
- **`numeric(12,2)` returns as strings** from Postgres, so the code wraps values in
  `Number()`; display rounds to whole dollars with a custom formatter, not
  `Intl.NumberFormat`.
- **Single-user sentinel.** Rows key to a hardcoded `DEMO_SENTINEL_USER_ID`; there is no
  real auth/session. `getSql()` returning null means demo mode (mutations no-op, repo
  returns fixtures).
- The edit form locks month/year when editing so the upsert conflict target stays stable.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/page.tsx` | Server component: load history, render runway + entries | `@/lib/repo` (listFinances), `@/lib/neon` (getSql, sentinel id) |
| `code/mutations.ts` | Server action upsert of a month row | `@/lib/database`, `@/lib/neon` |
| `code/FinanceForm.tsx` | Add/edit a month, locks month+year on edit | project Tailwind tokens, `Card`/`PageHead` |
| `code/RunwayCard.tsx` | Renders the three-state runway result | `@/lib/database` (`computeRunwayMonths`) |

## Adaptation notes
- The reusable kernel is `computeRunwayMonths` + `netMonthly` + `totalExpenses` (in the
  origin's `lib/database.ts`, not copied). Lift those first, then rebuild the form.
- Replace the Neon `getSql`/sentinel data layer with your DB + real auth.
- Swap the design-system classes (`.card`, `.stat-value`, custom Tailwind tokens).

## Provenance
- Origin files: `Loft/apps/web/src/app/(dashboard)/finances/{page.tsx,mutations.ts}`,
  `components/dashboard/{FinanceForm,RunwayCard}.tsx` @ `5a1adfb`
  (runway math in `apps/web/src/lib/database.ts`)
- Related features: [[goal-idea-builder]], [[smart-chat-over-data]]
