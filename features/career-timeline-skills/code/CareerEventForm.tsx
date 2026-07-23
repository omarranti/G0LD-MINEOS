"use client";

import { useActionState, useRef, useEffect } from "react";
import { createCareerEvent } from "@/app/(dashboard)/career/mutations";
import {
  initialMutationState,
  CAREER_CATEGORY_LABELS,
  type CareerCategory
} from "@/lib/database";

export function CareerEventForm() {
  const [state, formAction, pending] = useActionState(
    createCareerEvent,
    initialMutationState
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok === true) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-label="Add a career event"
      className="space-y-3"
    >
      <input
        name="title"
        required
        aria-label="Event title"
        aria-required="true"
        placeholder="What happened?"
        disabled={pending}
        className="w-full rounded-md border border-border bg-bg-raised px-3.5 py-2.5 text-[0.95rem] text-text placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
      />
      <textarea
        name="description"
        rows={2}
        aria-label="Event description"
        placeholder="Optional description."
        disabled={pending}
        className="w-full resize-none rounded-md border border-border bg-bg-raised px-3.5 py-2.5 text-[0.85rem] text-text-med placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          name="date"
          required
          aria-label="Date"
          aria-required="true"
          defaultValue={new Date().toISOString().slice(0, 10)}
          disabled={pending}
          className="rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.78rem] text-text-med focus-visible:border-emerald focus-visible:outline-none"
        />
        <select
          name="category"
          defaultValue=""
          aria-label="Category"
          disabled={pending}
          className="rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.78rem] text-text-med focus-visible:border-emerald focus-visible:outline-none"
        >
          <option value="">Category</option>
          {(Object.keys(CAREER_CATEGORY_LABELS) as CareerCategory[]).map((c) => (
            <option key={c} value={c}>
              {CAREER_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <input
          name="tags"
          aria-label="Tags, comma separated"
          placeholder="Tags, comma separated"
          disabled={pending}
          className="flex-1 min-w-[160px] rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.78rem] text-text-med placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add event"}
        </button>
      </div>
      <div role="status" aria-live="polite" className="min-h-[1rem]">
        {state.ok === false && (
          <div className="text-[0.75rem] text-danger">{state.error}</div>
        )}
      </div>
    </form>
  );
}
