import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { Timer, Frown, Droplets, Ban, type LucideIcon } from "lucide-react";

/**
 * Problem section skeleton. The reusable shape: a DATA ARRAY of pains, mapped to
 * a card grid, each wrapped in ScrollReveal for a staggered entrance. This is
 * how every list-style section here is built (features, how-it-works, pricing):
 * data drives the render, tokens drive the color, ScrollReveal drives motion.
 * COPY IS PLACEHOLDER.
 */
type Pain = { icon: LucideIcon; pain: string; color: string; bg: string };

const PAINS: Pain[] = [
  { icon: Timer, pain: "The costly status quo the reader lives with today", color: "var(--color-warm)", bg: "color-mix(in srgb, var(--color-warm) 8%, transparent)" },
  { icon: Frown, pain: "The second friction, stated in their words", color: "var(--color-accent-deep)", bg: "color-mix(in srgb, var(--color-accent) 12%, transparent)" },
  { icon: Droplets, pain: "The third, more specific pain", color: "var(--color-warm)", bg: "color-mix(in srgb, var(--color-warm) 8%, transparent)" },
  { icon: Ban, pain: "The final one that tips them into wanting a change", color: "var(--color-accent-deep)", bg: "color-mix(in srgb, var(--color-accent) 12%, transparent)" },
];

export function ProblemSection() {
  return (
    <section className="relative px-5 py-16 sm:py-24" style={{ backgroundColor: "var(--bg-elevated)" }}>
      <div className="mx-auto max-w-3xl text-center">
        <p className="section-eyebrow">The problem</p>
        <h2 className="section-title mt-3">Name the pain they already feel</h2>
        <p className="section-subtitle mx-auto mt-4 max-w-xl">
          One line that shows you understand the reader's world before you sell.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:mt-14 sm:grid-cols-2">
        {PAINS.map((p, i) => {
          const Icon = p.icon;
          return (
            <ScrollReveal key={p.pain} delay={i * 80}>
              <div
                className="flex items-start gap-4 rounded-brand-sm border p-5 shadow-card"
                style={{ borderColor: "var(--hairline)", backgroundColor: "var(--bg-primary)" }}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-brand-xs" style={{ backgroundColor: p.bg }}>
                  <Icon className="h-5 w-5" style={{ color: p.color }} />
                </span>
                <p className="text-left font-body text-body" style={{ color: "var(--text-soft)" }}>{p.pain}</p>
              </div>
            </ScrollReveal>
          );
        })}
      </div>
    </section>
  );
}
