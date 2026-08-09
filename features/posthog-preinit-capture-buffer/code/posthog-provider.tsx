"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { Suspense, useEffect } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { PendingSaveReplay } from "@/components/listings/pending-save-replay";
import { PostAuthToast } from "@/components/post-auth-toast";
import { flushPendingAnalytics } from "@/lib/analytics";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    const consent = localStorage.getItem("app_consent"); // "accepted" | "declined" | null
    const hasAccepted = consent === "accepted";
    const hasDeclined = consent === "declined";

    // Cookieless by default. Before a consent choice is made, anonymous
    // visitors are measured with in-memory persistence: no cookies, no
    // localStorage id, so organic search traffic and the signup funnel stay
    // visible without setting a cookie. On Accept the banner upgrades to
    // persistent cookie storage; on Decline we opt out entirely.
    posthog.init(key, {
      api_host: "/ingest",
      ui_host: "https://us.posthog.com",
      capture_pageview: true,
      capture_pageleave: true,
      persistence: hasAccepted ? "localStorage+cookie" : "memory",
      autocapture: true,
      capture_exceptions: true,
      opt_out_capturing_by_default: hasDeclined,
    });

    if (hasDeclined) {
      posthog.opt_out_capturing();
    }

    // React runs child effects before parent effects, so any component that
    // captures on mount has already done so by this line and posthog-js threw
    // those events away. They are queued instead; release them now.
    flushPendingAnalytics();
  }, []);

  return (
    <SessionProvider>
      <PHProvider client={posthog}>
        <PostHogIdentify />
        <PendingSaveReplay />
        {/* useSearchParams inside needs a Suspense boundary at prerender. */}
        <Suspense fallback={null}>
          <PostAuthToast />
        </Suspense>
        {children}
      </PHProvider>
    </SessionProvider>
  );
}

function PostHogIdentify() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    const user = session?.user;
    if (user?.id) {
      posthog.identify(user.id, {
        email: user.email ?? undefined,
        name: user.name ?? undefined,
        role: (user as { role?: string }).role,
      });
    } else if (session === null) {
      posthog.reset();
    }
  }, [session]);

  return null;
}
