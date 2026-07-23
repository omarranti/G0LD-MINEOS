import { cn } from "@/lib/utils";
import { clamp } from "@/lib/utils";

/**
 * Thin progress bar matching the dashboard token system.
 * Used on goal cards and anywhere a 0 to 100 progress value
 * needs a visual indicator.
 */
export function ProgressBar({
  value,
  className,
  accent = true
}: {
  value: number;
  className?: string;
  accent?: boolean;
}) {
  const pct = clamp(Math.round(value), 0, 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-bg-raised",
        className
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full transition-all duration-300",
          accent ? "bg-emerald" : "bg-text-muted"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
