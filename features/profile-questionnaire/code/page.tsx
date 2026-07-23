import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/PageHead";
import { Card } from "@/components/dashboard/Card";
import { QuestionnaireSection } from "@/components/dashboard/QuestionnaireSection";
import { questionnaireSections } from "@/content/profile-questionnaire";
import { getProfileQuestionnaire } from "@/lib/repo";
import {
  PROFILE_SECTION_ORDER,
  profileSectionsComplete
} from "@/lib/database";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false }
};

/**
 * The strategy questionnaire, rendered inline in the dashboard.
 *
 * One Card per section. Each section is its own form, so progress is
 * saved per section without forcing a single 36-question commit. Every
 * answered section feeds the Smart Tool system prompt at runtime via
 * the profile slice in `lib/claude.ts`, which means the rest of the
 * dashboard starts speaking in Jordan's own words as soon as he saves
 * even one section.
 *
 * No hard gate: Jordan can ignore this page forever and the dashboard
 * still works on the v0.3 provisional context. The point is leverage,
 * not friction.
 */
export default async function ProfilePage() {
  const profile = await getProfileQuestionnaire();
  const completed = profileSectionsComplete(profile);
  const total = PROFILE_SECTION_ORDER.length;

  return (
    <div>
      <PageHead
        title="Profile"
        sub="The strategy questionnaire. The more honest you are here, the sharper everything else on this dashboard gets. Save sections one at a time. You can come back."
      />

      <Card label="Why this exists" className="mb-6">
        <p className="text-[0.85rem] leading-relaxed text-text-med">
          This isn&apos;t a personality quiz. It&apos;s the foundation for the
          rest of the platform. The Smart Tool, the Discovery Builder, and the
          public-site copy all run off whatever you write here. Empty answers
          mean generic output. Honest answers mean the system actually knows
          who it&apos;s thinking on behalf of.
        </p>
        <p className="mt-3 text-[0.85rem] leading-relaxed text-text-med">
          Some questions will feel uncomfortable. That&apos;s the point. If you
          already had clarity on all of this, you wouldn&apos;t need a strategy.
        </p>
        <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-text-dim">
            Progress
          </span>
          <span className="font-mono text-[0.78rem] text-text">
            {completed} / {total} sections saved
          </span>
          <div className="ml-auto h-1.5 w-32 overflow-hidden rounded-full bg-bg-raised">
            <div
              className="h-full bg-emerald transition-all"
              style={{ width: `${(completed / total) * 100}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        {questionnaireSections.map((section) => (
          <Card
            key={section.key}
            label={`${String(section.number).padStart(2, "0")} · ${section.title}`}
            labelAccent
          >
            <p className="mb-5 text-[0.78rem] italic text-text-muted">
              {section.blurb}
            </p>
            <QuestionnaireSection section={section} initial={profile} />
          </Card>
        ))}
      </div>
    </div>
  );
}
