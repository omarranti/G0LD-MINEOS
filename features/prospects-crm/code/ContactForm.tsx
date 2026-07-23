"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { createContact } from "@/app/(dashboard)/network/mutations";
import { initialMutationState } from "@/lib/database";

export function ContactForm() {
  const [state, formAction, pending] = useActionState(
    createContact,
    initialMutationState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (state.ok === true) {
      formRef.current?.reset();
      setExpanded(false);
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-label="Add a contact"
      className="space-y-3"
    >
      <div className="flex flex-wrap gap-2">
        <input
          name="name"
          required
          aria-label="Contact name"
          aria-required="true"
          placeholder="Name"
          disabled={pending}
          className="flex-1 min-w-[200px] rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.9rem] text-text placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
        />
        <input
          name="title"
          aria-label="Contact title"
          placeholder="Title"
          disabled={pending}
          className="flex-1 min-w-[160px] rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.85rem] text-text-med placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
        />
        <input
          name="company"
          aria-label="Contact company"
          placeholder="Company"
          disabled={pending}
          className="flex-1 min-w-[160px] rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.85rem] text-text-med placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
        />
      </div>

      {expanded && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select
              name="relationship_strength"
              defaultValue=""
              aria-label="Relationship strength"
              disabled={pending}
              className="rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.78rem] text-text-med focus-visible:border-emerald focus-visible:outline-none"
            >
              <option value="">Strength</option>
              <option value="1">1 · cold</option>
              <option value="2">2 · acquaintance</option>
              <option value="3">3 · friendly</option>
              <option value="4">4 · close</option>
              <option value="5">5 · inner circle</option>
            </select>
            <input
              name="follow_up_days"
              type="number"
              min="0"
              aria-label="Follow up cadence in days"
              placeholder="Follow-up (days)"
              disabled={pending}
              className="w-[160px] rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.78rem] text-text-med placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
            />
            <input
              name="how_met"
              aria-label="How you met"
              placeholder="How met"
              disabled={pending}
              className="flex-1 min-w-[180px] rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.78rem] text-text-med placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
            />
          </div>
          <input
            name="tags"
            aria-label="Tags, comma separated"
            placeholder="Tags (comma separated)"
            disabled={pending}
            className="w-full rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.78rem] text-text-med placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
          />
          <textarea
            name="notes"
            rows={2}
            aria-label="Contact notes"
            placeholder="Notes. What they care about, what you discussed, what to follow up on."
            disabled={pending}
            className="w-full resize-none rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.82rem] text-text-med placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-text-muted transition-colors hover:text-text"
        >
          {expanded ? "Less" : "More fields"}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary ml-auto disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add contact"}
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
