import { Card } from "./Card";
import { getConnectionStatus } from "@/lib/integrations/gcal";

/**
 * Integrations card for the dashboard home. Shows the connection state
 * for each external service the platform is wired to (currently just
 * Google Calendar). All integrations are scaffolded but inactive while
 * the app runs in demo mode; the card surfaces that fact directly so
 * Sam (and Jordan, eventually) know exactly what's plumbed and what
 * isn't, without having to dig through code.
 */
export async function IntegrationsPanel() {
  const gcal = await getConnectionStatus();

  return (
    <Card label="Integrations">
      <ul className="divide-y divide-border/40">
        <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div>
            <div className="font-display text-[0.92rem] font-semibold text-text">
              Google Calendar
            </div>
            <p className="mt-1 text-[0.78rem] leading-relaxed text-text-muted">
              Pulls the next 24 hours of events into the daily briefing.
              Scaffolded for phase 6, not wired until Supabase auth + OAuth
              credentials land.
            </p>
          </div>
          <StatusPill state={gcal.state} />
        </li>
      </ul>
    </Card>
  );
}

type IntegrationState = "not_configured" | "disconnected" | "connected";

const STATE_META: Record<IntegrationState, { label: string; cls: string }> = {
  not_configured: {
    label: "scaffold",
    cls: "border-white/15 text-text-muted"
  },
  disconnected: {
    label: "disconnected",
    cls: "border-amber/40 text-amber"
  },
  connected: {
    label: "connected",
    cls: "border-emerald/40 text-emerald"
  }
};

function StatusPill({ state }: { state: IntegrationState }) {
  const m = STATE_META[state];
  return (
    <span
      className={`rounded-full border px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] ${m.cls}`}
    >
      {m.label}
    </span>
  );
}
