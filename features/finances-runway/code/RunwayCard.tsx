import {
  computeRunwayMonths,
  netMonthly,
  totalExpenses,
  MONTH_NAMES,
  type Finance
} from "@/lib/database";
import type { CardInsight } from "@/lib/insights";
import { InsightReveal } from "./InsightReveal";

/**
 * Runway + latest-month summary card.
 * Server component for the math. InsightReveal below it is the
 * lone client island on this card.
 */
export function RunwayCard({
  history,
  insight
}: {
  history: Finance[];
  insight?: CardInsight;
}) {
  const runway = computeRunwayMonths(history);
  const latest = history[0];

  if (!latest) {
    return (
      <div className="card">
        <div className="card-label em">Runway</div>
        <p className="text-[0.9rem] text-text-med">
          Log your first month below to see runway, burn, and savings rate.
        </p>
      </div>
    );
  }

  const net = netMonthly(latest);
  const expenses = totalExpenses(latest);
  const income = Number(latest.income) + Number(latest.side_income);
  const savingsRate = income > 0 ? (net / income) * 100 : 0;

  const runwayLabel =
    runway === null
      ? "—"
      : runway === Infinity
        ? "∞"
        : runway.toFixed(1);

  return (
    <div className="card">
      <div className="card-label em">
        Runway · {MONTH_NAMES[latest.month - 1]} {latest.year}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <div className="stat-label">Months of runway</div>
          <div className="stat-value em">{runwayLabel}</div>
          <div className="stat-sub">
            {runway === Infinity
              ? "Positive cash flow"
              : runway === null
                ? "Needs data"
                : "At current burn"}
          </div>
        </div>
        <div>
          <div className="stat-label">Monthly net</div>
          <div className={`stat-value ${net >= 0 ? "em" : ""}`}>
            {formatMoney(net)}
          </div>
          <div className="stat-sub">
            {formatMoney(income)} in, {formatMoney(expenses)} out
          </div>
        </div>
        <div>
          <div className="stat-label">Savings rate</div>
          <div className="stat-value">{savingsRate.toFixed(0)}%</div>
          <div className="stat-sub">of gross income</div>
        </div>
      </div>

      <div className="sep" />

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
        <MiniStat label="Rent" value={formatMoney(latest.expenses_rent)} />
        <MiniStat label="Food" value={formatMoney(latest.expenses_food)} />
        <MiniStat label="Transport" value={formatMoney(latest.expenses_transport)} />
        <MiniStat label="Subscriptions" value={formatMoney(latest.expenses_subscriptions)} />
      </div>

      <InsightReveal insight={insight} />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.12em] text-text-dim">
        {label}
      </div>
      <div className="font-mono text-[0.9rem] font-semibold text-text">{value}</div>
    </div>
  );
}

function formatMoney(n: number | string): string {
  const num = Number(n);
  const sign = num < 0 ? "−" : "";
  const abs = Math.abs(num);
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
