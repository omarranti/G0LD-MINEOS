"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { BookmarkCheck, Sparkles, X } from "lucide-react";
import {
  trackPostAuthToastCtaClicked,
  trackPostAuthToastViewed,
  type PostAuthToastKind,
} from "@/lib/analytics";

/** Set by the signup form just before it redirects; read and cleared here. */
export const POST_SIGNUP_NUDGE_KEY = "post_signup_nudge";

/**
 * Wait before painting so a pending-save replay that is about to land can
 * upgrade the copy instead of racing it (the replay needs a session check and
 * a server action after navigation, typically 1-2s).
 */
const SHOW_DELAY_MS = 1200;
const AUTO_DISMISS_MS = 12000;

/**
 * The post-auth moment. Two gaps this closes, found in a live audit of the
 * save-to-signup funnel:
 *
 * 1. Signups that carry a callbackUrl (every save-flow signup) return to the
 *    page they acted on and never see /explore?welcome=1, so nothing tells
 *    them the onboarding checklist exists. The checklist had been seen by
 *    almost nobody.
 * 2. The pending-save replay works but is silent; the user only learns their
 *    save landed if they happen to spot the filled bookmark.
 *
 * Mounted once, app-wide. Renders nothing on /account (the checklist is
 * already there) and on /explore?welcome=1 (the welcome banner owns that
 * moment).
 */
export function PostAuthToast() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const [signup, setSignup] = useState(false);
  const [replay, setReplay] = useState(false);
  const [phase, setPhase] = useState<"idle" | "visible" | "done">("idle");
  const viewedTracked = useRef(false);

  // A completed pending-save replay announces itself on this event; manual
  // save buttons never send `via: "replay"`.
  useEffect(() => {
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent).detail as { via?: string } | undefined;
      if (detail?.via === "replay") setReplay(true);
    };
    window.addEventListener("app:saved-changed", onSaved);
    return () => window.removeEventListener("app:saved-changed", onSaved);
  }, []);

  // The signup flag is set before the post-signup redirect, so it is read on
  // every navigation rather than on mount: this component is already mounted
  // (app-wide) when the flag appears. Consumed only once authenticated, so an
  // abandoned OAuth attempt does not greet an anonymous visitor.
  useEffect(() => {
    if (status !== "authenticated") return;
    try {
      if (sessionStorage.getItem(POST_SIGNUP_NUDGE_KEY) === "1") {
        sessionStorage.removeItem(POST_SIGNUP_NUDGE_KEY);
        setSignup(true);
      }
    } catch {
      // Storage unavailable: skip the nudge rather than break the page.
    }
  }, [pathname, status]);

  const suppressed =
    !pathname ||
    pathname.startsWith("/account") ||
    (pathname === "/explore" && searchParams.get("welcome") === "1");

  const armed = (signup || replay) && !suppressed;
  const kind: PostAuthToastKind =
    signup && replay ? "signup_replay" : replay ? "replay" : "signup";

  useEffect(() => {
    if (!armed || phase !== "idle") return;
    const timer = setTimeout(() => setPhase("visible"), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [armed, phase]);

  useEffect(() => {
    if (phase !== "visible" || viewedTracked.current) return;
    viewedTracked.current = true;
    trackPostAuthToastViewed({ kind });
  }, [phase, kind]);

  useEffect(() => {
    if (phase !== "visible") return;
    const timer = setTimeout(() => setPhase("done"), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase !== "visible") return null;

  const headline = replay ? "Saved to your list." : "You're in.";
  const body = signup
    ? "Your account is ready. A few quick setup steps unlock alerts and reviews."
    : "Find it anytime on your account page.";
  const ctaHref = signup ? "/account" : "/account#saved-listings";
  const ctaLabel = signup ? "Finish setup" : "View saved";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-500"
    >
      <div className="flex items-center gap-3 rounded-brand border border-brand-gold/30 bg-white px-4 py-3.5 shadow-card">
        {replay ? (
          <BookmarkCheck className="h-5 w-5 flex-shrink-0 text-brand-gold" />
        ) : (
          <Sparkles className="h-5 w-5 flex-shrink-0 text-brand-gold" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-brand-navy">{headline}</p>
          <p className="mt-0.5 font-ui text-xs text-brand-navy/60">{body}</p>
        </div>
        <Link
          href={ctaHref}
          onClick={() => {
            trackPostAuthToastCtaClicked({ kind });
            setPhase("done");
          }}
          className="flex-shrink-0 rounded-pill bg-brand-burgundy px-4 py-2 font-ui text-[10px] font-semibold uppercase tracking-wider text-white transition-all hover:-translate-y-0.5 hover:bg-brand-burgundy-light"
        >
          {ctaLabel}
        </Link>
        <button
          type="button"
          onClick={() => setPhase("done")}
          aria-label="Dismiss"
          className="flex-shrink-0 p-1 text-brand-navy/40 hover:text-brand-navy"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
