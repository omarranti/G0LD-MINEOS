"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CardInsights } from "./CardInsights";
import { hasInsightContent, type CardInsight } from "@/lib/insights";

/**
 * A tap-to-expand "intel" reveal that drops inside any card.
 *
 * Visuals:
 *   - A full-width tap bar at the bottom of the card, matching the
 *     CRT mono/uppercase labeling used everywhere else.
 *   - Chevron icon rotates on expand.
 *   - Stops propagation so the bar never fights any inline controls
 *     above it (progress nudges, strength buttons, interaction logs).
 *
 * Empty/no-insight state: if no insight is passed (or all sections
 * are empty), we render a dimmed "no intel yet" bar. This keeps the
 * affordance visible on every card so the pattern is learnable, and
 * gives future Phase 4 code a place to drop a "Generate with Claude"
 * action.
 *
 * Density: pass `compact` for row-style items (action rows, skill
 * rows, career timeline) where the tap bar should tuck in under the
 * row without adding card padding.
 */
export function InsightReveal({
  insight,
  compact = false,
  defaultOpen = false
}: {
  insight?: CardInsight;
  compact?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasContent = hasInsightContent(insight);

  function toggle(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    if (!hasContent) return;
    setOpen((v) => !v);
  }

  return (
    <div
      className={cn(
        "mt-4 border-t border-border/60",
        compact && "mt-2"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? "Collapse intel" : "Expand intel"}
        disabled={!hasContent}
        className={cn(
          "group/reveal flex w-full items-center justify-between gap-2 py-3 font-mono text-[0.6rem] uppercase tracking-[0.14em] transition-colors",
          compact && "py-2",
          hasContent
            ? "text-text-dim hover:text-emerald"
            : "cursor-default text-text-dim/60"
        )}
      >
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              hasContent ? "bg-emerald" : "bg-text-dim/40",
              hasContent && "group-hover/reveal:animate-pulse"
            )}
          />
          {hasContent
            ? open
              ? "Collapse intel"
              : "Tap to expand intel"
            : "No intel yet"}
        </span>
        {hasContent && (
          <ChevronDown
            className={cn(
              "h-3 w-3 shrink-0 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        )}
      </button>

      {open && hasContent && insight && (
        <div className={cn("pb-3 animate-fadeUp", compact && "pb-2")}>
          <CardInsights insight={insight} />
        </div>
      )}
    </div>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M2.5 4.5L6 8L9.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
