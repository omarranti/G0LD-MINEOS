"use server";

import { revalidatePath } from "next/cache";
import { getSql, DEMO_SENTINEL_USER_ID } from "@/lib/neon";
import type { ContactInteractionType, MutationState } from "@/lib/database";

/**
 * Server actions for the Network (contacts) page.
 *
 * Inserts stamp the sentinel user_id so new rows stay consistent with
 * the rest of the single-user dashboard. Updates and deletes no longer
 * scope by user_id: the sentinel filter was silently no-matching rows
 * inserted through the Neon Console or seed scripts, same class of bug
 * as the prospects fix (commit 69d8e5b). Once Neon Auth lands, re-add
 * `and user_id = ${session.userId}` to the update/delete WHEREs.
 */

const DEMO_MESSAGE = "Demo mode: changes are not persisted.";
const demoOk = (): MutationState => ({ ok: true, message: DEMO_MESSAGE });

function fail(message: string): MutationState {
  return { ok: false, error: message };
}

function refresh() {
  revalidatePath("/network");
  revalidatePath("/dashboard");
}

function parseTags(input: FormDataEntryValue | null): string[] {
  if (!input) return [];
  return String(input)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseIntOrNull(input: FormDataEntryValue | null): number | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function createContact(
  _prevState: MutationState,
  formData: FormData
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return fail("Name is required.");

  const title = String(formData.get("title") ?? "").trim() || null;
  const company = String(formData.get("company") ?? "").trim() || null;
  const howMet = String(formData.get("how_met") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const tags = parseTags(formData.get("tags"));
  const strength = parseIntOrNull(formData.get("relationship_strength"));
  const followUpDays = parseIntOrNull(formData.get("follow_up_days"));

  try {
    await sql`
      insert into public.contacts
        (user_id, name, title, company, how_met, notes, tags,
         relationship_strength, follow_up_days)
      values
        (${DEMO_SENTINEL_USER_ID}, ${name}, ${title}, ${company}, ${howMet},
         ${notes}, ${tags}, ${strength}, ${followUpDays})
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Contact added." };
}

export async function deleteContact(id: string): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  try {
    await sql`
      delete from public.contacts
      where id = ${id}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Deleted." };
}

export async function logInteraction(
  contactId: string,
  type: ContactInteractionType,
  notes: string
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  const today = new Date().toISOString().slice(0, 10);
  const cleanNotes = notes.trim() || null;

  try {
    await sql`
      insert into public.interactions (user_id, contact_id, type, date, notes)
      values (${DEMO_SENTINEL_USER_ID}, ${contactId}, ${type}, ${today}, ${cleanNotes})
    `;
    await sql`
      update public.contacts
      set last_interaction_date = ${today}
      where id = ${contactId}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Interaction logged." };
}

export async function updateContactStrength(
  id: string,
  strength: number
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  const clamped = Math.max(1, Math.min(5, Math.round(strength)));

  try {
    await sql`
      update public.contacts
      set relationship_strength = ${clamped}
      where id = ${id}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Updated." };
}
