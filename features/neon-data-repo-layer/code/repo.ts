/**
 * Server-side data access for the dashboard.
 *
 * Each list helper queries Neon via the HTTP driver when DATABASE_URL
 * is set, and falls back to the demo seed in src/lib/demo-data.ts when
 * it is not. Pages call these instead of importing demo data directly
 * so the same component tree works in both modes without changes.
 *
 * Server only. Importing from a client component will pull the DB
 * connection string into the client bundle and fail the build.
 */

import { getSql } from "@/lib/neon";
import { listProspects as _listProspectsFromNeon } from "@/lib/neon";
import {
  demoActions,
  demoContacts,
  demoCareerEvents,
  demoFinances,
  demoGoals,
  demoJournalEntries,
  demoProfileQuestionnaire,
  demoSkills
} from "@/lib/demo-data";
import {
  demoIdeas,
  demoRevenueProjections,
  demoMilestones,
  demoKPIs
} from "@/lib/demo-discovery";
import type {
  Action,
  CareerEvent,
  Contact,
  Finance,
  Goal,
  JournalEntry,
  ProfileQuestionnaire,
  Prospect,
  Skill
} from "@/lib/database";
import type {
  DiscoveryIdea,
  RevenueProjection,
  DiscoveryIdeaMilestone,
  IdeaKPI
} from "@/lib/discovery-types";

/**
 * List queries no longer filter by the sentinel user_id. The app is
 * still single-user (no Neon Auth yet) and the sentinel filter was
 * hiding rows inserted through the Neon Console, the seed scripts, or
 * any out-of-band path that used a different uuid. Migration 0003 sets
 * a column default on every user-scoped table so future inserts still
 * pick up the sentinel automatically. When Neon Auth lands, reintroduce
 * `where user_id = ${session.userId}` here and drop the defaults.
 */

// ─── Goals ──────────────────────────────────────────────────────────

export async function listGoals(): Promise<Goal[]> {
  const sql = getSql();
  if (!sql) return demoGoals;
  try {
    const rows = await sql`
      select * from public.goals
      order by created_at desc
    `;
    return rows as unknown as Goal[];
  } catch (err) {
    console.error("listGoals", (err as Error).message);
    return [];
  }
}

// ─── Actions ────────────────────────────────────────────────────────

export async function listActions(): Promise<Action[]> {
  const sql = getSql();
  if (!sql) return demoActions;
  try {
    const rows = await sql`
      select * from public.actions
      order by created_at desc
    `;
    return rows as unknown as Action[];
  } catch (err) {
    console.error("listActions", (err as Error).message);
    return [];
  }
}

// ─── Contacts ───────────────────────────────────────────────────────

export async function listContacts(): Promise<Contact[]> {
  const sql = getSql();
  if (!sql) return demoContacts;
  try {
    const rows = await sql`
      select * from public.contacts
      order by created_at desc
    `;
    return rows as unknown as Contact[];
  } catch (err) {
    console.error("listContacts", (err as Error).message);
    return [];
  }
}

// ─── Career events ──────────────────────────────────────────────────

export async function listCareerEvents(): Promise<CareerEvent[]> {
  const sql = getSql();
  if (!sql) return demoCareerEvents;
  try {
    const rows = await sql`
      select * from public.career_events
      order by date desc
    `;
    return rows as unknown as CareerEvent[];
  } catch (err) {
    console.error("listCareerEvents", (err as Error).message);
    return [];
  }
}

// ─── Skills ─────────────────────────────────────────────────────────

export async function listSkills(): Promise<Skill[]> {
  const sql = getSql();
  if (!sql) return demoSkills;
  try {
    const rows = await sql`
      select * from public.skills
      order by created_at desc
    `;
    return rows as unknown as Skill[];
  } catch (err) {
    console.error("listSkills", (err as Error).message);
    return [];
  }
}

// ─── Finances ───────────────────────────────────────────────────────

export async function listFinances(): Promise<Finance[]> {
  const sql = getSql();
  if (!sql) return demoFinances;
  try {
    const rows = await sql`
      select * from public.finances
      order by year desc, month desc
    `;
    return rows as unknown as Finance[];
  } catch (err) {
    console.error("listFinances", (err as Error).message);
    return [];
  }
}

// ─── Journal entries ────────────────────────────────────────────────

export async function listJournalEntries(): Promise<JournalEntry[]> {
  const sql = getSql();
  if (!sql) return demoJournalEntries;
  try {
    const rows = await sql`
      select * from public.journal_entries
      order by date desc
    `;
    return rows as unknown as JournalEntry[];
  } catch (err) {
    console.error("listJournalEntries", (err as Error).message);
    return [];
  }
}

// ─── Discovery ideas ────────────────────────────────────────────────

export async function listDiscoveryIdeas(): Promise<DiscoveryIdea[]> {
  const sql = getSql();
  if (!sql) return demoIdeas;
  try {
    const rows = await sql`
      select * from public.discovery_ideas
      order by comparison_score desc nulls last, created_at desc
    `;
    return rows as unknown as DiscoveryIdea[];
  } catch (err) {
    console.error("listDiscoveryIdeas", (err as Error).message);
    return [];
  }
}

export async function listRevenueProjections(): Promise<RevenueProjection[]> {
  const sql = getSql();
  if (!sql) return demoRevenueProjections;
  try {
    const rows = await sql`
      select * from public.revenue_projections
      order by year, month
    `;
    return rows as unknown as RevenueProjection[];
  } catch (err) {
    console.error("listRevenueProjections", (err as Error).message);
    return [];
  }
}

export async function listMilestonesForIdea(
  ideaId: string
): Promise<DiscoveryIdeaMilestone[]> {
  const sql = getSql();
  if (!sql) return demoMilestones.filter((m) => m.idea_id === ideaId);
  try {
    const rows = await sql`
      select * from public.idea_milestones
      where idea_id = ${ideaId}
      order by phase, sort_order
    `;
    return rows as unknown as DiscoveryIdeaMilestone[];
  } catch (err) {
    console.error("listMilestonesForIdea", (err as Error).message);
    return [];
  }
}

export async function listKPIsForIdea(ideaId: string): Promise<IdeaKPI[]> {
  const sql = getSql();
  if (!sql) return demoKPIs.filter((k) => k.idea_id === ideaId);
  try {
    const rows = await sql`
      select * from public.idea_kpis
      where idea_id = ${ideaId}
      order by year, month
    `;
    return rows as unknown as IdeaKPI[];
  } catch (err) {
    console.error("listKPIsForIdea", (err as Error).message);
    return [];
  }
}

// ─── Prospects ──────────────────────────────────────────────────────
// Re-exported here so api/chat can pull from the same consistent repo
// layer. Falls back to empty array (no demo seed for prospects) when
// DATABASE_URL is missing.

export async function listProspects(): Promise<Prospect[]> {
  const sql = getSql();
  if (!sql) return [];
  try {
    return await _listProspectsFromNeon();
  } catch (err) {
    console.error("listProspects", (err as Error).message);
    return [];
  }
}

// ─── Profile questionnaire ──────────────────────────────────────────

/**
 * Loads Jordan's single questionnaire row. Returns the demo seed when
 * DATABASE_URL is missing OR when the row hasn't been created yet, so
 * the profile form always has something to render. Once the owner
 * saves any section, the upsert in profile/mutations.ts creates the
 * real row and subsequent reads return it verbatim.
 */
export async function getProfileQuestionnaire(): Promise<ProfileQuestionnaire> {
  const sql = getSql();
  if (!sql) return demoProfileQuestionnaire;
  try {
    const rows = (await sql`
      select * from public.profile_questionnaire
      order by updated_at desc
      limit 1
    `) as unknown as ProfileQuestionnaire[];
    if (rows.length === 0) return demoProfileQuestionnaire;
    return rows[0];
  } catch (err) {
    console.error("getProfileQuestionnaire", (err as Error).message);
    return demoProfileQuestionnaire;
  }
}
