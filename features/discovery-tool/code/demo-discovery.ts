/**
 * Seeded Discovery Builder data. Lives in its own file to keep demo-data.ts
 * manageable. All ideas and projections are tailored to Jordan's specific
 * situation per the project brief: Meridian sports offer-processing, builder
 * instinct, Tower Games, Hunker Night proximity, tight financial runway.
 */

import type {
  DiscoveryIdea,
  DiscoveryIdeaMilestone,
  IdeaKPI,
  RevenueProjection
} from "@/lib/discovery-types";

const DEMO_USER_ID = "demo-nate";
const nowIso = new Date().toISOString();
const nowMs = Date.now();

function iso(daysAgo: number): string {
  return new Date(nowMs - daysAgo * 86400_000).toISOString();
}

// ─── Ideas ───────────────────────────────────────────────────────────
export const demoIdeas: DiscoveryIdea[] = [
  {
    id: "idea-offer-tool",
    user_id: DEMO_USER_ID,
    session_id: null,
    name: "Agency Offer Intelligence",
    one_line_pitch:
      "B2B SaaS that compresses talent-agency offer processing from 15 minutes to 2, with built-in deal analytics.",
    why_jordan:
      "You're inside Meridian running the exact workflow this replaces. You have 80% of the prototype built. You can pilot it against your own data before selling.",
    revenue_model: "Per-seat SaaS ($49/seat/month) + agency-wide enterprise tier",
    target_customer: "Small to mid-sized talent agencies (10-50 agents)",
    startup_cost_estimate: "$600 (hosting, Anthropic API, domain, landing page)",
    time_to_first_dollar: "6-10 weeks",
    effort_level: "high",
    risk_level: "medium",
    risk_explanation:
      "ERP integration varies per agency, which slows onboarding. Sales cycle is also long in agency world.",
    comparison_score: 87,
    status: "active",
    assumptions: {
      conservative: "4 agencies x 5 seats by month 12",
      moderate: "8 agencies x 8 seats by month 12",
      aggressive: "15 agencies x 12 seats by month 12"
    },
    execution_phase: "build",
    created_at: iso(14),
    updated_at: iso(1)
  },
  {
    id: "idea-domino-content",
    user_id: DEMO_USER_ID,
    session_id: null,
    name: "Brain Games Content Studio",
    one_line_pitch:
      "Short-form content series (YouTube + IG + TikTok) explaining physics, probability, and strategy through real objects: dominoes, poker chips, chess pieces, dice.",
    why_jordan:
      "You've already been on Fox prime-time doing exactly this. The production muscle exists. Your neuroscience background gives the explanations credibility.",
    revenue_model: "Ad revenue (YouTube) + sponsorships + merch + course upsell",
    target_customer: "18-34 STEM-curious audience, educators, toy brands",
    startup_cost_estimate: "$1,200 (camera upgrade, lights, editing)",
    time_to_first_dollar: "3-6 months (ad revenue threshold)",
    effort_level: "medium",
    risk_level: "medium",
    risk_explanation:
      "Attention math is brutal for new creators. First 10 videos are mostly learning what works.",
    comparison_score: 72,
    status: "explored",
    assumptions: {
      conservative: "5k subs by month 12, $400/mo rev",
      moderate: "25k subs by month 12, $2.5k/mo rev",
      aggressive: "80k subs by month 12, $12k/mo rev + one brand deal"
    },
    execution_phase: "validate",
    created_at: iso(20),
    updated_at: iso(10)
  },
  {
    id: "idea-wme-consulting",
    user_id: DEMO_USER_ID,
    session_id: null,
    name: "Agency Workflow Audits",
    one_line_pitch:
      "Two-week paid audits for small agencies: document the inefficiencies, prototype fixes, hand over a remediation plan.",
    why_jordan:
      "Natural second step after the offer tool lands its first customer. Builds you into a paid systems thinker instead of just a seat.",
    revenue_model: "$6k-$15k per audit, repeat engagements",
    target_customer: "Small talent agencies, boutique management firms",
    startup_cost_estimate: "$200 (templates, DocSend)",
    time_to_first_dollar: "4-8 weeks",
    effort_level: "medium",
    risk_level: "low",
    risk_explanation: "Depends on having 2-3 prior conversations that build trust.",
    comparison_score: 68,
    status: "parked",
    assumptions: {
      conservative: "2 audits in Y1",
      moderate: "5 audits in Y1",
      aggressive: "10 audits + 1 retainer in Y1"
    },
    execution_phase: "validate",
    created_at: iso(25),
    updated_at: iso(25)
  },
  {
    id: "idea-loft-merch",
    user_id: DEMO_USER_ID,
    session_id: null,
    name: "jordanlane zine + merch",
    one_line_pitch:
      "Limited run zines and drop-based merch under the jordanlane handle. Reuses the Depop audience and Tower Games credibility.",
    why_jordan:
      "The Depop account already exists. The taste is documented. Low risk creative outlet that also reinforces the brand you're building.",
    revenue_model: "Direct sales (Shopify or Depop)",
    target_customer: "Existing jordanlane followers, adjacent taste communities",
    startup_cost_estimate: "$800 (printer, first merch run)",
    time_to_first_dollar: "2-4 weeks",
    effort_level: "low",
    risk_level: "low",
    risk_explanation: "Low downside. Main cost is attention you could spend elsewhere.",
    comparison_score: 54,
    status: "parked",
    assumptions: {
      conservative: "1 drop, 50 units sold",
      moderate: "3 drops, 300 units",
      aggressive: "6 drops, 1200 units + subscription"
    },
    execution_phase: "validate",
    created_at: iso(30),
    updated_at: iso(18)
  }
];

// ─── Revenue projections ─────────────────────────────────────────────
// Scenario curves for each idea. 12 months, tuned so conservative is
// flat early, moderate shows product-market fit, aggressive breaks out.

function curve(base: number, growth: number, months = 12): number[] {
  const values: number[] = [];
  for (let m = 0; m < months; m++) {
    values.push(Math.round(base * Math.pow(growth, m)));
  }
  return values;
}

function flatRamp(start: number, peak: number, months = 12): number[] {
  const values: number[] = [];
  for (let m = 0; m < months; m++) {
    const t = m / (months - 1);
    values.push(Math.round(start + (peak - start) * Math.pow(t, 1.6)));
  }
  return values;
}

type IdeaProjectionProfile = {
  ideaId: string;
  conservative: number[];
  moderate: number[];
  aggressive: number[];
  monthlyCosts: number[];
  actual?: number[];
};

const profiles: IdeaProjectionProfile[] = [
  {
    ideaId: "idea-offer-tool",
    // Per-seat SaaS — slow ramp, then accelerates after 2-3 design partners.
    conservative: flatRamp(0, 2200),
    moderate: flatRamp(0, 6400),
    aggressive: curve(80, 1.45),
    monthlyCosts: [120, 120, 140, 180, 220, 260, 300, 340, 380, 420, 460, 500],
    // Real data through month 2 to show the "actual vs projected" overlay
    actual: [0, 180]
  },
  {
    ideaId: "idea-domino-content",
    conservative: [0, 0, 0, 0, 60, 120, 180, 240, 300, 360, 400, 420],
    moderate: [0, 0, 50, 150, 320, 560, 820, 1100, 1500, 1900, 2300, 2600],
    aggressive: [0, 50, 200, 500, 1100, 2000, 3600, 5400, 7600, 9800, 11500, 12400],
    monthlyCosts: [80, 80, 90, 100, 120, 140, 160, 180, 200, 220, 240, 260]
  },
  {
    ideaId: "idea-wme-consulting",
    conservative: [0, 0, 0, 6000, 0, 0, 0, 6000, 0, 0, 0, 0],
    moderate: [0, 0, 8000, 0, 0, 10000, 0, 0, 12000, 0, 0, 15000],
    aggressive: [0, 8000, 0, 12000, 0, 15000, 0, 15000, 0, 18000, 0, 20000],
    monthlyCosts: [40, 40, 60, 60, 80, 80, 100, 100, 120, 120, 140, 140]
  },
  {
    ideaId: "idea-loft-merch",
    conservative: [0, 900, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    moderate: [0, 1800, 0, 2100, 0, 2400, 0, 0, 0, 0, 0, 0],
    aggressive: [0, 2600, 0, 3200, 0, 3800, 0, 4400, 0, 5100, 0, 5800],
    monthlyCosts: [800, 120, 60, 900, 80, 60, 900, 80, 60, 900, 80, 60]
  }
];

function buildProjections(): RevenueProjection[] {
  const out: RevenueProjection[] = [];
  const year = new Date().getFullYear();
  for (const p of profiles) {
    for (let m = 0; m < 12; m++) {
      out.push({
        id: `proj-${p.ideaId}-${m + 1}`,
        idea_id: p.ideaId,
        user_id: DEMO_USER_ID,
        month: m + 1,
        year,
        conservative: p.conservative[m] ?? 0,
        moderate: p.moderate[m] ?? 0,
        aggressive: p.aggressive[m] ?? 0,
        actual: p.actual?.[m] ?? null,
        monthly_costs: p.monthlyCosts[m] ?? 0,
        notes: null,
        created_at: nowIso,
        updated_at: nowIso
      });
    }
  }
  return out;
}

export const demoRevenueProjections: RevenueProjection[] = buildProjections();

// ─── Milestones ─────────────────────────────────────────────────────
export const demoMilestones: DiscoveryIdeaMilestone[] = [
  // Agency Offer Intelligence (in build phase)
  {
    id: "m-offer-1",
    idea_id: "idea-offer-tool",
    user_id: DEMO_USER_ID,
    phase: "validate",
    title: "10 discovery calls with small agencies",
    description: "Confirm the pain is shared beyond Meridian.",
    status: "done",
    due_date: null,
    completed_at: iso(10),
    sort_order: 0,
    created_at: iso(18),
    updated_at: iso(10)
  },
  {
    id: "m-offer-2",
    idea_id: "idea-offer-tool",
    user_id: DEMO_USER_ID,
    phase: "validate",
    title: "Document the exact workflow inside Meridian Sports",
    status: "done",
    description: null,
    due_date: null,
    completed_at: iso(7),
    sort_order: 1,
    created_at: iso(18),
    updated_at: iso(7)
  },
  {
    id: "m-offer-3",
    idea_id: "idea-offer-tool",
    user_id: DEMO_USER_ID,
    phase: "build",
    title: "MVP parsing pipeline (80%)",
    description: "Already built. Fix the last 20% on ERP export.",
    status: "done",
    due_date: null,
    completed_at: iso(3),
    sort_order: 0,
    created_at: iso(18),
    updated_at: iso(3)
  },
  {
    id: "m-offer-4",
    idea_id: "idea-offer-tool",
    user_id: DEMO_USER_ID,
    phase: "build",
    title: "Hosted demo agencies can screen-share",
    status: "pending",
    description: null,
    due_date: null,
    completed_at: null,
    sort_order: 1,
    created_at: iso(14),
    updated_at: iso(14)
  },
  {
    id: "m-offer-5",
    idea_id: "idea-offer-tool",
    user_id: DEMO_USER_ID,
    phase: "launch",
    title: "First paying design partner signed",
    status: "pending",
    description: null,
    due_date: null,
    completed_at: null,
    sort_order: 0,
    created_at: iso(14),
    updated_at: iso(14)
  },
  {
    id: "m-offer-6",
    idea_id: "idea-offer-tool",
    user_id: DEMO_USER_ID,
    phase: "launch",
    title: "1-pager pitch + email template",
    status: "pending",
    description: null,
    due_date: null,
    completed_at: null,
    sort_order: 1,
    created_at: iso(14),
    updated_at: iso(14)
  },
  {
    id: "m-offer-7",
    idea_id: "idea-offer-tool",
    user_id: DEMO_USER_ID,
    phase: "grow",
    title: "3 paying customers",
    status: "pending",
    description: null,
    due_date: null,
    completed_at: null,
    sort_order: 0,
    created_at: iso(14),
    updated_at: iso(14)
  },
  {
    id: "m-offer-8",
    idea_id: "idea-offer-tool",
    user_id: DEMO_USER_ID,
    phase: "grow",
    title: "Referral loop from first customers",
    status: "pending",
    description: null,
    due_date: null,
    completed_at: null,
    sort_order: 1,
    created_at: iso(14),
    updated_at: iso(14)
  },
  {
    id: "m-offer-9",
    idea_id: "idea-offer-tool",
    user_id: DEMO_USER_ID,
    phase: "optimize",
    title: "Pricing experiment: seat vs agency-wide",
    status: "pending",
    description: null,
    due_date: null,
    completed_at: null,
    sort_order: 0,
    created_at: iso(14),
    updated_at: iso(14)
  }
];

// ─── KPIs ───────────────────────────────────────────────────────────
export const demoKPIs: IdeaKPI[] = [
  {
    id: "kpi-offer-1",
    idea_id: "idea-offer-tool",
    user_id: DEMO_USER_ID,
    kpi_name: "Seats",
    kpi_target: 40,
    kpi_actual: 4,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    category: "users",
    created_at: nowIso,
    updated_at: nowIso
  },
  {
    id: "kpi-offer-2",
    idea_id: "idea-offer-tool",
    user_id: DEMO_USER_ID,
    kpi_name: "MRR",
    kpi_target: 2000,
    kpi_actual: 180,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    category: "revenue",
    created_at: nowIso,
    updated_at: nowIso
  },
  {
    id: "kpi-offer-3",
    idea_id: "idea-offer-tool",
    user_id: DEMO_USER_ID,
    kpi_name: "Pipeline (conversations in progress)",
    kpi_target: 10,
    kpi_actual: 7,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    category: "pipeline",
    created_at: nowIso,
    updated_at: nowIso
  }
];

// ─── Helpers ────────────────────────────────────────────────────────

export function getIdea(id: string): DiscoveryIdea | undefined {
  return demoIdeas.find((i) => i.id === id);
}

export function getProjectionsFor(ideaId: string): RevenueProjection[] {
  return demoRevenueProjections.filter((p) => p.idea_id === ideaId);
}

export function getMilestonesFor(ideaId: string): DiscoveryIdeaMilestone[] {
  return demoMilestones.filter((m) => m.idea_id === ideaId);
}

export function getKPIsFor(ideaId: string): IdeaKPI[] {
  return demoKPIs.filter((k) => k.idea_id === ideaId);
}

/** Annual totals per scenario (useful for the idea card + leaderboard) */
export function annualTotals(ideaId: string) {
  const rows = getProjectionsFor(ideaId);
  return {
    conservative: rows.reduce((s, r) => s + Number(r.conservative), 0),
    moderate: rows.reduce((s, r) => s + Number(r.moderate), 0),
    aggressive: rows.reduce((s, r) => s + Number(r.aggressive), 0),
    costs: rows.reduce((s, r) => s + Number(r.monthly_costs), 0),
    actual: rows.reduce((s, r) => s + Number(r.actual ?? 0), 0)
  };
}
