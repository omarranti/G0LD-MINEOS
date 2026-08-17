import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/PageHead";
import { Card } from "@/components/dashboard/Card";
import { GoalForm } from "@/components/dashboard/GoalForm";
import { GoalCard } from "@/components/dashboard/GoalCard";
import { listGoals } from "@/lib/repo";
import { getInsight } from "@/lib/insights";
import { SuggestionChip } from "@/components/dashboard/SuggestionChip";

export const metadata: Metadata = {
  title: "Goals",
  robots: { index: false, follow: false }
};

export default async function GoalsPage() {
  const goals = await listGoals();
  const active = goals.filter((g) => g.status === "active");
  const completed = goals.filter((g) => g.status === "completed");
  const archived = goals.filter((g) => g.status === "archived");

  return (
    <div>
      <PageHead
        title="Goals"
        sub="Quarterly and annual commitments. Progress pulls from linked actions and manual nudges."
      />

      <Card label="New goal" labelAccent>
        <GoalForm />
      </Card>

      {active.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 px-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-text-dim">
            Active · {active.length}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {active.map((g) => (
              <GoalCard key={g.id} goal={g} insight={getInsight("goal", g.id)} />
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 px-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-text-dim">
            Completed · {completed.length}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {completed.map((g) => (
              <GoalCard key={g.id} goal={g} insight={getInsight("goal", g.id)} />
            ))}
          </div>
        </div>
      )}

      {archived.length > 0 && (
        <details className="group mt-2">
          <summary className="cursor-pointer px-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-text-dim transition-colors hover:text-text-med">
            Archived · {archived.length}
          </summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {archived.map((g) => (
              <GoalCard key={g.id} goal={g} insight={getInsight("goal", g.id)} />
            ))}
          </div>
        </details>
      )}

      {goals.length === 0 && (
        <Card label="Get started">
          <div className="py-4">
            <div className="font-display text-[1rem] font-semibold text-text">
              Set the targets that shape everything else.
            </div>
            <p className="mt-1.5 text-[0.85rem] text-text-muted">
              Goals drive the action list, progress tracking, and the Smart Tool context. Tap a suggestion or write your own.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "Build personal brand on LinkedIn",
                "Land a second income stream by Q3",
                "Grow network by 10 warm contacts this quarter",
                "Save 3 months of runway"
              ].map((s) => (
                <SuggestionChip key={s} suggestion={s} />
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
