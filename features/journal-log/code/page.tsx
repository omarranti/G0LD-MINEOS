import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/PageHead";
import { Card } from "@/components/dashboard/Card";
import { JournalForm } from "@/components/dashboard/JournalForm";
import { JournalEntryCard } from "@/components/dashboard/JournalEntryCard";
import { listJournalEntries } from "@/lib/repo";
import { getInsight } from "@/lib/insights";

export const metadata: Metadata = {
  title: "Journal",
  robots: { index: false, follow: false }
};

export default async function JournalPage() {
  const entries = await listJournalEntries();

  return (
    <div>
      <PageHead
        title="Journal"
        sub="Meeting notes, ideas, reflections, strategy thoughts. Taggable, linkable, yours."
      />

      <Card label="New entry" labelAccent>
        <JournalForm />
      </Card>

      {entries.length > 0 ? (
        <div className="space-y-4">
          {entries.map((e) => (
            <JournalEntryCard
              key={e.id}
              entry={e}
              insight={getInsight("journal", e.id)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <div className="py-6 text-center">
            <div className="font-display text-[1rem] font-semibold text-text">
              No entries yet.
            </div>
            <p className="mt-1.5 text-[0.85rem] text-text-muted">
              The journal is where half-formed ideas live until they earn their
              way into goals, actions, or decisions.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
