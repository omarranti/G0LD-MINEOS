"use client";

import { useOptimistic, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  deleteSkill,
  updateSkillProficiency
} from "@/app/(dashboard)/career/mutations";
import type { Skill } from "@/lib/database";
import type { CardInsight } from "@/lib/insights";
import { InsightReveal } from "./InsightReveal";

/**
 * Single skill row with a 1-10 proficiency bar that's click-to-edit.
 */
export function SkillItem({
  skill,
  insight
}: {
  skill: Skill;
  insight?: CardInsight;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, apply] = useOptimistic(
    skill.proficiency ?? 0,
    (_state: number, next: number) => next
  );

  function setLevel(n: number) {
    startTransition(async () => {
      apply(n);
      await updateSkillProficiency(skill.id, n);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteSkill(skill.id);
    });
  }

  return (
    <div
      className={cn(
        "group rounded-md border border-transparent px-2 transition-colors hover:border-border hover:bg-bg-raised/40",
        isPending && "opacity-60"
      )}
    >
      <div className="flex items-center gap-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[0.88rem] font-medium text-text">
              {skill.name}
            </span>
            {skill.is_target && (
              <span className="badge badge-amber">target</span>
            )}
          </div>
        </div>

        {/* 10-dot proficiency */}
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLevel(n)}
              disabled={isPending}
              aria-label={`Set proficiency to ${n}`}
              className={cn(
                "h-2.5 w-2.5 rounded-sm transition-colors",
                n <= optimistic
                  ? skill.is_target
                    ? "bg-amber"
                    : "bg-emerald"
                  : "bg-bg-raised hover:bg-border-light"
              )}
            />
          ))}
        </div>

        <span className="w-6 text-right font-mono text-[0.65rem] text-text-dim">
          {optimistic || "—"}
        </span>

        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          aria-label="Delete skill"
          className="shrink-0 rounded p-1 text-[0.85rem] text-text-dim opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
        >
          ×
        </button>
      </div>

      <InsightReveal insight={insight} compact />
    </div>
  );
}
