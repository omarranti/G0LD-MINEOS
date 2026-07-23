import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/PageHead";
import { Card } from "@/components/dashboard/Card";
import { CareerEventForm } from "@/components/dashboard/CareerEventForm";
import { CareerEventItem } from "@/components/dashboard/CareerEventItem";
import { SkillForm } from "@/components/dashboard/SkillForm";
import { SkillItem } from "@/components/dashboard/SkillItem";
import {
  SKILL_CATEGORY_LABELS,
  type Skill,
  type SkillCategory
} from "@/lib/database";
import { listCareerEvents, listSkills } from "@/lib/repo";
import { getInsight } from "@/lib/insights";

export const metadata: Metadata = {
  title: "Career",
  robots: { index: false, follow: false }
};

export default async function CareerPage() {
  const [eventRows, skills] = await Promise.all([
    listCareerEvents(),
    listSkills()
  ]);
  const events = eventRows.slice().sort((a, b) => b.date.localeCompare(a.date));

  const currentSkills = skills.filter((s) => !s.is_target);
  const targetSkills = skills.filter((s) => s.is_target);

  const skillsByCategory = currentSkills.reduce<Record<string, Skill[]>>(
    (acc, s) => {
      const key = s.category ?? "uncategorized";
      (acc[key] ||= []).push(s);
      return acc;
    },
    {}
  );

  return (
    <div>
      <PageHead
        title="Career"
        sub="Timeline of where you've been. Inventory of what you can do."
      />

      <Card label="Log an event" labelAccent>
        <CareerEventForm />
      </Card>

      {events.length > 0 && (
        <Card label={`Timeline · ${events.length}`}>
          <ol className="pl-1">
            {events.map((e) => (
              <CareerEventItem
                key={e.id}
                event={e}
                insight={getInsight("career-event", e.id)}
              />
            ))}
          </ol>
        </Card>
      )}

      <div className="mt-6">
        <Card label="Add a skill" labelAccent>
          <SkillForm />
        </Card>
      </div>

      {currentSkills.length > 0 && (
        <Card label={`Skills · ${currentSkills.length}`}>
          <div className="space-y-5">
            {(Object.keys(skillsByCategory) as string[]).map((key) => (
              <div key={key}>
                <div className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-text-dim">
                  {key === "uncategorized"
                    ? "Other"
                    : SKILL_CATEGORY_LABELS[key as SkillCategory]}
                </div>
                <div className="space-y-0.5">
                  {skillsByCategory[key].map((s) => (
                    <SkillItem
                      key={s.id}
                      skill={s}
                      insight={getInsight("skill", s.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {targetSkills.length > 0 && (
        <Card label={`Target skills · ${targetSkills.length}`} labelAccent>
          <div className="space-y-0.5">
            {targetSkills.map((s) => (
              <SkillItem
                key={s.id}
                skill={s}
                insight={getInsight("skill", s.id)}
              />
            ))}
          </div>
        </Card>
      )}

      {events.length === 0 && skills.length === 0 && (
        <Card>
          <div className="py-6 text-center">
            <div className="font-display text-[1rem] font-semibold text-text">
              Nothing logged yet.
            </div>
            <p className="mt-1.5 text-[0.85rem] text-text-muted">
              Add a career event above to start the timeline, or add a skill to
              begin the inventory.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
