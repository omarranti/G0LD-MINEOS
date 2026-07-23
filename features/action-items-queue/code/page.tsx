import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/PageHead";
import { Card } from "@/components/dashboard/Card";
import { ActionForm } from "@/components/dashboard/ActionForm";
import { ActionList } from "@/components/dashboard/ActionList";
import { PRIORITY_ORDER, type ActionPriority } from "@/lib/database";
import { listActions, listGoals } from "@/lib/repo";
import { getInsight } from "@/lib/insights";
import { SuggestionChip as ActionSuggestionChip } from "@/components/dashboard/SuggestionChip";

export const metadata: Metadata = {
  title: "Actions",
  robots: { index: false, follow: false }
};

export default async function ActionsPage() {
  const [actionRows, goalRows] = await Promise.all([listActions(), listGoals()]);

  const actions = actionRows.slice().sort((a, b) => {
    const p =
      PRIORITY_ORDER[a.priority as ActionPriority] -
      PRIORITY_ORDER[b.priority as ActionPriority];
    if (p !== 0) return p;
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  const goals = goalRows
    .filter((g) => g.status === "active")
    .map((g) => ({ id: g.id, title: g.title }));
  const goalLookup: Record<string, string> = Object.fromEntries(
    goals.map((g) => [g.id, g.title])
  );

  const insights: Record<string, ReturnType<typeof getInsight>> = {};
  for (const a of actions) {
    insights[a.id] = getInsight("action", a.id);
  }

  return (
    <div>
      <PageHead title="Actions" sub="Daily operating system. Not a to-do list." />

      <Card label="Quick add" labelAccent>
        <ActionForm goals={goals} />
      </Card>

      {actions.length > 0 && (
        <Card label={`All actions · ${actions.length}`}>
          <ActionList actions={actions} goals={goalLookup} insights={insights} />
        </Card>
      )}

      {actions.length === 0 && (
        <Card label="Get started">
          <div className="py-4">
            <div className="font-display text-[1rem] font-semibold text-text">
              Start with what matters today.
            </div>
            <p className="mt-1.5 text-[0.85rem] text-text-muted">
              Type your own above, or tap a suggestion to get moving.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "Follow up with a warm intro",
                "Update LinkedIn headline",
                "Draft outreach email to a prospect",
                "Block 30min for tool demo prep",
                "Research one new contact at Meridian"
              ].map((s) => (
                <ActionSuggestionChip key={s} suggestion={s} />
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
