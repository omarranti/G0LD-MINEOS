"use server";

import { revalidatePath } from "next/cache";
import { getSql, DEMO_SENTINEL_USER_ID } from "@/lib/neon";
import type { MutationState, ProfileSectionKey } from "@/lib/database";
import { questionnaireSections } from "@/content/profile-questionnaire";

/**
 * Server action for the profile questionnaire. One row per owner,
 * keyed on user_id (the primary key of public.profile_questionnaire).
 *
 * Each section form submits only its own subset of fields. The upsert
 * writes those fields and merges `section_completed` with the existing
 * jsonb so prior sections stay marked as saved. Fields outside the
 * current section are not touched.
 *
 * An empty-string submission clears a field (converted to null before
 * being written); leaving a field untouched preserves its current
 * value because the column isn't in the INSERT column list for a
 * different section.
 *
 * This previously returned a demo stub unconditionally, so the
 * questionnaire never persisted anything. Fixed together with the
 * contacts / actions / journal user_id scoping issue.
 */

const DEMO_MESSAGE = "Demo mode: answers are not persisted.";
const demoOk = (): MutationState => ({ ok: true, message: DEMO_MESSAGE });

function fail(message: string): MutationState {
  return { ok: false, error: message };
}

function readField(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

export async function saveProfileSection(
  section: ProfileSectionKey,
  _prevState: MutationState,
  formData: FormData
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  const config = questionnaireSections.find((s) => s.key === section);
  if (!config) return fail(`Unknown section: ${section}`);

  const fields = config.questions.map((q) => q.field);
  const values = fields.map((f) => readField(formData, f));

  const now = new Date().toISOString();
  const sectionCompletedPatch = JSON.stringify({ [section]: now });

  // Build the upsert dynamically. $1 is user_id, $2..$(N+1) are the
  // section field values, $(N+2) is the section_completed patch.
  const columns = ["user_id", ...fields, "section_completed"];
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const updateAssignments = fields
    .map((f) => `${f} = excluded.${f}`)
    .join(",\n      ");
  const sectionCompletedPlaceholder = `$${columns.length}`;

  const query = `
    insert into public.profile_questionnaire (${columns.join(", ")})
    values (${placeholders})
    on conflict (user_id) do update set
      ${updateAssignments},
      section_completed =
        coalesce(public.profile_questionnaire.section_completed, '{}'::jsonb)
        || ${sectionCompletedPlaceholder}::jsonb,
      updated_at = now()
  `;

  const params: (string | null)[] = [
    DEMO_SENTINEL_USER_ID,
    ...values,
    sectionCompletedPatch
  ];

  try {
    // neon() returns a callable that also supports (text, params).
    // The tagged-template form can't handle a dynamic column list, so
    // use the positional form here.
    await sql(query, params);
  } catch (err) {
    return fail((err as Error).message);
  }

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true, message: "Section saved." };
}
