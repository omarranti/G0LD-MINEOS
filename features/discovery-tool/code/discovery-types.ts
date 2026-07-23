/**
 * Type definitions for the Discovery Builder (Phase 5).
 *
 * Split from database.ts to keep concerns clean. These match the
 * discovery_ideas, revenue_projections, idea_kpis, and idea_milestones
 * tables from db/migrations/0001_initial.sql.
 */

import type {
  IdeaEffort,
  IdeaRisk,
  IdeaStatus,
  ExecutionPhase
} from "@/lib/database";

export type DiscoveryIdea = {
  id: string;
  user_id: string;
  session_id: string | null;
  name: string;
  one_line_pitch: string | null;
  why_jordan: string | null;
  revenue_model: string | null;
  target_customer: string | null;
  startup_cost_estimate: string | null;
  time_to_first_dollar: string | null;
  effort_level: IdeaEffort | null;
  risk_level: IdeaRisk | null;
  risk_explanation: string | null;
  comparison_score: number | null;
  status: IdeaStatus;
  assumptions: Record<string, string>;
  execution_phase: ExecutionPhase | null;
  created_at: string;
  updated_at: string;
};

export type RevenueProjection = {
  id: string;
  idea_id: string;
  user_id: string;
  month: number;
  year: number;
  conservative: number;
  moderate: number;
  aggressive: number;
  actual: number | null;
  monthly_costs: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type IdeaKPI = {
  id: string;
  idea_id: string;
  user_id: string;
  kpi_name: string;
  kpi_target: number | null;
  kpi_actual: number | null;
  month: number;
  year: number;
  category: string | null;
  created_at: string;
  updated_at: string;
};

export type DiscoveryIdeaMilestone = {
  id: string;
  idea_id: string;
  user_id: string;
  phase: ExecutionPhase;
  title: string;
  description: string | null;
  status: "pending" | "done";
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const PHASE_LABELS: Record<ExecutionPhase, string> = {
  validate: "Validate",
  build: "Build",
  launch: "Launch",
  grow: "Grow",
  optimize: "Optimize"
};

export const PHASE_ORDER: ExecutionPhase[] = [
  "validate",
  "build",
  "launch",
  "grow",
  "optimize"
];

export const STATUS_LABELS: Record<IdeaStatus, string> = {
  explored: "Explored",
  active: "Active",
  parked: "Parked",
  killed: "Killed"
};

export type IdeaTotals = {
  conservative: number;
  moderate: number;
  aggressive: number;
  costs: number;
  actual: number;
};

/** Pure aggregation over any array of RevenueProjection rows. */
export function computeAnnualTotals(projections: RevenueProjection[]): IdeaTotals {
  return {
    conservative: projections.reduce((s, r) => s + Number(r.conservative), 0),
    moderate: projections.reduce((s, r) => s + Number(r.moderate), 0),
    aggressive: projections.reduce((s, r) => s + Number(r.aggressive), 0),
    costs: projections.reduce((s, r) => s + Number(r.monthly_costs), 0),
    actual: projections.reduce((s, r) => s + Number(r.actual ?? 0), 0)
  };
}
