"use client";

import { useActionState, useRef, useEffect } from "react";
import { createGoal } from "@/app/(dashboard)/goals/mutations";
import {
  initialMutationState,
  CATEGORY_LABELS,
  type GoalCategory
} from "@/lib/database";

export function GoalForm() {
  const [state, formAction, pending] = useActionState(
    createGoal,
    initialMutationState
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok === true) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-label="Add a goal"
      className="space-y-3"
    >
      <input
        name="title"
        required
        aria-label="Goal title"
        aria-required="true"
        placeholder="What are you building toward?"
        disabled={pending}
        className="w-full rounded-md border border-border bg-bg-raised px-3.5 py-2.5 text-[0.95rem] text-text placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
      />
      <textarea
        name="description"
        rows={2}
        aria-label="Goal description"
        placeholder="Optional. Why this matters, what 'done' looks like."
        disabled={pending}
        className="w-full resize-none rounded-md border border-border bg-bg-raised px-3.5 py-2.5 text-[0.85rem] text-text-med placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="category"
          defaultValue=""
          aria-label="Category"
          disabled={pending}
          className="rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.78rem] text-text-med focus-visible:border-emerald focus-visible:outline-none"
        >
          <option value="">No category</option>
          {(Object.keys(CATEGORY_LABELS) as GoalCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="target_date"
          aria-label="Target date"
          disabled={pending}
          className="rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.78rem] text-text-med focus-visible:border-emerald focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary ml-auto disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add goal"}
        </button>
      </div>
      <div role="status" aria-live="polite" className="min-h-[1rem]">
        {state.ok === true && (
          <div className="text-[0.75rem] text-emerald animate-[fadeIn_0.2s_ease-out]">{state.message}</div>
        )}
        {state.ok === false && (
          <div className="text-[0.75rem] text-danger">{state.error}</div>
        )}
      </div>
    </form>
  );
}
