"use client";

import { useActionState, useRef, useEffect } from "react";
import { createAction } from "@/app/(dashboard)/actions/mutations";
import {
  initialMutationState,
  PRIORITY_LABELS,
  type ActionPriority
} from "@/lib/database";

type GoalOption = { id: string; title: string };

/**
 * Inline "quick add" form. Title on one row, priority / goal / date
 * on a secondary row, submit button on the right. Uses React 19
 * useActionState so pending state + errors come for free.
 */
export function ActionForm({ goals }: { goals: GoalOption[] }) {
  const [state, formAction, pending] = useActionState(
    createAction,
    initialMutationState
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Reset the form after a successful submission.
  useEffect(() => {
    if (state.ok === true) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-label="Add an action"
      className="space-y-3"
    >
      <input
        name="title"
        required
        aria-label="Action title"
        aria-required="true"
        placeholder="What moves forward today?"
        disabled={pending}
        className="w-full rounded-md border border-border bg-bg-raised px-3.5 py-2.5 text-[0.95rem] text-text placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="priority"
          defaultValue="should"
          aria-label="Priority"
          disabled={pending}
          className="rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.78rem] text-text-med focus-visible:border-emerald focus-visible:outline-none"
        >
          {(Object.keys(PRIORITY_LABELS) as ActionPriority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="due_date"
          aria-label="Due date"
          disabled={pending}
          className="rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.78rem] text-text-med focus-visible:border-emerald focus-visible:outline-none"
        />
        {goals.length > 0 && (
          <select
            name="goal_id"
            defaultValue=""
            aria-label="Linked goal"
            disabled={pending}
            className="rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.78rem] text-text-med focus-visible:border-emerald focus-visible:outline-none"
          >
            <option value="">No goal</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        )}
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary ml-auto disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
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
