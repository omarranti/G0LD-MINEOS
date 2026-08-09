/**
 * Analytics helpers (PostHog).
 *
 * Naming convention: snake_case, object-past-tense verb.
 * (Matches existing pSEO events like `city_page_viewed`, `listing_clicked`.)
 *
 * This module is safe to import from both server and client code. It degrades
 * to a no-op when PostHog isn't loaded (SSR, or when NEXT_PUBLIC_POSTHOG_KEY
 * isn't configured in the environment).
 */

"use client";

import posthog from "posthog-js";

type Props = Record<string, string | number | boolean | string[] | null | undefined>;

/**
 * Captures made before `posthog.init()` are dropped, so they are held here
 * until the provider says it has initialised.
 *
 * React runs a child's effects BEFORE its parent's. `PostHogProvider` wraps
 * `{children}` in app/layout.tsx and calls `posthog.init()` inside its own
 * effect, so any component that captures on mount runs first and its event is
 * silently discarded by posthog-js. Nothing throws, so the try/catch below
 * never saw it either.
 *
 * That is not hypothetical. `explore_searched` was wired correctly, shipped,
 * and never fired once on production across four separate searches, while
 * `explore_filter_applied` in the same file worked immediately because a click
 * necessarily happens after init (verified 2026-07-26).
 *
 * Anything fired from a user interaction, timer, or flag callback was already
 * safe. This only changes the mount-time case, which previously lost the event
 * entirely.
 */
let initialised = false;
const pending: Array<[string, Props | undefined]> = [];
// A page that captured on mount and never initialised must not grow unbounded.
const MAX_PENDING = 50;

function send(event: string, props?: Props) {
  try {
    posthog?.capture(event, props);
  } catch (err) {
    // Never let analytics break user flows.
    console.debug("[analytics] capture failed", event, err);
  }
}

/**
 * Called by PostHogProvider immediately after `posthog.init()`. Drains anything
 * captured during the window before init.
 */
export function flushPendingAnalytics() {
  initialised = true;
  const queued = pending.splice(0, pending.length);
  for (const [event, props] of queued) send(event, props);
}

function capture(event: string, props?: Props) {
  if (typeof window === "undefined") return;
  if (!initialised) {
    if (pending.length < MAX_PENDING) pending.push([event, props]);
    return;
  }
  send(event, props);
}

// ═══════════════════════════════════════════════════════
// Waitlist funnel
// ═══════════════════════════════════════════════════════

export type WaitlistSource = "hero-signup" | "email-signup" | "waitlist-section";

export function trackWaitlistStarted(source: WaitlistSource) {
  capture("waitlist_form_started", {
    source,
    page_path: typeof window !== "undefined" ? window.location.pathname : undefined,
  });
}

export function trackWaitlistSubmitted(
  source: WaitlistSource,
  opts?: { has_name?: boolean; has_city?: boolean; interests_count?: number },
) {
  capture("waitlist_submitted", {
    source,
    has_name: opts?.has_name ?? false,
    has_city: opts?.has_city ?? false,
    interests_count: opts?.interests_count ?? 0,
    page_path: typeof window !== "undefined" ? window.location.pathname : undefined,
  });
}

export function trackWaitlistSuccess(
  source: WaitlistSource,
  opts?: { interests?: string[] },
) {
  capture("waitlist_success", {
    source,
    interests: opts?.interests ?? [],
    page_path: typeof window !== "undefined" ? window.location.pathname : undefined,
  });
}

export function trackWaitlistError(
  source: WaitlistSource,
  opts: { error_type: string; status?: number },
) {
  capture("waitlist_error", {
    source,
    error_type: opts.error_type,
    status: opts.status ?? null,
  });
}

export function trackWaitlistUpsellClicked(source: WaitlistSource) {
  capture("waitlist_upsell_clicked", { source });
}

// ═══════════════════════════════════════════════════════
// Signup funnel
// ═══════════════════════════════════════════════════════

export type AuthMethod = "google" | "email";

export function trackSignupPageViewed(opts: {
  callback_url?: string;
  has_prefilled_email?: boolean;
}) {
  capture("signup_page_viewed", {
    callback_url: opts.callback_url ?? null,
    has_prefilled_email: opts.has_prefilled_email ?? false,
  });
}

export function trackSignupAttempted(method: AuthMethod) {
  capture("signup_attempted", { method });
}

export function trackSignupCompleted(method: AuthMethod) {
  capture("signup_completed", { method });
}

export function trackSignupError(method: AuthMethod, error: string) {
  capture("signup_error", { method, error });
}

// ═══════════════════════════════════════════════════════
// Login funnel
// ═══════════════════════════════════════════════════════

export function trackLoginPageViewed(opts: { callback_url?: string }) {
  capture("login_page_viewed", { callback_url: opts.callback_url ?? null });
}

export function trackLoginAttempted(method: AuthMethod) {
  capture("login_attempted", { method });
}

export function trackLoginCompleted(method: AuthMethod) {
  capture("login_completed", { method });
}

export function trackLoginError(method: AuthMethod, error: string) {
  capture("login_error", { method, error });
}

// ═══════════════════════════════════════════════════════
// Account lifecycle
// ═══════════════════════════════════════════════════════

export function trackAccountPageViewed(opts: { member_since_days: number }) {
  capture("account_page_viewed", { member_since_days: opts.member_since_days });
}

/**
 * The post-auth toast: shown after a signup lands on a callbackUrl page
 * (where the welcome banner never renders) and/or when a pending save is
 * replayed. "signup_replay" = both in one toast.
 */
export type PostAuthToastKind = "signup" | "replay" | "signup_replay";

export function trackPostAuthToastViewed(opts: { kind: PostAuthToastKind }) {
  capture("post_auth_toast_viewed", opts);
}

export function trackPostAuthToastCtaClicked(opts: { kind: PostAuthToastKind }) {
  capture("post_auth_toast_cta_clicked", opts);
}

export function trackSignOutClicked(from_page: string) {
  capture("sign_out_clicked", { from_page });
}

// ═══════════════════════════════════════════════════════
// Activation events — the post-signup "first value" moments
// ═══════════════════════════════════════════════════════
// These are the events you build funnels against in PostHog. The
// conversion sequence worth watching is:
//
//   waitlist_submitted OR signup_completed
//     → listing_saved               (first save = aha moment)
//     → city_alert_subscribed       (retention hook set)
//     → review_submitted            (community contributor)
//     → referral_link_copied/shared (viral loop engaged)
//
// Drop-offs between any of these steps tell you exactly where
// activation is leaking.

export type SaveSurface = "explore_card" | "listing_detail" | "city_hub" | "pseo_card";

export function trackListingSaved(opts: {
  listing_id: string;
  listing_slug?: string;
  surface: SaveSurface;
  city?: string;
  /** Set when the save was completed by the post-signup pending-save replay. */
  via?: "pending_save_replay";
}) {
  capture("listing_saved", opts);
}

export function trackListingUnsaved(opts: { listing_id: string }) {
  capture("listing_unsaved", opts);
}

/**
 * The anonymous save tap is the free-account ACQUISITION moment: a logged-out
 * visitor taps save and we route them to /signup (the conversion hook, not a
 * paywall). Fires from every save surface so the save_signup_prompt → signup
 * funnel covers all of them, not just explore cards.
 */
export function trackSaveSignupPrompt(opts: {
  listing_id: string;
  source: "detail_page" | "city_hub" | "pseo_card" | "explore_card";
}) {
  capture("save_signup_prompt", opts);
}

/**
 * In-content free-account CTA on the SEO surfaces (city hub + certification
 * pages). Fires when a logged-out visitor taps the save/alert card spliced
 * into the listings grid or empty state. Feeds the seo_cta_clicked →
 * signup_completed funnel.
 */
export function trackSeoCtaClicked(opts: {
  location: "city_hub" | "certification";
  city_slug: string;
  agency_slug?: string;
  position: "in_grid" | "empty_state";
}) {
  capture("seo_cta_clicked", opts);
}

export function trackReviewSubmitted(opts: {
  listing_id: string;
  rating: number;
  has_photo: boolean;
  is_edit: boolean;
}) {
  capture("review_submitted", opts);
}

export function trackCityAlertSubscribed(opts: { city_slug: string; city_name: string }) {
  capture("city_alert_subscribed", opts);
}

export function trackCityAlertUnsubscribed(opts: { city_slug: string }) {
  capture("city_alert_unsubscribed", opts);
}

export function trackReferralLinkCopied(opts: { code: string }) {
  capture("referral_link_copied", opts);
}

export function trackReferralLinkShared(opts: { code: string; method: "native_share" | "copy_fallback" }) {
  capture("referral_link_shared", opts);
}

// `referral_landed` was removed 2026-07-28: it had no call site and no surface
// that could supply its payload. The referral landing is /r/[code], a server
// route that drops an httpOnly app_ref cookie and redirects to /?ref=1. The
// referrer id is unreadable from the client by design, the code is not in the
// redirect URL, and a server-side capture there has no distinct_id for an
// anonymous visitor (using the referrer's id would attribute the landing to
// the wrong person). Attribution already works without it: the createUser
// event reads the cookie and writes User.referredByUserId.

export type OnboardingStep = "verify" | "save" | "alert" | "review" | "invite";

export function trackOnboardingStepCompleted(opts: {
  step: OnboardingStep;
  completed_count: number;
  total_count: number;
}) {
  capture("onboarding_step_completed", opts);
}

export function trackOnboardingDismissed(opts: { completed_count: number }) {
  capture("onboarding_dismissed", opts);
}

export function trackOnboardingCompleted() {
  capture("onboarding_completed", {});
}

export function trackClaimSubmitted(opts: { listing_id: string }) {
  capture("claim_submitted", opts);
}

// ═══════════════════════════════════════════════════════
// Founding / Checkout
// ═══════════════════════════════════════════════════════

export function trackFoundingPageViewed() {
  capture("founding_page_viewed");
}

export function trackTrialStarted(opts: {
  plan: string;
  source: "founding_page" | "pricing_page";
  /** Trial-model A/B arm ("control" | "cc-required"). */
  trial_model?: string;
}) {
  capture("trial_started", opts);
}

export function trackFoundingCheckoutStarted(opts?: {
  /** Trial-model A/B arm ("control" | "cc-required"). */
  trial_model?: string;
}) {
  capture("founding_checkout_started", opts);
}

// `founding_checkout_completed` is captured SERVER-side, not here. It fires
// from the Stripe webhook (api/webhooks/stripe/route.ts) at the moment the
// invoice actually pays, with founder_number + trial_model. A client-side
// twin was exported here with no call site; wiring it to a success page would
// have double-counted a revenue event, and a success page can be missed
// entirely (closed tab, redirect race) while the webhook cannot. Removed
// 2026-07-28. The instrumentation health job reads the server call directly.

export function trackFoundingCheckoutError(error: string) {
  capture("founding_checkout_error", { error });
}

/**
 * What opened the founding modal.
 *   - welcome_activation: new signup on ?welcome=1, after scroll or 30s dwell
 *   - save_milestone:     existing free account crossed the save threshold
 */
export type FoundingModalTrigger = "welcome_activation" | "save_milestone";

/** How a user got out of a modal. Shared by FoundingModal and UpgradeModal. */
export type ModalDismissMethod =
  | "close_button"
  | "backdrop"
  | "escape"
  | "stay_free";

export function trackFoundingModalViewed(opts: {
  trigger: FoundingModalTrigger;
  seats_remaining: number;
}) {
  capture("founding_modal_viewed", opts);
}

export function trackFoundingModalCtaClicked(opts: {
  trigger: FoundingModalTrigger;
}) {
  capture("founding_modal_cta_clicked", opts);
}

export function trackFoundingModalDismissed(opts: {
  trigger: FoundingModalTrigger;
  method: ModalDismissMethod;
}) {
  capture("founding_modal_dismissed", opts);
}

// ═══════════════════════════════════════════════════════
// Paywall / Upgrade
// ═══════════════════════════════════════════════════════

/**
 * Fired by UpgradeModal itself on open, so every gate is measured rather
 * than only the one call site that remembered to fire it. `source` narrows
 * within a feature (which filter group, which surface); it defaults to the
 * feature key when the call site has nothing more specific to say.
 */
export function trackPaywallViewed(opts: {
  feature: string;
  source: string;
  /** "free" | "paid", so gate pressure is separable from offer pressure. */
  tier?: string;
}) {
  capture("paywall_viewed", opts);
}

export function trackPaywallDismissed(opts: {
  feature: string;
  source?: string;
  tier?: string;
  method?: ModalDismissMethod;
}) {
  capture("paywall_dismissed", opts);
}

export function trackPaywallCtaClicked(opts: {
  feature: string;
  /**
   * "gate_card" is the in-content CTA that opens the gate modal; "free" and
   * "paid" are the CTAs inside it. Without the first step the blog funnel had
   * no measurable middle: blog_article_gated fired 131 times and the next
   * event in the sequence had never been ingested at all.
   */
  cta: "free" | "paid" | "gate_card";
}) {
  capture("paywall_cta_clicked", opts);
}

/**
 * Page-level upgrade links (not the UpgradeModal, which is paywall_*).
 * /account carries four upgrade paths; the trial CTA tracks
 * founding_checkout_started, and these are the other three, which
 * routed to /pricing with no event at all.
 */
export function trackUpgradeCtaClicked(opts: {
  source: "journal_lock" | "membership_card_founding" | "membership_card_upgrade";
}) {
  capture("upgrade_cta_clicked", opts);
}

// ═══════════════════════════════════════════════════════
// Exit intent popup
// ═══════════════════════════════════════════════════════

export type ExitPopupTrigger = "exit_intent" | "scroll_depth" | "website_click";

export function trackExitPopupViewed(trigger: ExitPopupTrigger) {
  capture("exit_popup_viewed", { trigger });
}

export function trackExitPopupCtaClicked(
  cta: "founding" | "explore" | "signup",
  trigger: ExitPopupTrigger,
) {
  capture("exit_popup_cta_clicked", { cta, trigger });
}

/**
 * Tap on a listing's website link. Already counted first-party by
 * `trackListingMetric(id, "website")`, but ListingMetric is a per-listing
 * per-UTC-day counter with no person and no session on the row, so it can
 * never join to a funnel. This event exists because the click is now the
 * popup's trigger, and the sequence
 * `listing_website_clicked -> exit_popup_viewed -> exit_popup_cta_clicked ->
 * signup_completed` has to be readable in one place.
 */
export function trackListingWebsiteClicked(opts: { listing_id: string }) {
  capture("listing_website_clicked", opts);
}

// ═══════════════════════════════════════════════════════
// Content engagement
// ═══════════════════════════════════════════════════════

export function trackBlogArticleViewed(opts: { slug: string; category: string }) {
  capture("blog_article_viewed", opts);
}

export function trackBlogArticleGated(opts: { slug: string }) {
  capture("blog_article_gated", opts);
}

export function trackShareClicked(opts: { platform: string; content_type: string; slug: string }) {
  capture("share_clicked", opts);
}

// ═══════════════════════════════════════════════════════
// Explore interactions
// ═══════════════════════════════════════════════════════

export function trackExploreSearched(opts: { query: string; results_count: number }) {
  capture("explore_searched", opts);
}

export function trackExploreFilterApplied(opts: { filter_type: string; value: string }) {
  capture("explore_filter_applied", opts);
}

// ═══════════════════════════════════════════════════════
// Identity
// ═══════════════════════════════════════════════════════

export function identifyUser(user: {
  id: string;
  email?: string | null;
  name?: string | null;
  auth_method?: AuthMethod;
  created_at?: string;
}) {
  if (typeof window === "undefined") return;
  try {
    posthog?.identify(user.id, {
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      auth_method: user.auth_method,
      created_at: user.created_at,
    });
  } catch (err) {
    console.debug("[analytics] identify failed", err);
  }
}

export function resetIdentity() {
  if (typeof window === "undefined") return;
  try {
    posthog?.reset();
  } catch (err) {
    console.debug("[analytics] reset failed", err);
  }
}
