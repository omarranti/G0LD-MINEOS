import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/PageHead";
import { Card } from "@/components/dashboard/Card";
import { Stat, StatGrid } from "@/components/dashboard/Stat";
import { SessionLauncher } from "@/components/dashboard/discovery/SessionLauncher";
import { IdeaCard } from "@/components/dashboard/discovery/IdeaCard";
import { Leaderboard } from "@/components/dashboard/discovery/Leaderboard";
import { DiscoveryIdeaForm } from "@/components/dashboard/discovery/DiscoveryIdeaForm";
import {
  listDiscoveryIdeas,
  listRevenueProjections
} from "@/lib/repo";
import { computeAnnualTotals, type IdeaTotals } from "@/lib/discovery-types";
import type { RevenueProjection } from "@/lib/discovery-types";

export const metadata: Metadata = {
  title: "Discovery Builder",
  robots: { index: false, follow: false }
};

export default async function DiscoveryPage() {
  const [ideas, projections] = await Promise.all([
    listDiscoveryIdeas(),
    listRevenueProjections()
  ]);

  // Group projections by idea_id for O(1) lookup
  const projsByIdea = projections.reduce<Record<string, RevenueProjection[]>>(
    (acc, p) => {
      (acc[p.idea_id] ||= []).push(p);
      return acc;
    },
    {}
  );

  // Precompute totals for every idea
  const totalsMap: Record<string, IdeaTotals> = Object.fromEntries(
    ideas.map((idea) => [
      idea.id,
      computeAnnualTotals(projsByIdea[idea.id] ?? [])
    ])
  );

  const active = ideas.filter((i) => i.status === "active");
  const explored = ideas.filter((i) => i.status === "explored");
  const parked = ideas.filter((i) => i.status === "parked");

  const activeTotals = active.reduce(
    (acc, idea) => {
      const t = totalsMap[idea.id]!;
      acc.moderate += t.moderate;
      acc.aggressive += t.aggressive;
      acc.actual += t.actual;
      return acc;
    },
    { moderate: 0, aggressive: 0, actual: 0 }
  );

  return (
    <div>
      <PageHead
        title="Discovery Builder"
        sub="Ideas go in raw. They come out as revenue blueprints with scenarios, costs, and execution plans."
      />

      <StatGrid>
        <Stat
          label="Active ideas"
          value={active.length}
          sub="in execution"
          accent={active.length > 0}
        />
        <Stat
          label="In library"
          value={ideas.length}
          sub={`${explored.length} explored, ${parked.length} parked`}
        />
        <Stat
          label="Projected Y1 (mod)"
          value={formatMoney(activeTotals.moderate)}
          sub="active ideas only"
          accent
        />
        <Stat
          label="Actual YTD"
          value={formatMoney(activeTotals.actual)}
          sub="logged revenue"
        />
      </StatGrid>

      <Card label="Add an idea" labelAccent>
        <DiscoveryIdeaForm />
      </Card>

      <SessionLauncher />

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {active.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2 px-1">
                <div className="h-1.5 w-1.5 animate-recPulse rounded-full bg-emerald" />
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-emerald">
                  Active · {active.length}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {active.map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    totals={totalsMap[idea.id]}
                  />
                ))}
              </div>
            </div>
          )}

          {explored.length > 0 && (
            <div>
              <div className="mb-3 px-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-text-dim">
                Explored · {explored.length}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {explored.map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    totals={totalsMap[idea.id]}
                  />
                ))}
              </div>
            </div>
          )}

          {parked.length > 0 && (
            <div>
              <div className="mb-3 px-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-text-dim">
                Parked · {parked.length}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {parked.map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    totals={totalsMap[idea.id]}
                  />
                ))}
              </div>
            </div>
          )}

          {ideas.length === 0 && (
            <Card>
              <div className="py-6 text-center">
                <div className="font-display text-[1rem] font-semibold text-text">
                  No ideas yet.
                </div>
                <p className="mt-1.5 text-[0.85rem] text-text-muted">
                  Add an idea above or start a session. Every idea becomes a
                  business case with numbers attached.
                </p>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Leaderboard ideas={ideas} totalsMap={totalsMap} />
        </div>
      </div>
    </div>
  );
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n}`;
}
