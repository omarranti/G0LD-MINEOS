"use server";

import { revalidatePath } from "next/cache";
import { getSql, DEMO_SENTINEL_USER_ID } from "@/lib/neon";
import type {
  ActionPriority,
  ActionStatus,
  MutationState
} from "@/lib/database";

/**
 * Server actions for the Actions module.
 *
 * Writes hit Neon when DATABASE_URL is set and revalidate the relevant
 * routes. Without it, writes no-op and return a demo-success state so
 * the form clears cleanly.
 */

const DEMO_MESSAGE = "Demo mode: changes are not persisted.";
const demoOk = (): MutationState => ({ ok: true, message: DEMO_MESSAGE });

function fail(message: string): MutationState {
  return { ok: false, error: message };
}

function refresh() {
  revalidatePath("/actions");
  revalidatePath("/dashboard");
}

export async function createAction(
  _prevState: MutationState,
  formData: FormData
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return fail("Title is required.");

  const priorityInput = String(formData.get("priority") ?? "should");
  const priority: ActionPriority = (
    ["must", "should", "could"] as const
  ).includes(priorityInput as ActionPriority)
    ? (priorityInput as ActionPriority)
    : "should";

  const dueDate = String(formData.get("due_date") ?? "").trim() || null;
  const goalIdRaw = String(formData.get("goal_id") ?? "").trim();
  const goalId = goalIdRaw ? goalIdRaw : null;
  const status: ActionStatus = "pending";

  try {
    await sql`
      insert into public.actions
        (user_id, title, priority, status, due_date, goal_id)
      values
        (${DEMO_SENTINEL_USER_ID}, ${title}, ${priority}, ${status}, ${dueDate}, ${goalId})
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Action added." };
}

export async function setActionStatus(
  id: string,
  done: boolean
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  const status: ActionStatus = done ? "done" : "pending";
  const completedAt = done ? new Date().toISOString() : null;

  try {
    await sql`
      update public.actions
      set status = ${status}, completed_at = ${completedAt}
      where id = ${id}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Updated." };
}

export async function updateActionTitle(
  id: string,
  title: string
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();
  const t = title.trim();
  if (!t) return fail("Title cannot be empty.");
  try {
    await sql`
      update public.actions
      set title = ${t}
      where id = ${id} and user_id = ${DEMO_SENTINEL_USER_ID}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }
  refresh();
  return { ok: true, message: "Updated." };
}

export async function updateActionPriority(
  id: string,
  priority: ActionPriority
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();
  if (!(["must", "should", "could"] as string[]).includes(priority)) {
    return fail("Invalid priority.");
  }
  try {
    await sql`
      update public.actions
      set priority = ${priority}
      where id = ${id} and user_id = ${DEMO_SENTINEL_USER_ID}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }
  refresh();
  return { ok: true, message: "Updated." };
}

export async function deleteAction(id: string): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  try {
    await sql`
      delete from public.actions
      where id = ${id}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Deleted." };
}
