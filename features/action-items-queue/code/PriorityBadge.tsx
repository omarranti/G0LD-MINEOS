import { cn } from "@/lib/utils";
import type { ActionPriority } from "@/lib/database";

const BADGE_CLASS: Record<ActionPriority, string> = {
  must: "badge-red",
  should: "badge-amber",
  could: "badge-muted"
};

const LABEL: Record<ActionPriority, string> = {
  must: "must",
  should: "should",
  could: "could"
};

export function PriorityBadge({
  priority,
  className
}: {
  priority: ActionPriority;
  className?: string;
}) {
  return (
    <span className={cn("badge", BADGE_CLASS[priority], className)}>
      {LABEL[priority]}
    </span>
  );
}
