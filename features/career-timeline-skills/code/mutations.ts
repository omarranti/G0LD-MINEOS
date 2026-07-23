"use server";

import { revalidatePath } from "next/cache";
import { getSql, DEMO_SENTINEL_USER_ID } from "@/lib/neon";
import type {
  CareerCategory,
  MutationState,
  SkillCategory
} from "@/lib/database";

const DEMO_MESSAGE = "Demo mode: changes are not persisted.";
const demoOk = (): MutationState => ({ ok: true, message: DEMO_MESSAGE });

function fail(message: string): MutationState {
  return { ok: false, error: message };
}

function refresh() {
  revalidatePath("/career");
  revalidatePath("/dashboard");
}

function parseTags(input: FormDataEntryValue | null): string[] {
  if (!input) return [];
  return String(input)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

const CAREER_CATEGORIES: readonly CareerCategory[] = [
  "work",
  "creative",
  "personal",
  "financial"
];

const SKILL_CATEGORIES: readonly SkillCategory[] = [
  "technical",
  "interpersonal",
  "creative",
  "industry"
];

// ─── Career events ──────────────────────────────────────────────────

export async function createCareerEvent(
  _prevState: MutationState,
  formData: FormData
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return fail("Title is required.");
  const date = String(formData.get("date") ?? "").trim();
  if (!date) return fail("Date is required.");

  const description = String(formData.get("description") ?? "").trim() || null;
  const categoryInput = String(formData.get("category") ?? "").trim();
  const category =
    categoryInput && CAREER_CATEGORIES.includes(categoryInput as CareerCategory)
      ? (categoryInput as CareerCategory)
      : null;
  const tags = parseTags(formData.get("tags"));

  try {
    await sql`
      insert into public.career_events
        (user_id, title, description, date, category, tags)
      values
        (${DEMO_SENTINEL_USER_ID}, ${title}, ${description}, ${date}, ${category}, ${tags})
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Event added." };
}

export async function deleteCareerEvent(id: string): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  try {
    await sql`
      delete from public.career_events
      where id = ${id}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Deleted." };
}

// ─── Skills ─────────────────────────────────────────────────────────

export async function createSkill(
  _prevState: MutationState,
  formData: FormData
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return fail("Skill name is required.");

  const categoryInput = String(formData.get("category") ?? "").trim();
  const category =
    categoryInput && SKILL_CATEGORIES.includes(categoryInput as SkillCategory)
      ? (categoryInput as SkillCategory)
      : null;

  const proficiencyRaw = String(formData.get("proficiency") ?? "").trim();
  let proficiency: number | null = null;
  if (proficiencyRaw) {
    const n = Number(proficiencyRaw);
    if (Number.isFinite(n)) proficiency = Math.max(1, Math.min(10, Math.round(n)));
  }

  const isTarget = formData.get("is_target") != null;

  try {
    await sql`
      insert into public.skills
        (user_id, name, category, proficiency, is_target)
      values
        (${DEMO_SENTINEL_USER_ID}, ${name}, ${category}, ${proficiency}, ${isTarget})
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Skill added." };
}

export async function updateSkillProficiency(
  id: string,
  proficiency: number
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  const clamped = Math.max(1, Math.min(10, Math.round(proficiency)));

  try {
    await sql`
      update public.skills
      set proficiency = ${clamped}
      where id = ${id}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Updated." };
}

export async function deleteSkill(id: string): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  try {
    await sql`
      delete from public.skills
      where id = ${id}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Deleted." };
}
