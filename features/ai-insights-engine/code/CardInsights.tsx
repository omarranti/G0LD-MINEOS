import type { CardInsight } from "@/lib/insights";

/**
 * The structured "intel" panel that renders inside an expanded card.
 *
 * Sections are conditional — any that are missing from the insight
 * just don't render. The order is deliberate:
 *
 *   1. context       — one-line framing, smallest type
 *   2. instructions  — numbered do-this-then-this checklist
 *   3. guides        — bulleted strategic guidance
 *   4. golden        — amber callout, the one high-leverage move
 *   5. risks         — red callout, what to watch for
 *
 * Styling mirrors the zinc/emerald system already in globals.css.
 * Uppercase mono labels with 0.14em tracking match the existing
 * dashboard typography.
 */
export function CardInsights({ insight }: { insight: CardInsight }) {
  return (
    <div className="mt-3 space-y-4 text-[0.82rem] leading-relaxed text-text-med">
      {insight.context && (
        <p className="border-l-2 border-emerald/40 pl-3 text-[0.82rem] italic text-text-med">
          {insight.context}
        </p>
      )}

      {insight.instructions && insight.instructions.length > 0 && (
        <Section label="Instructions">
          <ol className="space-y-1.5">
            {insight.instructions.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-mono text-[0.7rem] font-semibold text-emerald">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-text-med">{step}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {insight.guides && insight.guides.length > 0 && (
        <Section label="Guides">
          <ul className="space-y-1.5">
            {insight.guides.map((g, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-dim" />
                <span className="flex-1 text-text-med">{g}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {insight.goldenOpportunity && (
        <div className="rounded-md border border-amber/30 bg-amber/5 p-3">
          <div className="mb-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-amber">
            ⦿ Golden Opportunity
          </div>
          <p className="text-[0.82rem] leading-relaxed text-text">
            {insight.goldenOpportunity}
          </p>
        </div>
      )}

      {insight.risks && insight.risks.length > 0 && (
        <div className="rounded-md border border-danger/25 bg-danger/5 p-3">
          <div className="mb-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-danger">
            ⚠ Risks
          </div>
          <ul className="space-y-1.5">
            {insight.risks.map((r, i) => (
              <li key={i} className="flex gap-3 text-[0.82rem] leading-relaxed text-text-med">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-danger/50" />
                <span className="flex-1">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-text-dim">
        {label}
      </div>
      {children}
    </div>
  );
}
