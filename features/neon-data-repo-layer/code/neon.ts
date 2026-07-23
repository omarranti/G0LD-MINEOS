/**
 * Neon Postgres query helpers. Server-only — never import from client
 * components. Uses the @neondatabase/serverless HTTP driver, which is
 * the canonical pattern for Next.js + Vercel + Neon and works in both
 * the Edge and Node runtimes without connection pooling concerns.
 *
 * The Loft app currently runs single-user (cookie password gate, no
 * Supabase Auth, no Neon Auth yet), so all rows are scoped to a
 * sentinel user_id placeholder until real auth is wired up. See
 * db/seed/wme_la_initial.sql for the seed.
 */

import { neon } from "@neondatabase/serverless";
import type { Prospect } from "./database";

/**
 * Sentinel user_id used while auth is not yet provisioned. Every
 * row is owned by this id; once Neon Auth lands we'll do a one-shot
 * UPDATE to migrate to the real auth user id and add the FK
 * constraint. Override via the OWNER_USER_ID env var if needed.
 */
export const DEMO_SENTINEL_USER_ID =
  process.env.OWNER_USER_ID ?? "00000000-0000-0000-0000-000000000001";

let cached: ReturnType<typeof neon> | null = null;

/**
 * Non-throwing variant. Returns a cached Neon HTTP client when
 * DATABASE_URL is set, or `null` otherwise so pages can gracefully
 * fall back to the in-memory demo seed during local dev and static
 * builds without any DB configuration. Prefer this over `client()`
 * for new code.
 */
export function getSql(): ReturnType<typeof neon> | null {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  cached = neon(url);
  return cached;
}

/** Throwing variant retained for the prospects module. */
function client() {
  const sql = getSql();
  if (!sql) {
    throw new Error(
      "Missing DATABASE_URL. Set it in apps/web/.env.local or via the Vercel Neon integration."
    );
  }
  return sql;
}

/**
 * Returns true when Neon is reachable from this server context.
 * Used by pages to gracefully degrade when DATABASE_URL is missing
 * (e.g. during a static build with no env vars).
 */
export function hasNeonConfig(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Lists all prospects, ordered by fit then accessibility. Both scores
 * can be null for unverified rows; `nulls last` keeps those at the
 * bottom.
 *
 * No user_id filter — the app is still single-user and the sentinel
 * design was causing rows inserted through the Neon Console with any
 * other user_id to vanish from the dashboard. Migration 0002 adds a
 * column default so future manual inserts pick up the sentinel
 * automatically. Once Neon Auth lands, reintroduce `where user_id =
 * ${session.userId}` and drop the column default.
 */
export async function listProspects(): Promise<Prospect[]> {
  const sql = client();
  const rows = await sql`
    select
      id,
      user_id,
      name,
      title,
      target_org,
      department,
      location,
      email,
      phone,
      linkedin_url,
      source,
      source_id,
      last_enriched_at,
      tenure_years,
      recent_role_change,
      seniority,
      fit_score,
      accessibility_score,
      relationship_to_user,
      status,
      promoted_contact_id,
      angle,
      mutual_connections,
      tags,
      notes,
      created_at,
      updated_at
    from public.prospects
    order by
      fit_score desc nulls last,
      accessibility_score desc nulls last,
      name asc
  `;
  return rows as unknown as Prospect[];
}
