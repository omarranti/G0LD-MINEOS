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
  revalidatePath("/finances");
  revalidatePath("/dashboard");
}

function money(input: FormDataEntryValue | null): number {
  if (input == null) return 0;
  const n = Number(String(input).trim());
  return Number.isFinite(n) ? n : 0;
}

export async function upsertFinance(
  _prevState: MutationState,
  formData: FormData
): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  const month = Number(formData.get("month"));
  const year = Number(formData.get("year"));
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return fail("Month must be 1 through 12.");
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return fail("Year is out of range.");
  }

  const income = money(formData.get("income"));
  const sideIncome = money(formData.get("side_income"));
  const savings = money(formData.get("savings"));
  const rent = money(formData.get("expenses_rent"));
  const food = money(formData.get("expenses_food"));
  const transport = money(formData.get("expenses_transport"));
  const subs = money(formData.get("expenses_subscriptions"));
  const other = money(formData.get("expenses_other"));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  try {
    await sql`
      insert into public.finances
        (user_id, month, year, income, side_income, savings,
         expenses_rent, expenses_food, expenses_transport,
         expenses_subscriptions, expenses_other, notes)
      values
        (${DEMO_SENTINEL_USER_ID}, ${month}, ${year}, ${income}, ${sideIncome},
         ${savings}, ${rent}, ${food}, ${transport}, ${subs}, ${other},
         ${notes})
      on conflict (user_id, year, month) do update set
        income = excluded.income,
        side_income = excluded.side_income,
        savings = excluded.savings,
        expenses_rent = excluded.expenses_rent,
        expenses_food = excluded.expenses_food,
        expenses_transport = excluded.expenses_transport,
        expenses_subscriptions = excluded.expenses_subscriptions,
        expenses_other = excluded.expenses_other,
        notes = excluded.notes
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteFinance(id: string): Promise<MutationState> {
  const sql = getSql();
  if (!sql) return demoOk();

  try {
    await sql`
      delete from public.finances
      where id = ${id}
    `;
  } catch (err) {
    return fail((err as Error).message);
  }

  refresh();
  return { ok: true, message: "Deleted." };
}
