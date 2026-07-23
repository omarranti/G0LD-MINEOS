import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Hero skeleton (hook). Load-bearing parts: full-viewport section, a live
 * status/eyebrow pill, a display headline with one emphasized word, a tight
 * subtitle, a primary + ghost CTA pair, and a trust strip. Entrance uses the
 * `fade-in-up` keyframe staggered by animation-delay. All color via tokens.
 * COPY IS PLACEHOLDER: regenerate per project (tournament the headline).
 */
export function Hero() {
  return (
    <section
      className="relative flex min-h-[100svh] items-center overflow-hidden pt-16 sm:pt-24 md:pt-0"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="relative mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 md:grid md:min-h-screen md:grid-cols-2 md:items-center md:gap-16 md:py-0">
        <div className="text-center md:text-left">
          {/* Eyebrow / live status pill */}
          <div
            className="mb-4 inline-flex animate-fade-in-up items-center gap-2 rounded-pill border px-3.5 py-1.5 shadow-card backdrop-blur-sm [animation-delay:0ms] sm:mb-6"
            style={{ borderColor: "var(--hairline)", backgroundColor: "var(--bg-elevated)" }}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-accent) 60%, transparent)" }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-accent)" }} />
            </span>
            <span className="font-body text-[11px] font-medium tracking-wide" style={{ color: "var(--text-soft)" }}>
              {/* status / announcement */}
              Now available
            </span>
          </div>

          {/* Display headline with one emphasized word */}
          <h1 className="animate-fade-in-up font-display text-4xl font-normal leading-[1.05] tracking-tight [animation-delay:100ms] sm:text-5xl md:text-[3.5rem] lg:text-[4rem]">
            <span style={{ color: "var(--text-primary)" }}>Your promise, </span>
            <br className="hidden sm:block" />
            <em className="italic" style={{ color: "var(--color-accent-deep)" }}>in one line.</em>
          </h1>

          <p className="mx-auto mt-4 max-w-md animate-fade-in-up font-body text-sm leading-relaxed [animation-delay:200ms] sm:mt-6 sm:text-base md:mx-0 md:text-lg" style={{ color: "var(--text-soft)" }}>
            One or two sentences on the concrete value and who it is for. No hype, one idea.
          </p>

          {/* Primary + ghost CTA */}
          <div className="mt-6 flex animate-fade-in-up flex-col items-center gap-3 [animation-delay:300ms] sm:mt-8 sm:flex-row md:items-start">
            <Link href="/pricing" className="btn-primary">
              Primary action <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/contact" className="btn-ghost">Secondary action</Link>
          </div>

          {/* Trust strip: 2-3 proof chips */}
          <div className="mt-8 flex animate-fade-in-up flex-wrap items-center justify-center gap-6 [animation-delay:420ms] md:justify-start">
            <span className="font-body text-[12px]" style={{ color: "var(--text-muted)" }}>Proof point one</span>
            <span className="font-body text-[12px]" style={{ color: "var(--text-muted)" }}>Proof point two</span>
          </div>
        </div>
        {/* Right column: product shot / illustration (regenerate per project). */}
      </div>
    </section>
  );
}
