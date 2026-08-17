"use server";

import { revalidatePath } from "next/cache";
import { neon } from "@neondatabase/serverless";
import type {
  ProspectStatus,
  ProspectRelationship
} from "@/lib/database";

/**
 * Server actions for the prospects page.
 *
 * Writes run against the same Neon DATABASE_URL the read path uses
 * (see src/lib/neon.ts). No user_id scoping — the app is still
 * single-user and scoping by the placeholder sentinel made rows
 * inserted through the Neon Console with any other user_id
 * unreachable. Once Neon Auth lands, reintroduce `and user_id =
 * ${session.userId}` on both UPDATEs.
 *
 * Each action revalidates /prospects so the server component refetches
 * on the next navigation. The table component applies optimistic
 * updates client-side so the UI feels instant.
 */

const VALID_STATUSES: ProspectStatus[] = [
  "new",
  "researching",
  "queued",
  "contacted",
  "responded",
  "meeting_scheduled",
  "engaged",
  "dead",
  "promoted"
];

const VALID_RELATIONSHIPS: ProspectRelationship[] = [
  "unknown",
  "colleague",
  "mutual_intro_available",
  "met_once",
  "acquainted",
  "close"
];

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Missing DATABASE_URL. Cannot mutate prospects without a Neon connection."
    );
  }
  return neon(url);
}

export async function updateProspectStatus(
  id: string,
  status: ProspectStatus
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!VALID_STATUSES.includes(status)) {
    return { ok: false, error: `Invalid status: ${status}` };
  }
  try {
    const sql = client();
    await sql`
      update public.prospects
      set status = ${status}, updated_at = now()
      where id = ${id}
    `;
    revalidatePath("/prospects");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

export async function updateProspectRelationship(
  id: string,
  relationship: ProspectRelationship
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!VALID_RELATIONSHIPS.includes(relationship)) {
    return { ok: false, error: `Invalid relationship: ${relationship}` };
  }
  try {
    const sql = client();
    await sql`
      update public.prospects
      set relationship_to_user = ${relationship}, updated_at = now()
      where id = ${id}
    `;
    revalidatePath("/prospects");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
