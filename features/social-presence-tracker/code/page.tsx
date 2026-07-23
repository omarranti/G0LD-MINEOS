import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/PageHead";
import { Card } from "@/components/dashboard/Card";
import { Stat, StatGrid } from "@/components/dashboard/Stat";
import { socialPresence } from "@/content/social-presence";

export const metadata: Metadata = {
  title: "Social",
  robots: { index: false, follow: false }
};

export default async function SocialPage() {
  const { headline, platforms, identity, credentials, pillars, gap, playbooks } =
    socialPresence;

  const ig = platforms.find((p) => p.id === "instagram");

  return (
    <div>
      <PageHead
        title="Social"
        sub="The audit. Where Jordan already is, where the gap is, and the playbooks that close it."
      />

      <StatGrid>
        <Stat
          label="Followers · IG"
          value={ig?.followers ?? "–"}
          sub="Instagram only, not aggregated."
          accent
        />
        <Stat
          label="Following · IG"
          value={ig?.following ?? "–"}
          sub="Outflow exceeds inflow."
        />
        <Stat
          label="Posts · IG"
          value={ig?.posts ?? "–"}
          sub="Severely underleveraged."
        />
        <Stat
          label="Surfaces"
          value={platforms.length}
          sub="IG, LinkedIn, FB, SC, Depop."
        />
      </StatGrid>

      <Card label="Headline read" labelAccent>
        <p className="text-[0.92rem] leading-relaxed text-text">{headline}</p>
      </Card>

      <Card label="Identity">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-text-dim">
              Handle
            </div>
            <div className="mt-1 font-display text-[0.95rem] font-semibold text-text">
              {identity.handle}
            </div>
            <div className="mt-1 text-[0.78rem] text-text-muted">
              {identity.handleNote}
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-text-dim">
              Bio · {identity.bioPlatform}
            </div>
            <div className="mt-1 font-display text-[0.95rem] font-semibold text-text">
              {identity.bio}
            </div>
            <div className="mt-1 text-[0.78rem] text-text-muted">
              One word. Confident. Leaves room for the work to fill in the rest.
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-text-dim">
              Quote
            </div>
            <div className="mt-1 font-display text-[0.95rem] font-semibold text-text">
              &ldquo;{identity.quote}&rdquo;
            </div>
            <div className="mt-1 text-[0.78rem] text-text-muted">
              {identity.quoteNote}
            </div>
          </div>
        </div>
      </Card>

      <Card label={`Surfaces · ${platforms.length}`}>
        <div className="grid gap-4 md:grid-cols-2">
          {platforms.map((p) => (
            <a
              key={p.id}
              href={p.href}
              target="_blank"
              rel="noreferrer"
              className="block rounded-md border border-border bg-bg-raised p-4 transition-colors hover:border-border-light"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-display text-[0.95rem] font-semibold text-text">
                  {p.label}
                </div>
                <div className="font-mono text-[0.7rem] text-text-muted">
                  {p.handle}
                </div>
              </div>
              {(p.followers || p.following || p.posts) && (
                <div className="mt-2 flex gap-4 font-mono text-[0.65rem] text-text-dim">
                  {p.followers && (
                    <span>
                      <span className="text-emerald">{p.followers}</span> followers
                    </span>
                  )}
                  {p.following && (
                    <span>
                      <span className="text-text-med">{p.following}</span> following
                    </span>
                  )}
                  {p.posts && (
                    <span>
                      <span className="text-amber">{p.posts}</span> posts
                    </span>
                  )}
                </div>
              )}
              {p.note && (
                <p className="mt-3 text-[0.78rem] leading-relaxed text-text-muted">
                  {p.note}
                </p>
              )}
            </a>
          ))}
        </div>
      </Card>

      <Card label="Credential signals">
        <ul className="space-y-2">
          {credentials.map((line) => (
            <li
              key={line}
              className="flex gap-3 text-[0.85rem] leading-relaxed text-text-med"
            >
              <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-emerald" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card label="Content pillars">
        <div className="grid gap-3 md:grid-cols-2">
          {pillars.map((pillar) => (
            <div
              key={pillar.label}
              className="rounded-md border border-border bg-bg-raised p-4"
            >
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-emerald">
                {pillar.label}
              </div>
              <p className="mt-1.5 text-[0.82rem] leading-relaxed text-text-med">
                {pillar.body}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card label={gap.title} labelAccent>
        <div className="space-y-3">
          {gap.body.map((para, i) => (
            <p key={i} className="text-[0.88rem] leading-relaxed text-text">
              {para}
            </p>
          ))}
        </div>
        <div className="mt-5 border-t border-border/60 pt-4">
          <div className="mb-3 font-mono text-[0.55rem] uppercase tracking-[0.14em] text-text-dim">
            Moves
          </div>
          <ol className="space-y-2">
            {gap.moves.map((move, i) => (
              <li
                key={i}
                className="flex gap-3 text-[0.85rem] leading-relaxed text-text-med"
              >
                <span className="font-mono text-[0.7rem] text-emerald">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{move}</span>
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <Card label="Operator playbooks">
        <p className="mb-4 text-[0.78rem] text-text-muted">
          Run these from Claude Code to power this section. The dashboard is the
          working surface, the slash command is the brain.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {playbooks.map((pb) => (
            <div
              key={pb.command}
              className="flex flex-col rounded-md border border-border bg-bg-raised p-4"
            >
              <div className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-emerald">
                {pb.command}
              </div>
              <div className="mt-1 font-display text-[0.92rem] font-semibold text-text">
                {pb.label}
              </div>
              <p className="mt-2 flex-1 text-[0.78rem] leading-relaxed text-text-muted">
                {pb.body}
              </p>
              <div className="mt-3 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-text-dim">
                ▸ {pb.cta}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
