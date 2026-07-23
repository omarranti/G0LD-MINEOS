import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/PageHead";
import { Card } from "@/components/dashboard/Card";
import { ContactForm } from "@/components/dashboard/ContactForm";
import { ContactCard } from "@/components/dashboard/ContactCard";
import { NetworkMap } from "@/components/dashboard/NetworkMap";
import type { Contact } from "@/lib/database";
import { listContacts } from "@/lib/repo";
import { getInsight } from "@/lib/insights";

export const metadata: Metadata = {
  title: "Network",
  robots: { index: false, follow: false }
};

function isContactOverdue(c: Contact): boolean {
  if (!c.follow_up_days) return false;
  if (!c.last_interaction_date) return true;
  const last = new Date(c.last_interaction_date + "T00:00:00");
  const due = new Date(last);
  due.setDate(due.getDate() + c.follow_up_days);
  return new Date() >= due;
}

export default async function NetworkPage() {
  const contacts = await listContacts();
  const overdue = contacts.filter(isContactOverdue);
  const overdueIds = new Set(overdue.map((c) => c.id));
  const others = contacts.filter((c) => !overdueIds.has(c.id));

  const ranked = others.slice().sort((a, b) => {
    const as = a.relationship_strength ?? 0;
    const bs = b.relationship_strength ?? 0;
    return bs - as;
  });

  return (
    <div>
      <PageHead
        title="Network"
        sub="Personal CRM. Not Salesforce. Something human."
      />

      {contacts.length > 0 && (
        <Card label="Map">
          <NetworkMap contacts={contacts} />
        </Card>
      )}

      <Card label="New contact" labelAccent>
        <ContactForm />
      </Card>

      {overdue.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2 px-1">
            <div className="h-1.5 w-1.5 animate-recPulse rounded-full bg-amber" />
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-amber">
              Due for follow-up · {overdue.length}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {overdue.map((c) => (
              <ContactCard
                key={c.id}
                contact={c}
                isOverdue
                insight={getInsight("contact", c.id)}
              />
            ))}
          </div>
        </div>
      )}

      {ranked.length > 0 && (
        <div>
          <div className="mb-3 px-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-text-dim">
            Contacts · {ranked.length}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {ranked.map((c) => (
              <ContactCard
                key={c.id}
                contact={c}
                insight={getInsight("contact", c.id)}
              />
            ))}
          </div>
        </div>
      )}

      {contacts.length === 0 && (
        <Card>
          <div className="py-6 text-center">
            <div className="font-display text-[1rem] font-semibold text-text">
              No contacts yet.
            </div>
            <p className="mt-1.5 text-[0.85rem] text-text-muted">
              Add your first contact above. Set a follow-up cadence and overdue
              contacts surface on the dashboard home.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
