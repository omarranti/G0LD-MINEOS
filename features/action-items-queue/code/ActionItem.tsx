"use client";

import { useState, useOptimistic, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  setActionStatus,
  deleteAction,
  updateActionTitle,
  updateActionPriority
} from "@/app/(dashboard)/actions/mutations";
import type { Action, ActionPriority } from "@/lib/database";
import { PRIORITY_LABELS } from "@/lib/database";
import type { CardInsight } from "@/lib/insights";
import { InsightReveal } from "./InsightReveal";
import { ConfirmDialog } from "./ConfirmDialog";

type GoalLookup = Record<string, string>;

/**
 * A single action row with optimistic check-off.
 *
 * useOptimistic lets the UI flip instantly on click; the server action
 * then persists and revalidatePath refreshes the server data. If the
 * mutation fails, the optimistic state resets on next render.
 */
export function ActionItem({
  action,
  goals,
  insight
}: {
  action: Action;
  goals?: GoalLookup;
  insight?: CardInsight;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimisticDone, applyOptimistic] = useOptimistic(
    action.status === "done",
    (_state: boolean, next: boolean) => next
  );

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(action.title);
  const goalTitle = action.goal_id ? goals?.[action.goal_id] : undefined;

  function saveTitle() {
    setEditingTitle(false);
    const t = titleDraft.trim();
    if (!t || t === action.title) { setTitleDraft(action.title); return; }
    startTransition(async () => { await updateActionTitle(action.id, t); });
  }

  function handlePriorityChange(p: ActionPriority) {
    startTransition(async () => { await updateActionPriority(action.id, p); });
  }

  function handleToggle() {
    const next = !optimisticDone;
    startTransition(async () => {
      applyOptimistic(next);
      await setActionStatus(action.id, next);
    });
  }

  function handleDelete() {
    setConfirmOpen(false);
    startTransition(async () => {
      await deleteAction(action.id);
    });
  }

  return (
    <div
      className={cn(
        "group rounded-md border border-transparent px-2 transition-colors hover:border-border hover:bg-bg-raised/40",
        isPending && "opacity-60"
      )}
    >
      <div className="flex items-start gap-3 py-2.5">
        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          aria-label={optimisticDone ? "Mark as pending" : "Mark as done"}
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
            optimisticDone
              ? "border-emerald bg-emerald text-black"
              : "border-border-light hover:border-emerald"
          )}
        >
          {optimisticDone ? (
            <span className="text-[0.7rem] font-bold leading-none">✓</span>
          ) : null}
        </button>

        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitleDraft(action.title); setEditingTitle(false); } }}
              className="w-full rounded border border-emerald-dim bg-bg-raised px-2 py-1 text-[0.92rem] text-text focus:outline-none"
            />
          ) : (
            <div
              onDoubleClick={() => !optimisticDone && setEditingTitle(true)}
              className={cn(
                "cursor-default text-[0.92rem] leading-snug text-text",
                optimisticDone && "text-text-muted line-through",
                !optimisticDone && "hover:text-emerald"
              )}
              title="Double-click to edit"
            >
              {action.title}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.68rem] text-text-dim">
            <select
              value={action.priority}
              onChange={(e) => handlePriorityChange(e.target.value as ActionPriority)}
              disabled={isPending}
              aria-label="Change priority"
              className="inline-cell-select cursor-pointer rounded border border-border bg-transparent px-1 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-text-dim transition-colors hover:border-emerald-dim hover:text-emerald focus:outline-none"
            >
              {(Object.keys(PRIORITY_LABELS) as ActionPriority[]).map((p) => (
                <option key={p} value={p} className="bg-bg text-text">{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
            {action.due_date && (
              <span className="font-mono uppercase tracking-[0.08em]">
                due {formatDate(action.due_date)}
              </span>
            )}
            {goalTitle && (
              <span className="truncate font-mono uppercase tracking-[0.08em]">
                goal · {goalTitle}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          aria-label="Delete action"
          className="shrink-0 rounded p-1 text-[0.85rem] text-text-dim opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
        >
          ×
        </button>
      </div>

      <InsightReveal insight={insight} compact />

      <ConfirmDialog
        open={confirmOpen}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
        title="Delete this action?"
        description={action.title}
        confirmLabel="Delete"
      />
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
