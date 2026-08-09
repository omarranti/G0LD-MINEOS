"use client";

import { useEffect, useState, useTransition } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { toggleSavedListing } from "@/app/actions/saved-listings";
import {
  trackListingSaved,
  trackListingUnsaved,
  trackSaveSignupPrompt,
  type SaveSurface,
} from "@/lib/analytics";
import { rememberPendingSave } from "@/lib/pending-save";
import { recordSaveForFoundingPrompt } from "@/lib/founding-prompt";
import { useSavedListingsContext } from "./saved-listings-context";

/**
 * Bookmark / save toggle for a listing.
 *
 * Prefers a parent <SavedListingsProvider> for shared state across many
 * cards. Falls back to a per-instance /api/me/saved fetch when no provider
 * is present (e.g. on the listing detail page where there's only one
 * button on the page).
 *
 * Variants:
 *   - "icon":   circular icon button (for use on listing cards)
 *   - "button": full-width labeled button (for the listing detail page)
 *   - "mini":   small icon overlaid on a card corner
 */
export function SaveListingButton({
  listingId,
  listingSlug,
  city,
  variant = "icon",
  surface,
  className = "",
}: {
  listingId: string;
  listingSlug?: string;
  city?: string;
  variant?: "icon" | "button" | "mini";
  /** Where this button lives, for the listing_saved capture. Falls back to a
   * variant-derived guess when the call site doesn't say. */
  surface?: SaveSurface;
  className?: string;
}) {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const ctx = useSavedListingsContext();

  // Standalone state used only when no provider is present
  const [standaloneSaved, setStandaloneSaved] = useState(false);
  const [standaloneHydrated, setStandaloneHydrated] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (ctx) return; // provider handles hydration
    let cancelled = false;
    fetch("/api/me/saved", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { ids: [] }))
      .then((data: { ids: string[] }) => {
        if (cancelled) return;
        setStandaloneSaved(data.ids?.includes(listingId) ?? false);
        setStandaloneHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setStandaloneHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx, listingId]);

  // The pending-save replay can save a listing after this button already
  // hydrated (post-signup redirect). It broadcasts so the button doesn't sit
  // on a stale "Save" that would toggle the fresh save back off.
  useEffect(() => {
    if (ctx) return; // provider listens for itself
    function onSavedChanged(e: Event) {
      const detail = (e as CustomEvent<{ listingId: string; saved: boolean }>).detail;
      if (detail?.listingId === listingId) setStandaloneSaved(detail.saved);
    }
    window.addEventListener("app:saved-changed", onSavedChanged);
    return () => window.removeEventListener("app:saved-changed", onSavedChanged);
  }, [ctx, listingId]);

  const saved = ctx ? ctx.savedSet.has(listingId) : standaloneSaved;
  const hydrated = ctx ? ctx.isHydrated : standaloneHydrated;
  // An anonymous click can't touch saved state (the server bounces it to
  // /signup), so it must not wait on the /api/me/saved snapshot, since that
  // fetch leaves the button silently dead for the first seconds after load,
  // and anonymous visitors are the acquisition case. Only a signed-in session
  // risks toggling against stale state, so only it keeps the hydration gate.
  const awaitingHydration = !hydrated && sessionStatus !== "unauthenticated";

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const next = !saved;
    // Legacy variant-derived value, kept for save_signup_prompt and the
    // pending-save payload so their historical property values stay stable.
    const source =
      variant === "button" ? "detail_page" : variant === "mini" ? "pseo_card" : "city_hub";
    const captureSurface: SaveSurface =
      surface ?? (variant === "button" ? "listing_detail" : variant === "mini" ? "pseo_card" : "city_hub");
    // Optimistic update
    if (ctx) ctx.markSaved(listingId, next);
    else setStandaloneSaved(next);

    startTransition(async () => {
      const result = await toggleSavedListing(listingId);
      if (!result.ok) {
        // Revert
        if (ctx) ctx.markSaved(listingId, !next);
        else setStandaloneSaved(!next);
        if (result.error === "unauthenticated") {
          // Anonymous save tap = the free-account acquisition moment. Park the
          // save so it completes on the way back instead of being lost.
          trackSaveSignupPrompt({ listing_id: listingId, source });
          rememberPendingSave(listingId, source);
          const signupUrl =
            `/signup?callbackUrl=${encodeURIComponent(window.location.pathname)}` as Route;
          if (sessionStatus === "authenticated") {
            // The server rejected a session the client still holds: a JWT that
            // outlived its User row (deleted account). Keeping that cookie
            // leaves every write on the site failing silently, and /signup
            // bounces session-holders to /account, so clear it first.
            signOut({ callbackUrl: signupUrl });
          } else {
            router.push(signupUrl);
          }
        }
        return;
      }
      // Confirm with server result
      if (ctx) ctx.markSaved(listingId, result.saved);
      else setStandaloneSaved(result.saved);

      // Analytics
      if (result.saved) {
        trackListingSaved({
          listing_id: listingId,
          listing_slug: listingSlug,
          surface: captureSurface,
          city,
        });
        // First save is the aha moment, and the moment the founding pitch
        // has earned. Announces the milestone; FoundingModal decides.
        recordSaveForFoundingPrompt(city);
      } else {
        trackListingUnsaved({ listing_id: listingId });
      }
    });
  }

  const ariaLabel = saved ? "Remove from saved" : "Save this listing";

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || awaitingHydration}
        aria-pressed={saved}
        aria-label={ariaLabel}
        className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-pill border px-5 py-3 font-ui text-xs font-semibold uppercase tracking-wider transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${
          saved
            ? "border-brand-burgundy bg-brand-burgundy text-white hover:bg-brand-burgundy-light"
            : "border-brand-navy/20 bg-white text-brand-navy hover:border-brand-burgundy hover:text-brand-burgundy"
        } ${className}`}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Bookmark className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
        )}
        {saved ? "Saved" : "Save"}
      </button>
    );
  }

  if (variant === "mini") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || awaitingHydration}
        aria-pressed={saved}
        aria-label={ariaLabel}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border bg-white/95 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${
          saved
            ? "border-brand-burgundy text-brand-burgundy"
            : "border-brand-sand text-brand-navy/60 hover:border-brand-burgundy hover:text-brand-burgundy"
        } ${className}`}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Bookmark className={`h-3.5 w-3.5 ${saved ? "fill-current" : ""}`} />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending || awaitingHydration}
      aria-pressed={saved}
      aria-label={ariaLabel}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border bg-white shadow-sm transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${
        saved
          ? "border-brand-burgundy text-brand-burgundy"
          : "border-brand-sand text-brand-navy/60 hover:border-brand-burgundy hover:text-brand-burgundy"
      } ${className}`}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Bookmark className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
      )}
    </button>
  );
}
