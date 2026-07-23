"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/**
 * Client-side chrome wrapper for the authenticated dashboard.
 *
 * Keeps the mobile drawer state in one place so both the Sidebar (the
 * drawer body) and the Topbar (the toggle button) can share it. The
 * parent server layout stays thin: it does the auth check and hands
 * the user email + children down.
 *
 * Behaviors wired in one spot so every page gets them for free:
 *  - Drawer closes on route change.
 *  - Escape closes the drawer.
 *  - Body scroll is locked while the drawer is open.
 *  - A skip-to-content link is rendered first in tab order so keyboard
 *    users can bypass the sidebar on every dashboard view.
 */
export function DashboardChrome({
  userEmail,
  children
}: {
  userEmail?: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const close = useCallback(() => setMobileOpen(false), []);
  const open = useCallback(() => setMobileOpen(true), []);

  // Close on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Escape-to-close + body scroll lock.
  useEffect(() => {
    if (!mobileOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focusable"
      >
        Skip to main content
      </a>

      <Sidebar
        userEmail={userEmail}
        mobileOpen={mobileOpen}
        onClose={close}
      />

      <div className="min-h-screen md:ml-[220px]">
        <Topbar onMenuClick={open} />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-main px-5 pb-20 pt-6 sm:px-7 sm:pt-8 focus-visible:outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
