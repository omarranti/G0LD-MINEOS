"use client";

import Link from "next/link";
import { X, Sparkles, Map, Shield, Heart, BookOpen, Users, CalendarDays } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import { useModalA11y } from "@/hooks/useModalA11y";
import {
  trackPaywallCtaClicked,
  trackPaywallViewed,
  trackPaywallDismissed,
  type ModalDismissMethod,
} from "@/lib/analytics";

/**
 * Paywall copy for each gate moment - sourced from the paywall strategy doc.
 * Voice: warm, communal, benefit-led. Never guilt-trippy.
 *
 * NOTE: all copy below is neutral placeholder text. Rewrite every string in
 * the destination product's voice; the registry shape is the reusable part.
 */
const GATE_COPY: Record<
  string,
  {
    icon: React.ReactNode;
    /** "free" gates unlock with a free account; "paid" gates require Premium. */
    tier: "free" | "paid";
    headline: string;
    body: string;
    features: string[];
    dismiss: string;
  }
> = {
  map: {
    icon: <Map className="h-5 w-5" />,
    tier: "paid",
    headline: "Find every spot in your neighborhood - on the map.",
    body: "Listings plotted by neighborhood, certification, and type. See exactly what's open near you, filtered by your standards.",
    features: [
      "Full interactive map across every city",
      "Filter by certification on the map",
      "Save your favorite spots",
      "Holiday-aware \"open now\" filter",
    ],
    dismiss: "Continue without map",
  },
  filter: {
    icon: <Shield className="h-5 w-5" />,
    tier: "paid",
    headline: "Filter by certification. Browse with confidence.",
    body: "Premium members filter every listing by exact certification and standard. Because your standards matter.",
    features: [
      "All major certifiers",
      "Specialty standard filters",
      "Certification details on every listing",
      "Updated certification status",
    ],
    dismiss: "See all listings without filter",
  },
  sort: {
    icon: <Sparkles className="h-5 w-5" />,
    tier: "paid",
    headline: "Sort your way. Find exactly what you need.",
    body: "Premium members unlock A-Z and Newest sorting to browse listings the way they want. Combined with advanced filters, you'll never miss a spot.",
    features: [
      "Sort by name (A-Z)",
      "Sort by newest additions",
      "Combined with all premium filters",
      "Across all listings",
    ],
    dismiss: "Continue with Top Rated",
  },
  favorites: {
    icon: <Heart className="h-5 w-5" />,
    tier: "free",
    headline: "Save your favorite spots. Build your list.",
    body: "Keep a personal collection of the restaurants, shops, and vendors you love. Access your favorites anytime, anywhere.",
    features: [
      "Save unlimited favorites",
      "Organize by category",
      "Quick access from your profile",
      "Sync across all devices",
    ],
    dismiss: "Continue browsing",
  },
  listing: {
    icon: <Map className="h-5 w-5" />,
    tier: "free",
    headline: "One step to get the full details.",
    body: "Create a free account to unlock the full address, phone, and hours for every listing - plus exclusive member deals you won't find anywhere else.",
    features: [
      "Full address + turn-by-turn directions",
      "Phone number & website",
      "Hours + real-time open/closed",
      "Exclusive member deals",
    ],
    dismiss: "Want phone + full hours too? Upgrade to Premium",
  },
  blog: {
    icon: <BookOpen className="h-5 w-5" />,
    tier: "free",
    headline: "The rest of this guide is for the community.",
    body: "Join free to keep reading - full seasonal guides, neighborhood deep dives, and the daily newsletter every morning. No credit card.",
    features: [
      "Unlimited full articles & city guides",
      "Daily newsletter",
      "Seasonal prep guides",
    ],
    dismiss: "Or start your Premium trial",
  },
  vendors: {
    icon: <Users className="h-5 w-5" />,
    tier: "paid",
    headline: "Your event. The right vendors. All in one place.",
    body: "Contact caterers, photographers, decorators, and venues directly - and use planning tools that organize everything from venue to valet, all certified.",
    features: [
      "Direct vendor contact & quote requests",
      "Planning checklist & timeline",
      "Vendor shortlist & side-by-side comparison",
      "Certified vendor guarantee",
    ],
    dismiss: "Keep browsing vendors",
  },
  pagination: {
    icon: <Sparkles className="h-5 w-5" />,
    tier: "paid",
    headline: "There's so much more to discover.",
    body: "You've seen the first page - unlock the full directory with hundreds more listings, filterable by certification, type, and location.",
    features: [
      "Access all listings",
      "Full directory across every city",
      "Advanced certification filters",
      "Interactive map view",
    ],
    dismiss: "Stay on page 1",
  },
  holiday: {
    icon: <CalendarDays className="h-5 w-5" />,
    tier: "paid",
    headline: "Get the full holiday experience.",
    body: "Unlock complete holiday prep guides, local events, countdown timers, and calendar integration. Everything you need for the seasonal calendar, in one place.",
    features: [
      "Full holiday prep guides",
      "Events near you for each holiday",
      "Countdown + Add to Calendar",
      "Seasonal dining guides",
    ],
    dismiss: "Continue with basic calendar",
  },
};

const DEFAULT_COPY = GATE_COPY.map;

/**
 * PostHog flag "free-gate-cta" controls the CTA on free-tier gates (favorites,
 * listing, blog):
 *   - free-first (default): lead with "Create my free account" (the north star)
 *   - control:              the retired founding/paid CTA
 * Paid-tier gates always show the founding CTA.
 *
 * free-first won and was rolled to 100%, so it is the DEFAULT here rather
 * than the flag-resolved upgrade. When this hook defaulted to control, every
 * reader whose flag call was slow, blocked, or unresolved got a paid pricing
 * modal behind a button labelled "Join Free, No Credit Card". Measured live:
 * 330 of 682 flag calls returned no variant, so roughly half of gated
 * readers were seeing the retired arm.
 */
function useFreeGateCtaVariant(): "control" | "free-first" {
  const [variant, setVariant] = useState<"control" | "free-first">("free-first");
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    // Only an explicit "control" opts back out. An unresolved flag keeps the
    // shipped winner.
    posthog.onFeatureFlags(() =>
      setVariant(
        posthog.getFeatureFlag("free-gate-cta") === "control"
          ? "control"
          : "free-first",
      ),
    );
  }, []);
  return variant;
}

interface UpgradeModalProps {
  feature: string;
  open: boolean;
  onClose: () => void;
  /**
   * Narrows within a feature, e.g. which filter group opened the gate.
   * Defaults to the feature key.
   */
  source?: string;
}

export function UpgradeModal({
  feature,
  open,
  onClose,
  source,
}: UpgradeModalProps) {
  const copy = GATE_COPY[feature] || DEFAULT_COPY;
  const modalRef = useRef<HTMLDivElement>(null);
  const gateVariant = useFreeGateCtaVariant();
  const [callbackUrl, setCallbackUrl] = useState("/explore");

  /**
   * Instrument here, not at the call sites. Only one of the four gates
   * (explore-filters) ever fired paywall_viewed, so `map`, `listing`, and
   * `blog` were opening completely unmeasured and the event undercounted
   * the paywall by three surfaces. Firing on the open transition covers
   * every present and future call site by construction.
   */
  useEffect(() => {
    if (!open) return;
    setCallbackUrl(window.location.pathname || "/explore");
    trackPaywallViewed({
      feature,
      source: source ?? feature,
      tier: copy.tier,
    });
  }, [open, feature, source, copy.tier]);

  /**
   * Every way out of this modal that is NOT a CTA counts as a dismissal:
   * backdrop, the X, the dismiss link, and Escape (via useModalA11y).
   * Routing them all through one handler is what makes paywall_viewed ->
   * paywall_cta_clicked / paywall_dismissed add up. `method` records which
   * way out it was, so a rage-close is separable from a considered pass.
   */
  const dismiss = useCallback(
    (method: ModalDismissMethod) => {
      trackPaywallDismissed({
        feature,
        source: source ?? feature,
        tier: copy.tier,
        method,
      });
      onClose();
    },
    [feature, source, copy.tier, onClose],
  );

  const dismissOnEscape = useCallback(() => dismiss("escape"), [dismiss]);

  useModalA11y(open, dismissOnEscape, modalRef);

  if (!open) return null;

  // Free-tier gates lead with the free account when the experiment is on.
  const showFreeCta = copy.tier === "free" && gateVariant === "free-first";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={copy.headline}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-brand-navy/60 backdrop-blur-sm"
        onClick={() => dismiss("backdrop")}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative w-full max-w-md overflow-hidden rounded-brand bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Close */}
        <button
          onClick={() => dismiss("close_button")}
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-brand-navy/5 text-brand-navy/40 transition-colors hover:bg-brand-navy/10 hover:text-brand-navy"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Gold accent bar */}
        <div className="h-1 bg-gradient-to-r from-brand-gold via-brand-gold-light to-brand-gold" />

        <div className="p-6 sm:p-8">
          {/* Icon */}
          <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-gold-pale/40 text-brand-gold-deep">
            {copy.icon}
          </div>

          {/* Headline */}
          <h3 className="mt-4 font-display text-xl font-bold leading-tight text-brand-navy sm:text-2xl">
            {copy.headline}
          </h3>

          {/* Body */}
          <p className="mt-2 font-accent text-sm leading-relaxed text-brand-navy/70">
            {copy.body}
          </p>

          {/* Features */}
          <ul className="mt-5 space-y-2">
            {copy.features.map((f) => (
              <li
                key={f}
                className="flex items-center gap-2.5 font-ui text-xs text-brand-navy"
              >
                <span className="text-brand-gold-deep text-[10px]">&#10022;</span>
                {f}
              </li>
            ))}
          </ul>

          {showFreeCta ? (
            <>
              {/* Free account CTA, the north star */}
              <div className="mt-6 rounded-brand-sm border border-brand-gold/20 bg-gradient-to-br from-brand-gold-pale/30 to-white p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-brand-gold-deep" />
                  <span className="font-ui text-[10px] font-semibold uppercase tracking-wider text-brand-gold-deep">
                    Free account · No credit card
                  </span>
                </div>
                <p className="mt-2 font-ui text-[12px] leading-relaxed text-brand-navy/70">
                  Create your free account to unlock this and keep your spots.
                  Takes about 20 seconds.
                </p>
                <Link
                  href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`}
                  onClick={() => trackPaywallCtaClicked({ feature, cta: "free" })}
                  className="mt-3 block w-full rounded-pill bg-brand-burgundy py-3 text-center font-ui text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-brand-burgundy/20 transition-all hover:-translate-y-0.5 hover:bg-brand-burgundy-light"
                >
                  Create my free account
                </Link>
              </div>

              {/* Sign in for existing members */}
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
                className="mt-3 block w-full text-center font-ui text-[11px] text-brand-navy/70 transition-colors hover:text-brand-navy"
              >
                Already a member? Sign in
              </Link>

              {/* Soft pointer to premium */}
              <Link
                href="/pricing"
                className="mt-1 block w-full text-center font-ui text-[11px] text-brand-navy/40 transition-colors hover:text-brand-navy"
              >
                Want the map and premium filters? See plans &rarr;
              </Link>
            </>
          ) : (
            <>
              {/* Founding Annual CTA (placeholder pricing; swap for yours) */}
              <div className="mt-6 rounded-brand-sm border border-brand-gold/20 bg-gradient-to-br from-brand-gold-pale/30 to-white p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-brand-gold-deep" />
                  <span className="font-ui text-[10px] font-semibold uppercase tracking-wider text-brand-gold-deep">
                    Founding Annual · Limited seats
                  </span>
                </div>
                <p className="mt-2 font-display text-lg font-bold text-brand-navy">
                  $XX<span className="font-ui text-xs font-normal text-brand-navy/70">/year</span>
                  {" "}
                  <span className="font-ui text-xs text-brand-navy/40 line-through">$YY</span>
                </p>
                <p className="mt-1 font-ui text-[11px] text-brand-navy/70">
                  Locked forever. No credit card for trial.
                </p>
                <Link
                  href="/pricing"
                  onClick={() => trackPaywallCtaClicked({ feature, cta: "paid" })}
                  className="mt-3 block w-full rounded-pill bg-brand-burgundy py-3 text-center font-ui text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-brand-burgundy/20 transition-all hover:-translate-y-0.5 hover:bg-brand-burgundy-light"
                >
                  Start Free Trial
                </Link>
              </div>

              {/* See all plans */}
              <Link
                href="/pricing"
                className="mt-3 block w-full text-center font-ui text-[11px] text-brand-navy/70 transition-colors hover:text-brand-navy"
              >
                See all plans &rarr;
              </Link>
            </>
          )}

          {/* Dismiss */}
          <button
            onClick={() => dismiss("stay_free")}
            className="mt-1 block w-full text-center font-ui text-[11px] text-brand-navy/40 transition-colors hover:text-brand-navy"
          >
            {copy.dismiss}
          </button>
        </div>
      </div>
    </div>
  );
}
