import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/PageHead";
import { Card } from "@/components/dashboard/Card";
import { Stat, StatGrid } from "@/components/dashboard/Stat";
import { ProspectTable } from "@/components/dashboard/ProspectTable";
import { hasNeonConfig, listProspects } from "@/lib/neon";
import type { Prospect } from "@/lib/database";

export const metadata: Metadata = {
  title: "Prospects",
  robots: { index: false, follow: false }
};

// Always render fresh — the prospects list is small (~hundreds of rows)
// and Jordan is the only writer, so caching is not worth the staleness.
export const dynamic = "force-dynamic";

export default async function ProspectsPage() {
  if (!hasNeonConfig()) {
    return <ProspectsSetupRequired />;
  }

  let prospects: Prospect[] = [];
  let loadError: string | null = null;
  try {
    prospects = await listProspects();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  if (loadError) {
    return <ProspectsLoadError error={loadError} />;
  }

  const total = prospects.length;
  const verified = prospects.filter((p) => p.seniority !== null).length;
  const cold = prospects.filter((p) => p.relationship_to_user === "unknown").length;
  const orgs = new Set(prospects.map((p) => p.target_org));
  const departments = new Set(
    prospects.map((p) => p.department).filter((d): d is string => Boolean(d))
  );

  // Top picks: highest combined score, capped at the top 6.
  const topPicks = prospects
    .filter((p) => p.fit_score !== null || p.accessibility_score !== null)
    .slice(0, 6);

  return (
    <div>
      <PageHead
        title="Prospects"
        sub="People worth meeting. Sourced cold, ranked by fit and reach."
      />

      <StatGrid>
        <Stat label="Total" value={total} sub={`${orgs.size} org${orgs.size === 1 ? "" : "s"}`} />
        <Stat
          label="Title verified"
          value={verified}
          sub={`${total - verified} need research`}
          accent={verified > 0}
        />
        <Stat label="Cold" value={cold} sub="no relationship yet" />
        <Stat label="Departments" value={departments.size} sub="distinct" />
      </StatGrid>

      {topPicks.length > 0 && (
        <Card label="Top picks · ranked by fit + accessibility" labelAccent>
          <div className="-mx-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topPicks.map((p) => (
              <TopPickCard key={p.id} prospect={p} />
            ))}
          </div>
        </Card>
      )}

      <Card label={`All prospects · ${total}`}>
        <ProspectTable prospects={prospects} />
      </Card>
    </div>
  );
}

function TopPickCard({ prospect }: { prospect: Prospect }) {
  return (
    <div className="rounded-md border border-border-light bg-bg-raised/40 p-3">
      <div className="font-display text-[0.95rem] font-semibold text-text">
        {prospect.name}
      </div>
      {(prospect.title || prospect.department) && (
        <div className="mt-0.5 text-[0.75rem] text-text-muted">
          {[prospect.title, prospect.department].filter(Boolean).join(" · ")}
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <ScoreMeter label="fit" value={prospect.fit_score} />
        <ScoreMeter label="reach" value={prospect.accessibility_score} />
      </div>
      {prospect.angle && (
        <p className="mt-3 text-[0.75rem] leading-relaxed text-text-med line-clamp-3">
          {prospect.angle}
        </p>
      )}
    </div>
  );
}

function ScoreMeter({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0;
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-text-dim">
          {label}
        </span>
        <span className="font-mono text-[0.7rem] text-text-med">
          {value === null ? "—" : value}
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-bg">
        <div
          className="h-full bg-emerald"
          style={{ width: `${Math.max(0, Math.min(100, v))}%` }}
        />
      </div>
    </div>
  );
}

function ProspectsSetupRequired() {
  return (
    <div>
      <PageHead title="Prospects" sub="Setup required" />
      <Card label="No database connection">
        <p className="text-[0.85rem] leading-relaxed text-text-med">
          The Prospects page reads from Neon Postgres. Set{" "}
          <code className="rounded bg-bg-raised px-1 py-0.5 font-mono text-[0.78rem]">
            DATABASE_URL
          </code>{" "}
          in <code className="font-mono text-[0.78rem]">apps/web/.env.local</code>{" "}
          (or via the Vercel Neon integration in production) and reload.
        </p>
      </Card>
    </div>
  );
}

function ProspectsLoadError({ error }: { error: string }) {
  return (
    <div>
      <PageHead title="Prospects" sub="Database error" />
      <Card label="Failed to load prospects">
        <p className="text-[0.85rem] leading-relaxed text-text-med">
          Could not query <code className="font-mono">public.prospects</code>{" "}
          on Neon. Most likely the table has not been created yet — run the
          migration in{" "}
          <code className="font-mono text-[0.78rem]">db/migrations/</code> against
          the project, then reload.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md border border-border-light bg-bg p-3 font-mono text-[0.7rem] text-text-dim">
          {error}
        </pre>
      </Card>
    </div>
  );
}

