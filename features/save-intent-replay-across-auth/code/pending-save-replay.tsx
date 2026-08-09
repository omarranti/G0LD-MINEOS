"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toggleSavedListing } from "@/app/actions/saved-listings";
import { trackListingSaved } from "@/lib/analytics";
import { takePendingSave } from "@/lib/pending-save";

/**
 * Completes a save that was interrupted by the signup redirect.
 *
 * Mounted once, app-wide, inside the session provider. When a session appears
 * and a pending save is parked in localStorage, the save is applied so the user
 * gets the thing they asked for instead of having to find the button again.
 *
 * `toggleSavedListing` is a toggle, so we check current state first: someone
 * who taps save anonymously, then signs into an existing account that already
 * saved that listing, must not have it silently un-saved.
 */
export function PendingSaveReplay() {
  const { status } = useSession();
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || handled.current) return;
    handled.current = true;

    const pending = takePendingSave();
    if (!pending) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/saved", { credentials: "include" });
        const data = (await res.json()) as { ids?: string[] };
        if (cancelled || data.ids?.includes(pending.listingId)) return;

        const result = await toggleSavedListing(pending.listingId);
        if (cancelled || !result.ok || !result.saved) return;

        trackListingSaved({
          listing_id: pending.listingId,
          // The pending payload predates the surface naming; "detail_page" is
          // its legacy spelling of the listing detail surface.
          surface: pending.source === "detail_page" ? "listing_detail" : pending.source,
          via: "pending_save_replay",
        });
        // Save buttons hydrate from /api/me/saved on mount, which has already
        // happened by the time this replay lands, so tell them directly.
        // Otherwise the button reads "Save" on a listing this just saved, and
        // tapping it would silently unsave.
        window.dispatchEvent(
          new CustomEvent("app:saved-changed", {
            // `via` lets the post-auth toast react to replays only; manual
            // saves must not pop a toast.
            detail: { listingId: pending.listingId, saved: true, via: "replay" },
          }),
        );
        // Re-render the server components so the button shows "Saved".
        router.refresh();
      } catch {
        // A failed replay is not worth surfacing: the user can still save
        // manually, and the pending entry is already cleared.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, router]);

  return null;
}
