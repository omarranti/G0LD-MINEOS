"use client";

import { useMemo, useState } from "react";
import type { Action } from "@/lib/database";
import type { CardInsight } from "@/lib/insights";
import { ActionItem } from "./ActionItem";

type GoalLookup = Record<string, string>;

export function ActionList({
  actions,
  goals,
  insights
}: {
  actions: Action[];
  goals: GoalLookup;
  insights: Record<string, CardInsight | undefined>;
}) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => {
      const hay = [
        a.title,
        a.priority,
        a.goal_id ? goals[a.goal_id] : ""
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [actions, goals, filter]);

  const pending = filtered.filter((a) => a.status === "pending");
  const done = filtered.filter((a) => a.status === "done");

  return (
    <div>
      {actions.length > 3 && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by title, priority, goal..."
            className="w-full max-w-sm rounded-md border border-border bg-bg-raised px-3 py-1.5 text-[0.82rem] text-text-med placeholder:text-text-dim focus:border-emerald-dim focus:outline-none"
          />
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-text-dim">
            {filtered.length} / {actions.length}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 px-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-text-dim">
            Pending · {pending.length}
          </div>
          <div className="space-y-0.5">
            {pending.map((a) => (
              <ActionItem
                key={a.id}
                action={a}
                goals={goals}
                insight={insights[a.id]}
              />
            ))}
          </div>
        </div>
      )}

      {done.length > 0 && (
        <div>
          <div className="mb-2 px-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-text-dim">
            Done · {done.length}
          </div>
          <div className="space-y-0.5">
            {done.map((a) => (
              <ActionItem
                key={a.id}
                action={a}
                goals={goals}
                insight={insights[a.id]}
              />
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && actions.length > 0 && (
        <div className="py-10 text-center text-[0.85rem] text-text-dim">
          No actions match that filter.
        </div>
      )}
    </div>
  );
}
