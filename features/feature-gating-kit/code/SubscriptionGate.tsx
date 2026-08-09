"use client";

import { useEffect, useState } from "react";
import { SubscriptionProvider, resolveSubscription, type SubscriptionState } from "@/hooks/useSubscription";

/**
 * Client-side subscription context provider.
 *
 * IMPORTANT: This used to accept a `user` prop and was wrapped in a server
 * component layout that called `auth()` server-side. That broke edge caching
 * for every page (including ~15k pSEO pages) because reading cookies in a
 * layout opts the entire route tree out of the static cache.
 *
 * Instead, we hydrate the session client-side via /api/auth/session on
 * mount. The initial render assumes anonymous (gates closed) so signed-out
 * crawlers see the locked state, which matches what they should see in
 * indexed snapshots. Once the fetch resolves, signed-in users get the
 * correct subscription tier and gates open.
 *
 * The brief flash of "anonymous" -> "logged in" only affects the very first
 * render after a hard navigation. Soft navigations within the SPA preserve
 * the resolved state across route changes.
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SubscriptionState>(() => resolveSubscription(null));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.user) {
          setState(
            resolveSubscription({
              plan: data.user.plan,
              trialEndsAt: data.user.trialEndsAt ?? null,
            }),
          );
        }
      })
      .catch(() => {
        /* keep anonymous fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <SubscriptionProvider value={state}>{children}</SubscriptionProvider>;
}
