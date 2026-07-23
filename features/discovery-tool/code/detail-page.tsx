import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/dashboard/PageHead";
import { Card } from "@/components/dashboard/Card";
import { Stat, StatGrid } from "@/components/dashboard/Stat";
import { RevenueChart } from "@/components/dashboard/discovery/RevenueChart";
import { ExecutionRoadmap } from "@/components/dashboard/discovery/ExecutionRoadmap";
import { KPIBoard } from "@/components/dashboard/discovery/KPIBoard";
import {
  listDiscoveryIdeas,
  listRevenueProjections,
  listMilestonesForIdea,
  listKPIsForIdea
} from "@/lib/repo";
import { computeAnnualTotals } from "@/lib/discovery-types";
import { STATUS_LABELS } from "@/lib/discovery-types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Idea detail",
  robots: { index: false, follow: false }
};

type Params = { id: string };

export default async function IdeaDetailPage({
  params
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;

  const [allIdeas, allProjections, milestones, kpis] = await Promise.all([
    listDiscoveryIdeas(),
    listRevenueProjections(),
    listMilestonesForIdea(id),
    listKPIsForIdea(id)
  ]);

  const idea = allIdeas.find((i) => i.id === id);
  if (!idea) notFound();

  const projections = allProjections.filter((p) => p.idea_id === id);
  const totals = computeAnnualTotals(projections);
  const netModerate = totals.moderate - totals.costs;

  // Find break-even month on the moderate scenario
  let breakEvenMonth: number | null = null;
  let cumulative = 0;
  for (const row of projections.slice().sort((a, b) => a.month - b.month)) {
    cumulative += Number(row.moderate) - Number(row.monthly_costs);
    if (cumulative > 0 && breakEvenMonth === null) {
      breakEvenMonth = row.month;
      break;
    }
  }

  return (
    <div>
      <Link
        href="/discovery"
        className="mb-5 inline-block font-mono text-[0.65rem] uppercase tracking-[0.14em] text-text-dim transition-colors hover:text-text"
      >
        ← Back to Discovery
      </Link>

      <PageHead
        title={idea.name}
        sub={idea.one_line_pitch ?? ""}
        right={
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "badge",
                idea.status === "active" && "badge-emerald",
                idea.status === "explored" && "badge-muted",
                idea.status === "parked" && "badge-amber",
                idea.status === "killed" && "badge-red"
              )}
            >
              {STATUS_LABELS[idea.status]}
            </span>
            <div className="text-right">
              <div className="font-mono text-[1.6rem] font-bold leading-none text-emerald">
                {idea.comparison_score ?? "—"}
              </div>
              <div className="mt-0.5 font-mono text-[0.55rem] uppercase tracking-[0.12em] text-text-dim">
                score
              </div>
            </div>
          </div>
        }
      />

      {/* Why + revenue model */}
      <div className="grid gap-5 md:grid-cols-2">
        <Card label="Why Jordan" labelAccent>
          <p className="text-[0.88rem] leading-relaxed text-text-med">
            {idea.why_jordan ?? "—"}
          </p>
        </Card>
        <Card label="Revenue model">
          <dl className="space-y-2 text-[0.82rem]">
            <Row label="Model" value={idea.revenue_model ?? "—"} />
            <Row label="Customer" value={idea.target_customer ?? "—"} />
            <Row label="Startup cost" value={idea.startup_cost_estimate ?? "—"} />
            <Row label="Time to first $" value={idea.time_to_first_dollar ?? "—"} />
            <Row
              label="Effort / Risk"
              value={`${idea.effort_level ?? "—"} / ${idea.risk_level ?? "—"}`}
            />
          </dl>
        </Card>
      </div>

      {/* Revenue projection chart */}
      <div className="mt-6">
        <Card label="12-month revenue projection" labelAccent>
          {projections.length > 0 ? (
            <>
              <p className="mb-4 text-[0.75rem] text-text-muted">
                Three scenarios over the next twelve months, with actual revenue
                overlaid where logged. Break-even is where cumulative net crosses
                zero on the moderate scenario.
              </p>
              <RevenueChart rows={projections} />
              <StatGrid>
                <Stat
                  label="Y1 conservative"
                  value={formatMoney(totals.conservative)}
                  sub="total"
                />
                <Stat
                  label="Y1 moderate"
                  value={formatMoney(totals.moderate)}
                  sub="total"
                  accent
                />
                <Stat
                  label="Y1 aggressive"
                  value={formatMoney(totals.aggressive)}
                  sub="total"
                />
                <Stat
                  label="Break-even"
                  value={
                    breakEvenMonth !== null ? `M${breakEvenMonth}` : "Beyond Y1"
                  }
                  sub="on moderate"
                  accent={breakEvenMonth !== null && breakEvenMonth <= 6}
                />
              </StatGrid>
              <div className="mt-2 text-[0.72rem] text-text-muted">
                Net at moderate (revenue minus costs): {formatMoney(netModerate)}.
                Assumptions:{" "}
                {(idea.assumptions as Record<string, string>).moderate ??
                  "not documented"}
                .
              </div>
            </>
          ) : (
            <p className="text-[0.82rem] text-text-muted">
              No revenue projections added yet. Log scenario curves in the
              revenue_projections table to see this chart.
            </p>
          )}
        </Card>
      </div>

      {/* Roadmap + KPIs */}
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
        <ExecutionRoadmap
          milestones={milestones}
          currentPhase={idea.execution_phase}
        />
        <KPIBoard kpis={kpis} />
      </div>

      {/* Risk */}
      {idea.risk_explanation && (
        <div className="mt-6">
          <Card label="Primary risk">
            <p className="text-[0.85rem] leading-relaxed text-text-med">
              {idea.risk_explanation}
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2 last:border-0">
      <dt className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-text-dim">
        {label}
      </dt>
      <dd className="text-right text-text-med">{value}</dd>
    </div>
  );
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n)}`;
}
