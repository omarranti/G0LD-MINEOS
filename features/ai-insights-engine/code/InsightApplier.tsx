"use client";

import { useState } from "react";
import type { ExtractedInsight } from "@/lib/claude";

/**
 * Shows goals and actions extracted from a chat session and lets the
 * user apply them to the dashboard with one click.
 */
export function InsightApplier({ insights }: { insights: ExtractedInsight }) {
  const hasGoals = insights.goals.length > 0;
  const hasActions = insights.actions.length > 0;
  if (!hasGoals && !hasActions) return null;

  return (
    <div className="mt-5 rounded-md border border-emerald-dim bg-emerald-bg/40 px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-emerald">
          Suggested from this session
        </span>
      </div>

      {hasGoals && (
        <div className="mb-3">
          <div className="mb-1.5 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-text-dim">
            Goals
          </div>
          <div className="space-y-1.5">
            {insights.goals.map((g, i) => (
              <InsightRow
                key={i}
                label={g.title}
                sub={g.description}
                type="goal"
                data={g}
              />
            ))}
          </div>
        </div>
      )}

      {hasActions && (
        <div>
          <div className="mb-1.5 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-text-dim">
            Actions
          </div>
          <div className="space-y-1.5">
            {insights.actions.map((a, i) => (
              <InsightRow
                key={i}
                label={a.title}
                sub={`priority: ${a.priority}`}
                type="action"
                data={a}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InsightRow({
  label,
  sub,
  type,
  data
}: {
  label: string;
  sub?: string;
  type: "goal" | "action";
  data: Record<string, string>;
}) {
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">("idle");

  async function apply() {
    setStatus("pending");
    try {
      const res = await fetch("/api/insights/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, data })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed.");
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-md border border-white/5 bg-bg-raised px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[0.82rem] font-medium text-text">{label}</div>
        {sub && (
          <div className="mt-0.5 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-text-dim">
            {sub}
          </div>
        )}
      </div>
      {status === "idle" && (
        <button
          type="button"
          onClick={apply}
          className="shrink-0 rounded-full border border-emerald-dim bg-emerald-bg px-2.5 py-1 font-mono text-[0.62rem] uppercase tracking-[0.1em] text-emerald transition-colors hover:border-emerald"
        >
          + Add
        </button>
      )}
      {status === "pending" && (
        <span className="shrink-0 font-mono text-[0.62rem] uppercase tracking-[0.1em] text-text-dim">
          Adding…
        </span>
      )}
      {status === "done" && (
        <span className="shrink-0 font-mono text-[0.62rem] uppercase tracking-[0.1em] text-emerald">
          Added
        </span>
      )}
      {status === "error" && (
        <button
          type="button"
          onClick={apply}
          className="shrink-0 font-mono text-[0.62rem] uppercase tracking-[0.1em] text-danger"
        >
          Retry
        </button>
      )}
    </div>
  );
}
