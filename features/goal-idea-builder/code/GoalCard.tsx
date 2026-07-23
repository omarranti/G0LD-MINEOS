"use client";

import { useState, useOptimistic, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  setGoalProgress,
  setGoalStatus,
  deleteGoal,
  updateGoalTitle,
  updateGoalCategory
} from "@/app/(dashboard)/goals/mutations";
import type { Goal, GoalCategory } from "@/lib/database";
import { CATEGORY_LABELS } from "@/lib/database";
import type { CardInsight } from "@/lib/insights";
import { ProgressBar } from "./ProgressBar";
import { InsightReveal } from "./InsightReveal";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * A goal card with inline progress editing.
 * Click -5 / +5 / complete / delete actions are server actions;
 * useOptimistic gives instant feedback on the progress bar.
 */
export function GoalCard({
  goal,
  insight
}: {
  goal: Goal;
  insight?: CardInsight;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(goal.title);
  const [isPending, startTransition] = useTransition();

  function saveTitle() {
    setEditingTitle(false);
    const t = titleDraft.trim();
    if (!t || t === goal.title) { setTitleDraft(goal.title); return; }
    startTransition(async () => { await updateGoalTitle(goal.id, t); });
  }

  function handleCategoryChange(c: string) {
    const cat = c === "" ? null : (c as GoalCategory);
    startTransition(async () => { await updateGoalCategory(goal.id, cat); });
  }
  const [optimisticProgress, applyProgress] = useOptimistic(
    goal.progress,
    (_state: number, next: number) => next
  );

  function nudge(delta: number) {
    const next = Math.max(0, Math.min(100, optimisticProgress + delta));
    startTransition(async () => {
      applyProgress(next);
      await setGoalProgress(goal.id, next);
    });
  }

  function markComplete() {
    startTransition(async () => {
      applyProgress(100);
      await setGoalStatus(goal.id, "completed");
    });
  }

  function archive() {
    startTransition(async () => {
      await setGoalStatus(goal.id, "archived");
    });
  }

  function handleDelete() {
    setConfirmOpen(false);
    startTransition(async () => {
      await deleteGoal(goal.id);
    });
  }

  const isCompleted = goal.status === "completed";

  return (
    <div
      className={cn(
        "card group",
        isPending && "opacity-70"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={goal.category ?? ""}
              onChange={(e) => handleCategoryChange(e.target.value)}
              disabled={isPending || isCompleted}
              aria-label="Change category"
              className="inline-cell-select cursor-pointer rounded border border-border bg-transparent px-1 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.1em] text-text-dim transition-colors hover:border-emerald-dim hover:text-emerald focus:outline-none"
            >
              <option value="" className="bg-bg text-text">No category</option>
              {(Object.keys(CATEGORY_LABELS) as GoalCategory[]).map((c) => (
                <option key={c} value={c} className="bg-bg text-text">{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            {goal.target_date && (
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-text-dim">
                by {formatDate(goal.target_date)}
              </span>
            )}
          </div>
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitleDraft(goal.title); setEditingTitle(false); } }}
              className="mt-3 w-full rounded border border-emerald-dim bg-bg-raised px-2 py-1 font-display text-[1.05rem] font-semibold text-text focus:outline-none"
            />
          ) : (
            <h3
              onDoubleClick={() => !isCompleted && setEditingTitle(true)}
              className={cn(
                "mt-3 cursor-default font-display text-[1.05rem] font-semibold leading-snug text-text",
                isCompleted && "text-text-muted line-through",
                !isCompleted && "hover:text-emerald"
              )}
              title="Double-click to edit"
            >
              {goal.title}
            </h3>
          )}
          {goal.description && (
            <p className="mt-1.5 text-[0.82rem] leading-relaxed text-text-muted">
              {goal.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          aria-label="Delete goal"
          className="shrink-0 rounded p-1 text-[0.85rem] text-text-dim opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
        >
          ×
        </button>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-text-dim">
            progress
          </span>
          <span className="font-mono text-[0.82rem] font-semibold text-text">
            {optimisticProgress}%
          </span>
        </div>
        <ProgressBar value={optimisticProgress} />
      </div>

      {!isCompleted && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => nudge(-5)}
            disabled={isPending || optimisticProgress === 0}
            className="btn btn-outline btn-sm disabled:opacity-50"
          >
            −5
          </button>
          <button
            type="button"
            onClick={() => nudge(5)}
            disabled={isPending || optimisticProgress === 100}
            className="btn btn-outline btn-sm disabled:opacity-50"
          >
            +5
          </button>
          <button
            type="button"
            onClick={markComplete}
            disabled={isPending}
            className="btn btn-primary btn-sm disabled:opacity-50"
          >
            Mark complete
          </button>
          <button
            type="button"
            onClick={archive}
            disabled={isPending}
            className="btn btn-outline btn-sm ml-auto disabled:opacity-50"
          >
            Archive
          </button>
        </div>
      )}

      <InsightReveal insight={insight} />

      <ConfirmDialog
        open={confirmOpen}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
        title="Delete this goal?"
        description={goal.title}
        confirmLabel="Delete"
      />
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
