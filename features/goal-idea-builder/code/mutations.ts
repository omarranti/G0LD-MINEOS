"use server";

import { revalidatePath } from "next/cache";
import { getSql, DEMO_SENTINEL_USER_ID } from "@/lib/neon";
import type { GoalCategory, GoalStatus, MutationState } from "@/lib/database";

const DEMO_MESSAGE = "Demo mode: changes are not persisted.";
const demoOk = (): MutationState => ({ ok: true, message: DEMO_MESSAGE });

function fail(message: string): MutationState {
  return { ok: false, error: message };
}

function refresh() {
  revalidatePath("/goals");
  revalidatePath("/dashboard");
  revalidatePath("/actions");
}

const VALID_CATEGORIES: readonly GoalCategory[] = [
  "career",
  "financial",
  "creative",
  "personal",
  "network"
];

export async function createGoal(
  _prevState: MutationState,
  formData: FormData
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return fail("Title is required.");

  const description = String(formData.get("description") ?? "").trim() || null;
  const categoryInput = String(formData.get("category") ?? "").trim();
  const category =
    categoryInput && VALID_CATEGORIES.includes(categoryInput as GoalCategory)
      ? (categoryInput as GoalCategory)
      : null;
  const targetDate = String(formData.get("target_date") ?? "").trim() || null;

  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const year = now.getFullYear();
  const status: GoalStatus = "active";

  try {
    await sql`
      insert into public.goals
        (user_id, title, description, category, target_date, progress,
         status, quarter, year)
      values
        (${DEMO_SENTINEL_USER_ID}, ${title}, ${description}, ${category},
         ${targetDate}, 0, ${status}, ${quarter}, ${year})
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Goal added." };
}

export async function setGoalProgress(
  id: string,
  progress: number
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  const clamped = Math.max(0, Math.min(100, Math.round(progress)));

  try {
    await sql`
      update public.goals
      set progress = ${clamped}
      where id = ${id}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Updated." };
}

export async function setGoalStatus(
  id: string,
  status: GoalStatus
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  try {
    await sql`
      update public.goals
      set status = ${status}
      where id = ${id}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Updated." };
}

export async function updateGoalTitle(
  id: string,
  title: string
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();
  const t = title.trim();
  if (!t) return fail("Title cannot be empty.");
  try {
    await sql`
      update public.goals
      set title = ${t}
      where id = ${id} and user_id = ${DEMO_SENTINEL_USER_ID}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }
  refresh();
  return { ok: true, message: "Updated." };
}

export async function updateGoalCategory(
  id: string,
  category: GoalCategory | null
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();
  if (category !== null && !VALID_CATEGORIES.includes(category)) {
    return fail("Invalid category.");
  }
  try {
    await sql`
      update public.goals
      set category = ${category}
      where id = ${id} and user_id = ${DEMO_SENTINEL_USER_ID}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }
  refresh();
  return { ok: true, message: "Updated." };
}

export async function deleteGoal(id: string): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  try {
    await sql`
      delete from public.goals
      where id = ${id}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Deleted." };
}
