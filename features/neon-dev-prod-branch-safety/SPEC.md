# Neon Dev/Prod Branch Safety

> A dev database that is a real copy-on-write branch of production, with a guard that physically refuses to run destructive commands against the prod endpoint, so a stray `prisma db push` can never hit customer data.

- **Slug:** `neon-dev-prod-branch-safety`
- **Tags:** `infra, neon, database, safety, postgres, prisma`
- **Source project:** web app (Vercel + Neon Postgres)
- **Stack:** Neon branches + Prisma + a Node guard script
- **Reuse confidence:** reference-only
- **Status in origin:** live in prod

## Problem it solves
With Neon, "dev" and "prod" are two branches of one project that share a role password (Neon copies it on fork). It is trivially easy to point `.env.local` at the production endpoint. The dev server then queries prod on every request, and one schema experiment or `db push` writes straight to customer data. The blast radius is your whole database, and nothing warns you.

## When to reach for this
- You run Neon (or any branched Postgres) with separate dev and prod endpoints.
- Local dev and Vercel prod both read `DATABASE_URL`, and the only difference is which host it points at.
- You want a hard stop, not a convention, between "experiment freely" and "touch customer data."

## How it works
1. **Two branches, explicit roles.** `production` = source of truth, written only by the prod deploy. `dev` = a copy-on-write branch for local dev and schema experiments. Each has its own endpoint host.
2. **Env routing is the only difference.** `.env.local DATABASE_URL` -> dev host. Vercel prod env `DATABASE_URL` -> prod host. Same schema, same role, different host.
3. **A guard script, not a habit.** Destructive npm scripts run `db-guard.mjs` first. It reads `DATABASE_URL`, extracts the host, and exits non-zero if the host matches a production marker. `prisma db push` never runs against prod because the `&&` short-circuits.
4. **Refresh dev from prod cheaply.** Because branches are copy-on-write, resetting dev to the latest prod data (Neon `reset_from_parent`, optionally snapshotting current dev first) is fast and near-free.

## Data model
Operational, not schema. The moving parts:
- Two Neon branches (`production`, `dev`), each with a distinct endpoint host.
- `DATABASE_URL` in `.env.local` (dev) vs Vercel prod env (prod).
- `PROD_DB_HOST_MARKERS` (env): comma-separated substrings of the prod host the guard refuses.

## Key decisions & gotchas
- **Never `npx prisma db push` directly.** Always go through the guarded script. The direct command has no idea which branch it is about to mutate.
- **Watch for a stale third `DATABASE_URL`.** In the origin a leftover `.env` pointed at a *different* Neon project entirely. Three env files, three hosts, one right answer. audit them.
- **Keep real host ids out of the repo.** The guard loads production markers from an env var, not source, so the production endpoint id is never committed. (This library entry ships with placeholders only.)
- **Shared password is a footgun.** Since both branches share the role password, "it's just dev creds" is false. dev creds open prod too. The host guard is what actually separates them.
- **Reference-only:** the exact branch names, endpoint hosts, and Neon project id are environment-specific and intentionally not included.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/db-guard.mjs` | Reads `DATABASE_URL`, refuses to proceed if the host matches a production marker. Chain before any destructive Prisma command. | `PROD_DB_HOST_MARKERS` env, Node |

## Structure to keep, skin to drop
- **Keep (the idea):** dev-as-a-branch-of-prod, env-host routing as the sole difference, and a guard that fails closed on the prod host before any destructive command.
- **Drop (regenerate natively):** the specific branch names, endpoint hosts, project id, and the exact npm script names. all environment-specific.

## Adaptation notes
- Create a Neon `dev` branch off `production`. Put its endpoint in `.env.local DATABASE_URL`; leave the Vercel prod env pointed at `production`.
- Add to `package.json`: `"db:push:dev": "node scripts/db-guard.mjs && prisma db push"` (and similar for `migrate`).
- Set `PROD_DB_HOST_MARKERS` to substrings of your prod endpoint host (e.g. the Neon endpoint id). Never hardcode them.
- Not on Neon? The same guard works for any two-host dev/prod Postgres split.

## Provenance
- Origin: `.agents/neon-branch-workflow.md` + `scripts/db-guard.mjs` @ `origin/main` (Vercel + Neon web app, live). Genericized: real project id, branch names, and endpoint hosts removed; the guard and workflow intact.
- Related features: [[neon-data-repo-layer]]
- Related memory: local vs Vercel = different Neon DBs.
