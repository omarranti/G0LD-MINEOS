"use client";

import { useActionState, useEffect, useState } from "react";
import { saveProfileSection } from "@/app/(dashboard)/profile/mutations";
import { initialMutationState, type ProfileQuestionnaire } from "@/lib/database";
import type { QuestionnaireSectionConfig } from "@/content/profile-questionnaire";

/**
 * Renders a single questionnaire section as a self-contained form.
 * Each section has its own save button so Jordan can fill the
 * questionnaire one section at a time without losing progress.
 *
 * The form action is bound to the section key so the server-side
 * mutation knows which subset of fields to upsert when this is wired
 * to a real Neon backend.
 */
export function QuestionnaireSection({
  section,
  initial
}: {
  section: QuestionnaireSectionConfig;
  initial: ProfileQuestionnaire;
}) {
  const boundAction = saveProfileSection.bind(null, section.key);
  const [state, formAction, pending] = useActionState(
    boundAction,
    initialMutationState
  );

  // Track local edits so the "saved on" stamp updates after a save
  // even in demo mode where the parent prop won't change.
  const initiallySavedAt = initial.section_completed[section.key];
  const [savedAt, setSavedAt] = useState<string | null>(initiallySavedAt ?? null);

  useEffect(() => {
    if (state.ok === true) {
      setSavedAt(new Date().toISOString());
    }
  }, [state]);

  return (
    <form
      action={formAction}
      className="space-y-5"
      aria-labelledby={`section-${section.key}-title`}
    >
      {section.questions.map((q) => {
        const value = (initial[q.field] as string | null) ?? "";

        if (q.type === "role-radio") {
          return (
            <div key={q.field} className="space-y-2">
              <label className="block text-[0.85rem] font-medium text-text">
                {q.label}
              </label>
              {q.helper && (
                <p className="text-[0.72rem] text-text-dim">{q.helper}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {(["talent", "business", "both"] as const).map((opt) => (
                  <label
                    key={opt}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.78rem] text-text-med transition-colors hover:border-emerald-dim has-[:checked]:border-emerald-dim has-[:checked]:bg-[var(--emerald-bg)] has-[:checked]:text-text"
                  >
                    <input
                      type="radio"
                      name={q.field}
                      value={opt}
                      defaultChecked={value === opt}
                      disabled={pending}
                      className="accent-emerald"
                    />
                    <span className="capitalize">{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={q.field} className="space-y-2">
            <label
              htmlFor={`field-${q.field}`}
              className="block text-[0.85rem] font-medium text-text"
            >
              {q.label}
            </label>
            {q.helper && (
              <p className="text-[0.72rem] text-text-dim">{q.helper}</p>
            )}
            <textarea
              id={`field-${q.field}`}
              name={q.field}
              rows={q.rows ?? 3}
              defaultValue={value}
              disabled={pending}
              placeholder="Type your answer. Save anytime."
              className="w-full resize-y rounded-md border border-border bg-bg-raised px-3.5 py-2.5 text-[0.85rem] text-text-med placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
            />
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save section"}
        </button>
        {state.ok === true && (
          <span className="text-[0.72rem] text-emerald">{state.message}</span>
        )}
        {state.ok === false && (
          <span className="text-[0.72rem] text-danger">{state.error}</span>
        )}
        {savedAt && (
          <span className="ml-auto font-mono text-[0.65rem] uppercase tracking-[0.14em] text-text-dim">
            Last saved {formatStamp(savedAt)}
          </span>
        )}
      </div>
    </form>
  );
}

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
