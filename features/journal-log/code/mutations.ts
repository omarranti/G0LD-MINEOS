"use server";

import { revalidatePath } from "next/cache";
import { getSql, DEMO_SENTINEL_USER_ID } from "@/lib/neon";
import type { MutationState } from "@/lib/database";

const DEMO_MESSAGE = "Demo mode: changes are not persisted.";
const demoOk = (): MutationState => ({ ok: true, message: DEMO_MESSAGE });

function fail(message: string): MutationState {
  return { ok: false, error: message };
}

function refresh() {
  revalidatePath("/journal");
  revalidatePath("/dashboard");
}

function parseTags(input: FormDataEntryValue | null): string[] {
  if (!input) return [];
  return String(input)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function createJournalEntry(
  _prevState: MutationState,
  formData: FormData
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return fail("Entry content is required.");

  const title = String(formData.get("title") ?? "").trim() || null;
  const tags = parseTags(formData.get("tags"));
  const today = new Date().toISOString().slice(0, 10);

  try {
    await sql`
      insert into public.journal_entries
        (user_id, title, content, tags, date)
      values
        (${DEMO_SENTINEL_USER_ID}, ${title}, ${content}, ${tags}, ${today})
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Entry saved." };
}

export async function deleteJournalEntry(id: string): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  try {
    await sql`
      delete from public.journal_entries
      where id = ${id}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Deleted." };
}
