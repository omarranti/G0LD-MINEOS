"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradeModal } from "./UpgradeModal";

type GateLevel = "free" | "paid";

interface PaywallGateProps {
  /** Content to show (blurred for unauthorized users, visible for authorized) */
  children: React.ReactNode;
  /** Which feature this gate protects, maps to UpgradeModal copy */
  feature: string;
  /** Minimum access level: "free" = logged-in account, "paid" = paid subscription */
  requiredTier?: GateLevel;
  /** Optional label shown on the lock overlay */
  label?: string;
  /** If true, show a compact inline lock instead of a blur overlay */
  inline?: boolean;
}

export function PaywallGate({
  children,
  feature,
  requiredTier = "paid",
  label,
  inline = false,
}: PaywallGateProps) {
  const { isAnonymous, hasAccess: hasPaidOrTrial } = useSubscription();
  const [showModal, setShowModal] = useState(false);

  const hasAccess =
    requiredTier === "free" ? !isAnonymous : hasPaidOrTrial;

  if (hasAccess) return <>{children}</>;

  if (inline) {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 rounded-pill border border-brand-gold-pale bg-brand-gold-pale/20 px-3 py-1.5 font-ui text-[11px] font-medium text-brand-gold transition-all hover:bg-brand-gold-pale/40 hover:border-brand-gold/40"
        >
          <Lock className="h-3 w-3" />
          {label || "Premium"}
        </button>
        <UpgradeModal
          feature={feature}
          open={showModal}
          onClose={() => setShowModal(false)}
        />
      </>
    );
  }

  return (
    <>
      <div className="relative overflow-hidden rounded-brand">
        {/* Blurred content */}
        <div
          className="pointer-events-none select-none blur-[6px]"
          aria-hidden="true"
        >
          {children}
        </div>

        {/* Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-white/95 via-white/80 to-white/60">
          <button
            onClick={() => setShowModal(true)}
            className="flex flex-col items-center gap-3 transition-transform hover:scale-105"
          >
            <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-gold-pale/40 shadow-sm">
              <Lock className="h-5 w-5 text-brand-gold" />
            </div>
            <span className="font-display text-sm font-bold text-brand-navy">
              {label || "Unlock with Premium"}
            </span>
            <span className="rounded-pill bg-brand-burgundy px-5 py-2 font-ui text-[11px] font-bold uppercase tracking-wider text-white shadow-md shadow-brand-burgundy/20 transition-colors hover:bg-brand-burgundy-light">
              Start Free Trial
            </span>
            <span className="font-ui text-[10px] text-brand-navy/30">
              30 days free · No credit card required
            </span>
          </button>
        </div>
      </div>

      <UpgradeModal
        feature={feature}
        open={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}
