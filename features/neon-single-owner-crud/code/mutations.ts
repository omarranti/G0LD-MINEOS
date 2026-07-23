"use server";

import { revalidatePath } from "next/cache";
import { getSql, DEMO_SENTINEL_USER_ID } from "@/lib/neon";
import type { MutationState } from "@/lib/database";

/**
 * Canonical single-owner CRUD module. Every list-style feature in a
 * single-user dashboard (tasks, goals, journal, finances, contacts, timeline)
 * is THIS file with a different table and fields. Capture it once.
 *
 * The three moves that repeat:
 *   1. `getSql()` is nullable. No DATABASE_URL -> writes no-op and return a
 *      demo-success state so the form clears cleanly in a deployed demo.
 *   2. Every row is scoped to a single sentinel owner (DEMO_SENTINEL_USER_ID)
 *      until real auth exists. Swap this id for the session user id later.
 *   3. Each action validates, writes, then `revalidatePath`s the routes that
 *      render the data, and returns a `MutationState` the form can display.
 *
 * `Item` here stands in for Action / Goal / JournalEntry / Finance / Contact.
 */

const DEMO_MESSAGE = "Demo mode: changes are not persisted.";
const demoOk = (): MutationState => ({ ok: true, message: DEMO_MESSAGE });
const fail = (message: string): MutationState => ({ ok: false, error: message });

function refresh() {
  revalidatePath("/items");
  revalidatePath("/dashboard");
}

export async function createItem(
  _prevState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return fail("Title is required.");
  const note = String(formData.get("note") ?? "").trim() || null;

  try {
    await sql`
      insert into public.items (user_id, title, note)
      values (${DEMO_SENTINEL_USER_ID}, ${title}, ${note})
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Added." };
}

export async function updateItemTitle(id: string, title: string): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();
  const t = title.trim();
  if (!t) return fail("Title cannot be empty.");
  try {
    // Scope updates by BOTH id and owner so one user can never touch another's row.
    await sql`
      update public.items set title = ${t}
      where id = ${id} and user_id = ${DEMO_SENTINEL_USER_ID}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }
  refresh();
  return { ok: true, message: "Updated." };
}

export async function deleteItem(id: string): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();
  try {
    await sql`
      delete from public.items
      where id = ${id} and user_id = ${DEMO_SENTINEL_USER_ID}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }
  refresh();
  return { ok: true, message: "Deleted." };
}
