"use server";

import { revalidatePath } from "next/cache";
import { getSql, DEMO_SENTINEL_USER_ID } from "@/lib/neon";
import type { IdeaStatus, MutationState } from "@/lib/database";

const DEMO_MESSAGE = "Demo mode: changes are not persisted.";
const demoOk = (): MutationState => ({ ok: true, message: DEMO_MESSAGE });

function fail(message: string): MutationState {
  return { ok: false, error: message };
}

function refresh() {
  revalidatePath("/discovery");
  revalidatePath("/dashboard");
}

const VALID_STATUSES: readonly IdeaStatus[] = [
  "explored",
  "active",
  "parked",
  "killed"
];

export async function createDiscoveryIdea(
  _prevState: MutationState,
  formData: FormData
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return fail("Idea name is required.");

  const pitch = String(formData.get("one_line_pitch") ?? "").trim() || null;
  const whyJordan = String(formData.get("why_jordan") ?? "").trim() || null;
  const revenueModel = String(formData.get("revenue_model") ?? "").trim() || null;
  const targetCustomer =
    String(formData.get("target_customer") ?? "").trim() || null;
  const status: IdeaStatus = "explored";

  try {
    await sql`
      insert into public.discovery_ideas
        (user_id, name, one_line_pitch, why_jordan, revenue_model,
         target_customer, status)
      values
        (${DEMO_SENTINEL_USER_ID}, ${name}, ${pitch}, ${whyJordan},
         ${revenueModel}, ${targetCustomer}, ${status})
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Idea added." };
}

export async function setIdeaStatus(
  id: string,
  status: IdeaStatus
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  if (!VALID_STATUSES.includes(status)) return fail("Invalid status.");

  try {
    await sql`
      update public.discovery_ideas
      set status = ${status}
      where id = ${id}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  revalidatePath("/discovery");
  revalidatePath(`/discovery/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Updated." };
}

export async function deleteDiscoveryIdea(id: string): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  try {
    await sql`
      delete from public.discovery_ideas
      where id = ${id}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Deleted." };
}
