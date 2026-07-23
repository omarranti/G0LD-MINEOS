import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Closing CTA skeleton (the ask). Mirror of the hero on a dark ground for
 * contrast: eyebrow pill, restated headline with an emphasized word, one line,
 * a single primary action. Deliberately ONE action, not a menu. Uses the dark
 * background token so it reads as a section break regardless of theme.
 * COPY IS PLACEHOLDER.
 */
export function CtaSection() {
  return (
    <section className="relative overflow-hidden px-5 py-16 sm:px-8 sm:py-24 md:py-32" style={{ backgroundColor: "var(--bg-dark)" }}>
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-0 h-[400px] w-[400px] rounded-full blur-[120px]" style={{ backgroundColor: "color-mix(in srgb, var(--color-accent) 5%, transparent)" }} />

      <div className="relative mx-auto max-w-xl text-center">
        <div className="inline-flex items-center gap-2 rounded-pill border border-white/15 bg-white/5 px-4 py-1.5 backdrop-blur-sm">
          <span className="font-body text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dark-primary)" }}>
            One last nudge
          </span>
        </div>

        <h2 className="mt-5 font-display text-2xl font-normal sm:text-3xl md:text-4xl" style={{ color: "var(--text-dark-primary)" }}>
          Restate the promise, <em className="italic">then ask.</em>
        </h2>
        <p className="mx-auto mt-4 max-w-md font-body text-sm leading-relaxed sm:text-base" style={{ color: "var(--text-dark-muted)" }}>
          One sentence that removes the last objection and points at the single action.
        </p>

        <div className="mt-7 flex justify-center">
          <Link href="/contact" className="btn-primary">
            The one action <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
