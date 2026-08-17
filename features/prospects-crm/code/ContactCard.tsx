"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  deleteContact,
  logInteraction,
  updateContactStrength
} from "@/app/(dashboard)/network/mutations";
import {
  INTERACTION_LABELS,
  type Contact,
  type ContactInteractionType
} from "@/lib/database";
import type { CardInsight } from "@/lib/insights";
import { InsightReveal } from "./InsightReveal";

/**
 * Contact card with inline interaction logging and strength editing.
 */
export function ContactCard({
  contact,
  isOverdue,
  insight
}: {
  contact: Contact;
  isOverdue?: boolean;
  insight?: CardInsight;
}) {
  const [isPending, startTransition] = useTransition();
  const [loggingType, setLoggingType] = useState<ContactInteractionType | null>(null);
  const [interactionNote, setInteractionNote] = useState("");

  function handleDelete() {
    startTransition(async () => {
      await deleteContact(contact.id);
    });
  }

  function startLog(type: ContactInteractionType) {
    setLoggingType(type);
    setInteractionNote("");
  }

  function confirmLog() {
    if (!loggingType) return;
    startTransition(async () => {
      await logInteraction(contact.id, loggingType, interactionNote);
      setLoggingType(null);
      setInteractionNote("");
    });
  }

  function cancelLog() {
    setLoggingType(null);
    setInteractionNote("");
  }

  function nudgeStrength(next: number) {
    startTransition(async () => {
      await updateContactStrength(contact.id, next);
    });
  }

  return (
    <div
      className={cn(
        "card group",
        isPending && "opacity-70",
        isOverdue && "border-amber/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {isOverdue && (
              <span className="badge badge-amber">follow up</span>
            )}
            {contact.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="badge badge-muted">
                {tag}
              </span>
            ))}
          </div>
          <h3 className="mt-3 font-display text-[1.05rem] font-semibold text-text">
            {contact.name}
          </h3>
          {(contact.title || contact.company) && (
            <div className="mt-0.5 text-[0.82rem] text-text-muted">
              {[contact.title, contact.company].filter(Boolean).join(" · ")}
            </div>
          )}
          {contact.notes && (
            <p className="mt-3 text-[0.82rem] leading-relaxed text-text-med line-clamp-3">
              {contact.notes}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          aria-label="Delete contact"
          className="shrink-0 rounded p-1 text-[0.85rem] text-text-dim opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
        >
          ×
        </button>
      </div>

      {/* Strength row */}
      <div className="mt-4 flex items-center gap-3">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-text-dim">
          strength
        </span>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => nudgeStrength(n)}
              disabled={isPending}
              aria-label={`Set strength to ${n}`}
              className={cn(
                "h-2 w-6 rounded-sm transition-colors",
                contact.relationship_strength && n <= contact.relationship_strength
                  ? "bg-emerald"
                  : "bg-bg-raised hover:bg-border-light"
              )}
            />
          ))}
        </div>
        {contact.last_interaction_date && (
          <span className="ml-auto font-mono text-[0.6rem] uppercase tracking-[0.12em] text-text-dim">
            last {daysAgo(contact.last_interaction_date)}
          </span>
        )}
      </div>

      {/* Log interaction row */}
      {loggingType === null ? (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-text-dim">
            log
          </span>
          {(Object.keys(INTERACTION_LABELS) as ContactInteractionType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => startLog(t)}
              disabled={isPending}
              className="btn btn-outline btn-sm disabled:opacity-50"
            >
              {INTERACTION_LABELS[t]}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-2 rounded-md border border-border-light bg-bg p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-emerald">
              Logging · {INTERACTION_LABELS[loggingType]}
            </span>
            <button
              type="button"
              onClick={cancelLog}
              className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-text-dim hover:text-text-med"
            >
              cancel
            </button>
          </div>
          <textarea
            rows={2}
            value={interactionNote}
            onChange={(e) => setInteractionNote(e.target.value)}
            placeholder="Optional note. What happened, what to follow up on."
            className="w-full resize-none rounded-md border border-border bg-bg-raised px-3 py-2 text-[0.82rem] text-text-med placeholder:text-text-dim focus-visible:border-emerald focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={confirmLog}
            disabled={isPending}
            className="btn btn-primary btn-sm disabled:opacity-50"
          >
            {isPending ? "Logging…" : "Save"}
          </button>
        </div>
      )}

      <InsightReveal insight={insight} />
    </div>
  );
}

function daysAgo(iso: string): string {
  const then = new Date(iso + "T00:00:00");
  const now = new Date();
  const diff = Math.round(
    (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diff <= 0) return "today";
  if (diff === 1) return "1d ago";
  if (diff < 30) return `${diff}d ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return `${Math.floor(diff / 365)}y ago`;
}
