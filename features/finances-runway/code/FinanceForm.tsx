"use client";

import { useActionState, useRef, useEffect } from "react";
import { upsertFinance } from "@/app/(dashboard)/finances/mutations";
import {
  initialMutationState,
  MONTH_NAMES,
  type Finance
} from "@/lib/database";

/**
 * Monthly finance row editor. Serves as both "create new month"
 * and "edit existing month" via upsert on (year, month) unique key.
 */
export function FinanceForm({ existing }: { existing?: Finance }) {
  const [state, formAction, pending] = useActionState(
    upsertFinance,
    initialMutationState
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok === true && !existing) {
      formRef.current?.reset();
    }
  }, [state, existing]);

  const now = new Date();
  const defaultMonth = existing?.month ?? now.getMonth() + 1;
  const defaultYear = existing?.year ?? now.getFullYear();

  const moneyField = (name: keyof Finance, label: string, placeholder = "0") => (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-text-dim">
        {label}
      </span>
      <div className="flex items-center rounded-md border border-border bg-bg-raised px-2.5 py-2 focus-within:border-emerald-dim">
        <span className="mr-1 font-mono text-[0.78rem] text-text-dim">$</span>
        <input
          type="number"
          name={name}
          min="0"
          step="0.01"
          defaultValue={existing ? Number(existing[name]) || 0 : undefined}
          placeholder={placeholder}
          disabled={pending}
          className="w-full bg-transparent text-[0.85rem] text-text outline-none placeholder:text-text-dim"
        />
      </div>
    </label>
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <fieldset className="flex flex-wrap items-center gap-2 border-0 p-0">
        <legend className="sr-only">Reporting period</legend>
        <label className="flex items-center gap-2">
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-text-dim">
            Month
          </span>
          <select
            name="month"
            defaultValue={defaultMonth}
            disabled={pending || !!existing}
            className="rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.82rem] text-text focus-visible:border-emerald focus-visible:outline-none disabled:opacity-60"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-text-dim">
            Year
          </span>
          <input
            type="number"
            name="year"
            min="2000"
            max="2100"
            defaultValue={defaultYear}
            disabled={pending || !!existing}
            className="w-[90px] rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.82rem] text-text focus-visible:border-emerald focus-visible:outline-none disabled:opacity-60"
          />
        </label>
      </fieldset>

      <div className="grid gap-3 md:grid-cols-3">
        {moneyField("income", "Income")}
        {moneyField("side_income", "Side income")}
        {moneyField("savings", "Savings snapshot")}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {moneyField("expenses_rent", "Rent")}
        {moneyField("expenses_food", "Food")}
        {moneyField("expenses_transport", "Transport")}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {moneyField("expenses_subscriptions", "Subscriptions")}
        {moneyField("expenses_other", "Other")}
      </div>

      <textarea
        name="notes"
        rows={2}
        aria-label="Monthly notes"
        defaultValue={existing?.notes ?? ""}
        placeholder="Notes for this month."
        disabled={pending}
        className="w-full resize-none rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.82rem] text-text-med placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
      />

      <div className="flex items-center gap-2">
        <div role="status" aria-live="polite" className="min-h-[1rem] flex-1">
          {state.ok === true && (
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-emerald">
              ✓ {state.message}
            </span>
          )}
          {state.ok === false && (
            <span className="font-mono text-[0.7rem] text-danger">
              {state.error}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary disabled:opacity-50"
        >
          {pending ? "Saving…" : existing ? "Update" : "Save month"}
        </button>
      </div>
    </form>
  );
}
