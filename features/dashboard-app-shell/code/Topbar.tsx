"use client";

import { useEffect, useState } from "react";

/**
 * Thin top bar inside the dashboard main column.
 * Shows a live clock and an operator status dot. On mobile, adds a
 * hamburger that opens the sidebar drawer (state lives in
 * DashboardChrome and is passed down via onMenuClick).
 * Matches the "NATE_OS / COMMAND CENTER" hud tone.
 */
export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const [clock, setClock] = useState<string>("--:--");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      setClock(`${hh}:${mm}`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="glass-chrome sticky top-0 z-30 flex items-center justify-between gap-3 px-5 py-3 sm:px-7">
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          aria-controls="dashboard-sidebar"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-text-muted transition-colors hover:border-white/20 hover:text-text md:hidden"
        >
          <span aria-hidden="true" className="flex flex-col items-center gap-[3px]">
            <span className="block h-[1.5px] w-4 bg-current" />
            <span className="block h-[1.5px] w-4 bg-current" />
            <span className="block h-[1.5px] w-4 bg-current" />
          </span>
        </button>

        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-text-dim">
          <span
            aria-hidden="true"
            className="mr-2 inline-block h-1.5 w-1.5 translate-y-[-1px] animate-recPulse rounded-full bg-emerald shadow-[0_0_10px_2px_rgba(16,185,129,0.7)]"
          />
          <span className="hidden xs:inline">online // </span>command center
        </div>
      </div>

      <div
        className="font-mono text-[0.7rem] text-text-muted"
        aria-hidden="true"
      >
        {clock}
      </div>
    </div>
  );
}
