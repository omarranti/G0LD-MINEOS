"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface SavedListingsContextValue {
  savedSet: Set<string>;
  isHydrated: boolean;
  /** Optimistically mark a listing as saved/unsaved in the local cache. */
  markSaved: (listingId: string, saved: boolean) => void;
}

const SavedListingsContext = createContext<SavedListingsContextValue | null>(null);

/**
 * Wraps a page or layout to share a single /api/me/saved fetch across all
 * <SaveListingButton> instances. Without this, every card would issue its
 * own request, and for a pSEO type page that's 60 fetches per render.
 *
 * Drop this near the top of any page that renders multiple SaveListingButtons:
 *
 *   <SavedListingsProvider>
 *     <SomeListingGrid />
 *   </SavedListingsProvider>
 */
export function SavedListingsProvider({ children }: { children: React.ReactNode }) {
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set());
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/saved", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { ids: [] }))
      .then((data: { ids: string[] }) => {
        if (cancelled) return;
        setSavedSet(new Set(data.ids ?? []));
        setIsHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setIsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const markSaved = useCallback((listingId: string, saved: boolean) => {
    setSavedSet((prev) => {
      const next = new Set(prev);
      if (saved) next.add(listingId);
      else next.delete(listingId);
      return next;
    });
  }, []);

  // The pending-save replay broadcasts saves it completes after mount, when
  // the /api/me/saved snapshot above is already stale.
  useEffect(() => {
    function onSavedChanged(e: Event) {
      const detail = (e as CustomEvent<{ listingId: string; saved: boolean }>).detail;
      if (detail?.listingId) markSaved(detail.listingId, detail.saved);
    }
    window.addEventListener("app:saved-changed", onSavedChanged);
    return () => window.removeEventListener("app:saved-changed", onSavedChanged);
  }, [markSaved]);

  const value = useMemo(
    () => ({ savedSet, isHydrated, markSaved }),
    [savedSet, isHydrated, markSaved],
  );

  return <SavedListingsContext.Provider value={value}>{children}</SavedListingsContext.Provider>;
}

/**
 * Hook for components that want to read or update saved state.
 * Returns null if no provider is mounted (caller should fall back to its
 * own /api/me/saved fetch).
 */
export function useSavedListingsContext(): SavedListingsContextValue | null {
  return useContext(SavedListingsContext);
}
