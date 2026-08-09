"use client";

import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import { useSubscription } from "@/hooks/useSubscription";
import { useArticleLimit } from "@/hooks/useArticleLimit";
import { UpgradeModal } from "./UpgradeModal";
import { trackBlogArticleGated, trackPaywallCtaClicked } from "@/lib/analytics";

/**
 * PostHog flag "blog-meter-generous" controls the anonymous reading meter:
 *   - generous (default): 3 articles per month (value-before-ask; matches
 *                         Google Flexible Sampling's monthly metering)
 *   - control:            the retired 1-article-lifetime wall
 *
 * generous was rolled to 100%, so it is the DEFAULT here. While this hook
 * defaulted to control, any reader whose flag call did not resolve hit a
 * one-article-per-browser-forever wall: measured live, 80 of 177 flag calls
 * returned no variant.
 */
function useBlogMeterConfig(): { limit: number; monthly: boolean } {
  const [generous, setGenerous] = useState(true);
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    // Only an explicit "control" opts back out. An unresolved flag keeps the
    // shipped winner.
    posthog.onFeatureFlags(() =>
      setGenerous(posthog.getFeatureFlag("blog-meter-generous") !== "control"),
    );
  }, []);
  return generous ? { limit: 3, monthly: true } : { limit: 1, monthly: false };
}

interface Props {
  /** Full article HTML from server (SSR) */
  html: string;
  /** CSS class for the content container */
  className?: string;
  /** Blog post slug for analytics */
  slug?: string;
}

/**
 * Blog article content with metered access:
 * - Paid users: full content always
 * - Free account: full content always
 * - Anonymous: metered free articles, then truncated at ~200 words with overlay
 */
export function GatedArticleContent({ html, className = "", slug = "" }: Props) {
  const { isAnonymous } = useSubscription();
  const meter = useBlogMeterConfig();
  const { hasReachedLimit, increment } = useArticleLimit(meter);
  const [shouldGate, setShouldGate] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const hasTracked = useRef(false);

  useEffect(() => {
    // Logged-in users (free or paid) see everything
    if (!isAnonymous) {
      setShouldGate(false);
      return;
    }

    // Anonymous user: check metering
    if (hasReachedLimit) {
      setShouldGate(true);
      if (slug) trackBlogArticleGated({ slug });
    } else if (!hasTracked.current) {
      // First article: count it, show full
      increment();
      hasTracked.current = true;
      setShouldGate(false);
    }
  }, [isAnonymous, hasReachedLimit, increment]);

  if (!shouldGate) {
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // Truncated view: show ~200 words then fade + CTA
  // Keep full HTML in DOM source for SEO (Google sees all content)
  return (
    <div className="relative">
      {/* Full content in DOM for SEO (hidden from view) */}
      <div className="sr-only" dangerouslySetInnerHTML={{ __html: html }} />

      {/* Visible truncated content */}
      <div className="relative overflow-hidden" style={{ maxHeight: "400px" }}>
        <div
          className={className}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {/* Fade gradient */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-brand-cream via-brand-cream/80 to-transparent" />
      </div>

      {/* Inline CTA card */}
      <div className="mt-6 rounded-brand border border-brand-sand/60 bg-white p-6 text-center shadow-card sm:p-8">
        <p className="font-display text-lg font-bold text-brand-navy">
          The rest of this guide is for the community.
        </p>
        <p className="mt-2 font-accent text-sm text-brand-navy/60">
          Join free to keep reading: full seasonal guides, neighborhood deep
          dives, and the daily newsletter every morning. No credit card.
        </p>
        <button
          onClick={() => {
            trackPaywallCtaClicked({ feature: "blog", cta: "gate_card" });
            setShowModal(true);
          }}
          className="mt-4 inline-block rounded-pill bg-brand-gold px-6 py-3 font-ui text-xs font-semibold uppercase tracking-wider text-brand-navy shadow-button transition-all hover:-translate-y-0.5 hover:bg-brand-gold-light"
        >
          Join Free, No Credit Card
        </button>
        <p className="mt-2 font-ui text-[11px] text-brand-navy/35">
          Or start your Premium trial &rarr;
        </p>
      </div>

      <UpgradeModal
        feature="blog"
        open={showModal}
        onClose={() => setShowModal(false)}
      />
    </div>
  );
}
