"use client";

import { useActionState, useRef, useEffect } from "react";
import { createJournalEntry } from "@/app/(dashboard)/journal/mutations";
import { initialMutationState } from "@/lib/database";

export function JournalForm() {
  const [state, formAction, pending] = useActionState(
    createJournalEntry,
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
      aria-label="Add a journal entry"
      className="space-y-3"
    >
      <input
        name="title"
        aria-label="Entry title"
        placeholder="Title (optional)"
        disabled={pending}
        className="w-full rounded-md border border-border bg-bg-raised px-3.5 py-2.5 text-[0.95rem] font-semibold text-text placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
      />
      <textarea
        name="content"
        required
        aria-label="Entry content"
        aria-required="true"
        rows={6}
        placeholder="What's on your mind? Meeting notes, observations, half-ideas, reflections."
        disabled={pending}
        className="w-full resize-y rounded-md border border-border bg-bg-raised px-3.5 py-3 text-[0.9rem] leading-relaxed text-text placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="tags"
          aria-label="Tags, comma separated"
          placeholder="Tags, comma separated"
          disabled={pending}
          className="flex-1 min-w-[200px] rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.78rem] text-text-med placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save entry"}
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
