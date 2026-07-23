import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/PageHead";
import { SmartChat } from "@/components/dashboard/SmartChat";
import { ContextPanel } from "@/components/dashboard/ContextPanel";
import {
  listGoals,
  listActions,
  listContacts,
  listFinances,
  listJournalEntries,
  listSkills
} from "@/lib/repo";

export const metadata: Metadata = {
  title: "Smart Tool",
  robots: { index: false, follow: false }
};

export default async function SmartToolPage() {
  const [goals, actions, contacts, finances, journal, skills] =
    await Promise.all([
      listGoals(),
      listActions(),
      listContacts(),
      listFinances(),
      listJournalEntries(),
      listSkills()
    ]);

  return (
    <div>
      <PageHead
        title="Smart Tool"
        sub="Claude with full context. Brainstorm, decide, draft, strategize, brief."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <SmartChat />
        <div className="space-y-5">
          <ContextPanel
            goals={goals}
            actions={actions}
            contacts={contacts}
            finances={finances}
            journal={journal}
            skills={skills}
          />
          <div className="card">
            <div className="card-label">Tips</div>
            <ul className="space-y-2 text-[0.78rem] leading-relaxed text-text-med">
              <li>
                <span className="text-emerald">→</span> Be specific. "Should I
                take the Jordan meeting?" beats "help me decide."
              </li>
              <li>
                <span className="text-emerald">→</span> Mention actual names
                from your CRM. Claude has them loaded.
              </li>
              <li>
                <span className="text-emerald">→</span> Switch modes mid-flow.
                Brainstorm → Decide → Draft is a common arc.
              </li>
              <li>
                <span className="text-emerald">→</span> Ask for the one thing
                it would do next if it were you.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
