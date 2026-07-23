"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { dashboardNav } from "@/content/dashboard-nav";
import { site } from "@/content/site";

/**
 * Private dashboard sidebar.
 *
 * Desktop (>= md): fixed 220px left column, always visible.
 * Mobile  (<  md): off-canvas drawer. `mobileOpen` toggles it, `onClose`
 *                  fires when the backdrop is tapped. The parent
 *                  (DashboardChrome) owns the state and also wires ESC
 *                  + route-change close + scroll lock.
 *
 * The desktop layout is unchanged from Phase 1. The drawer behavior is
 * purely additive on small screens.
 */
export function Sidebar({
  userEmail,
  mobileOpen = false,
  onClose
}: {
  userEmail?: string;
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const grouped = dashboardNav.reduce<Record<string, typeof dashboardNav>>(
    (acc, item) => {
      const key = item.group ?? "Main";
      (acc[key] ||= []).push(item);
      return acc;
    },
    {}
  );

  return (
    <>
      {/* Mobile backdrop — only renders on small screens when open. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity duration-200 md:hidden",
          mobileOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        )}
      />

      <aside
        id="dashboard-sidebar"
        aria-label="Dashboard navigation"
        className={cn(
          "glass-chrome fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col overflow-y-auto transition-transform duration-250 ease-out md:w-[220px]",
          // Mobile: slide in/out. Desktop: always visible.
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0"
        )}
      >
        <div className="flex items-start justify-between border-b border-white/5 px-5 pb-5 pt-6">
          <Link
            href="/dashboard"
            className="block focus-visible:outline-none"
            onClick={onClose}
          >
            <p className="font-display text-[1.05rem] font-bold tracking-[0.22em] text-text drop-shadow-[0_0_12px_rgba(255,255,255,0.25)]">
              NATE_OS
            </p>
            <p className="mt-0.5 text-[0.55rem] uppercase tracking-[0.22em] text-amberTerm">
              // Command Center
            </p>
          </Link>

          {/* Mobile close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="-mr-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[0.72rem] text-text-muted transition-colors hover:border-white/20 hover:text-text md:hidden"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 py-3">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} role="group" aria-label={group} className="mb-2">
              {group !== "Main" && (
                <div aria-hidden="true" className="px-5 pt-3 pb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-text-dim">
                  {group}
                </div>
              )}
              {items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn("nav-btn", active && "is-active")}
                  >
                    <span aria-hidden="true" className="icon">
                      {item.icon}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {item.status === "soon" && (
                      <span className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-text-dim">
                        soon
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-white/5 px-5 py-4">
          <div className="text-[0.55rem] uppercase tracking-[0.14em] text-text-dim">
            Operator
          </div>
          <div className="mt-1 truncate font-mono text-[0.7rem] text-text-med">
            {userEmail ?? "anonymous"}
          </div>
          <form action="/auth/signout" method="post" className="mt-3">
            <button
              type="submit"
              className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-text-muted transition-colors hover:text-danger"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
