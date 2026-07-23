/**
 * TypeScript types mirroring the Neon schema in
 * db/migrations/0001_initial.sql.
 *
 * These are hand-written so the repo stays buildable without a live
 * database connection. Every row type maps 1:1 to a public table on
 * the Neon project defined by DATABASE_URL.
 */

// ─── Enums / string unions ────────────────────────────────────────────

export type ActionPriority = "must" | "should" | "could";
export type ActionStatus = "pending" | "done" | "rolled";
export type RecurrencePattern = "daily" | "weekly" | "monthly";

export type GoalStatus = "active" | "completed" | "archived";
export type GoalCategory =
  | "career"
  | "financial"
  | "creative"
  | "personal"
  | "network";

export type ContactInteractionType =
  | "call"
  | "meeting"
  | "text"
  | "email"
  | "event";

export type CareerCategory = "work" | "creative" | "personal" | "financial";
export type SkillCategory =
  | "technical"
  | "interpersonal"
  | "creative"
  | "industry";

export type AiSessionType =
  | "brainstorm"
  | "decision"
  | "strategy"
  | "draft"
  | "briefing";

export type IdeaEffort = "low" | "medium" | "high";
export type IdeaRisk = "low" | "medium" | "high";
export type IdeaStatus = "explored" | "active" | "parked" | "killed";
export type ExecutionPhase =
  | "validate"
  | "build"
  | "launch"
  | "grow"
  | "optimize";

// ─── Row types ────────────────────────────────────────────────────────

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: "owner" | "admin";
  created_at: string;
  updated_at: string;
};

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: GoalCategory | null;
  target_date: string | null;
  progress: number;
  status: GoalStatus;
  quarter: number | null;
  year: number | null;
  created_at: string;
  updated_at: string;
};

export type Action = {
  id: string;
  user_id: string;
  goal_id: string | null;
  title: string;
  description: string | null;
  priority: ActionPriority;
  status: ActionStatus;
  due_date: string | null;
  completed_at: string | null;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  user_id: string;
  name: string;
  title: string | null;
  company: string | null;
  relationship_strength: number | null;
  how_met: string | null;
  tags: string[];
  notes: string | null;
  last_interaction_date: string | null;
  follow_up_days: number | null;
  created_at: string;
  updated_at: string;
};

export type Interaction = {
  id: string;
  user_id: string;
  contact_id: string;
  type: ContactInteractionType;
  date: string;
  notes: string | null;
  created_at: string;
};

export type CareerEvent = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  date: string;
  category: CareerCategory | null;
  tags: string[];
  evidence_type: string | null;
  created_at: string;
  updated_at: string;
};

export type Skill = {
  id: string;
  user_id: string;
  name: string;
  category: SkillCategory | null;
  proficiency: number | null;
  is_target: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Finance = {
  id: string;
  user_id: string;
  month: number;
  year: number;
  income: number;
  expenses_rent: number;
  expenses_food: number;
  expenses_transport: number;
  expenses_subscriptions: number;
  expenses_other: number;
  side_income: number;
  savings: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Prospects ────────────────────────────────────────────────────────
// Outbound prospecting layer. Distinct from `Contact`, which is the
// curated network of people Jordan already knows. Lives in Neon, not
// the (legacy) Supabase schema. See db/migrations/ for the SQL.

export type ProspectSource =
  | "apollo"
  | "manual"
  | "gmail"
  | "csv_import"
  | "web"
  | "other";

export type ProspectSeniority =
  | "intern"
  | "assistant"
  | "assistant_coordinator"
  | "coordinator"
  | "agent"
  | "senior_agent"
  | "manager"
  | "director"
  | "director_manager"
  | "vp"
  | "partner"
  | "executive"
  | "support"
  | "other";

export type ProspectRelationship =
  | "unknown"
  | "colleague"
  | "mutual_intro_available"
  | "met_once"
  | "acquainted"
  | "close";

export type ProspectStatus =
  | "new"
  | "researching"
  | "queued"
  | "contacted"
  | "responded"
  | "meeting_scheduled"
  | "engaged"
  | "dead"
  | "promoted";

export type Prospect = {
  id: string;
  user_id: string;
  name: string;
  title: string | null;
  target_org: string;
  department: string | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  source: ProspectSource | null;
  source_id: string | null;
  last_enriched_at: string | null;
  tenure_years: number | null;
  recent_role_change: boolean;
  seniority: ProspectSeniority | null;
  fit_score: number | null;
  accessibility_score: number | null;
  relationship_to_user: ProspectRelationship;
  status: ProspectStatus;
  promoted_contact_id: string | null;
  angle: string | null;
  mutual_connections: string[];
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const PROSPECT_SENIORITY_LABELS: Record<ProspectSeniority, string> = {
  intern: "Intern",
  assistant: "Assistant",
  assistant_coordinator: "Asst / Coord",
  coordinator: "Coordinator",
  agent: "Agent",
  senior_agent: "Senior Agent",
  manager: "Manager",
  director: "Director",
  director_manager: "Dir / Mgr",
  vp: "VP",
  partner: "Partner",
  executive: "Executive",
  support: "Support",
  other: "Other"
};

export const PROSPECT_RELATIONSHIP_LABELS: Record<ProspectRelationship, string> = {
  unknown: "Cold",
  colleague: "Internal",
  mutual_intro_available: "Warm intro",
  met_once: "Met once",
  acquainted: "Acquainted",
  close: "Close"
};

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  new: "New",
  researching: "Researching",
  queued: "Queued",
  contacted: "Contacted",
  responded: "Responded",
  meeting_scheduled: "Meeting set",
  engaged: "Engaged",
  dead: "Dead",
  promoted: "Promoted"
};

export type JournalEntry = {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  tags: string[];
  linked_goal_id: string | null;
  linked_contact_id: string | null;
  date: string;
  created_at: string;
  updated_at: string;
};

// ─── Profile questionnaire ────────────────────────────────────────────
// One row per user. Mirrors the strategy questionnaire at
// /.inbox/text/nate-questionnaire.txt. Every section answered here
// flows into the Smart Tool system prompt and the brand content layer
// so the rest of the dashboard speaks in Jordan's own words instead of
// the v0.3 provisional placeholder paragraph in claude.ts.

export type ProfileRoleType = "talent" | "business" | "both";

export type ProfileQuestionnaire = {
  user_id: string;

  // Identity
  identity_party_answer: string | null;
  identity_dream_day: string | null;
  identity_better_at: string | null;
  identity_go_to_for: string | null;
  identity_role_type: ProfileRoleType | null;
  identity_role_type_why: string | null;

  // Meridian situation
  wme_title_role: string | null;
  wme_access: string | null;
  wme_doubts: string | null;
  wme_take_with_you: string | null;
  wme_stay_terms: string | null;
  wme_envy_who: string | null;

  // Builder instinct
  builder_offer_tool: string | null;
  builder_dream_tool: string | null;
  builder_products_or_businesses: string | null;
  builder_made_money: string | null;
  builder_monetizable_skills: string | null;

  // Creative side
  creative_music_seriousness: string | null;
  creative_domino_aftermath: string | null;
  creative_on_camera_again: string | null;
  creative_social_state: string | null;
  creative_personal_brand: string | null;

  // Money and survival
  money_earnings: string | null;
  money_burn: string | null;
  money_runway: string | null;
  money_stable_min: string | null;
  money_debt: string | null;

  // Network and access
  network_top_five: string | null;
  network_hunker_use: string | null;
  network_meeting_maker: string | null;
  network_rooms: string | null;

  // Vision
  vision_three_year: string | null;
  vision_known_for: string | null;
  vision_obstacle: string | null;
  vision_fear: string | null;
  vision_sacrifice: string | null;
  vision_anything_else: string | null;

  // Tools and workflow
  tools_daily_apps: string | null;
  tools_info_lives: string | null;
  tools_broken_workflows: string | null;
  tools_communication: string | null;
  tools_calendar: string | null;
  tools_connectors_wanted: string | null;
  tools_health_tracking: string | null;

  // Section save tracking. Maps section key to ISO timestamp of last save.
  section_completed: Record<string, string>;

  created_at: string;
  updated_at: string;
};

export type ProfileSectionKey =
  | "identity"
  | "wme"
  | "builder"
  | "creative"
  | "money"
  | "network"
  | "vision"
  | "tools";

export const PROFILE_SECTION_ORDER: ProfileSectionKey[] = [
  "identity",
  "wme",
  "builder",
  "creative",
  "money",
  "network",
  "vision",
  "tools"
];

export const PROFILE_SECTION_LABELS: Record<ProfileSectionKey, string> = {
  identity: "Identity",
  wme: "The Meridian situation",
  builder: "The builder instinct",
  creative: "The creative side",
  money: "Money & survival",
  network: "Network & access",
  vision: "The vision",
  tools: "Tools & workflow"
};

export const PROFILE_SECTION_BLURBS: Record<ProfileSectionKey, string> = {
  identity: "Who you are when nobody's watching. This shapes everything.",
  wme: "Be real about where you are inside this building.",
  builder:
    "You tried to automate your own job. That tells me something. Let's dig into it.",
  creative: "Music. Tower Games. The stuff that isn't on a paycheck.",
  money: "Can't build a dream on an empty tank. No judgment, just math.",
  network:
    "Who you know matters. But who knows what you can do matters more.",
  vision: "No wrong answers. But vague ones are useless.",
  tools: "What you use shapes what we can build. Let's get specific."
};

/** Returns the count of sections that have been saved at least once. */
export function profileSectionsComplete(p: ProfileQuestionnaire | null): number {
  if (!p) return 0;
  return PROFILE_SECTION_ORDER.filter((k) => Boolean(p.section_completed[k])).length;
}

export const INTERACTION_LABELS: Record<ContactInteractionType, string> = {
  call: "Call",
  meeting: "Meeting",
  text: "Text",
  email: "Email",
  event: "Event"
};

export const CAREER_CATEGORY_LABELS: Record<CareerCategory, string> = {
  work: "Work",
  creative: "Creative",
  personal: "Personal",
  financial: "Financial"
};

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  technical: "Technical",
  interpersonal: "Interpersonal",
  creative: "Creative",
  industry: "Industry"
};

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
] as const;

/** Returns total outflow for a finance row. */
export function totalExpenses(f: Finance): number {
  return (
    Number(f.expenses_rent) +
    Number(f.expenses_food) +
    Number(f.expenses_transport) +
    Number(f.expenses_subscriptions) +
    Number(f.expenses_other)
  );
}

/** Net (income + side income - expenses) for a finance row. */
export function netMonthly(f: Finance): number {
  return Number(f.income) + Number(f.side_income) - totalExpenses(f);
}

/**
 * Runway in months. Uses the most recent month's savings divided by the
 * average monthly burn (expenses minus income) across the last N months.
 * Returns Infinity if income exceeds expenses (positive cash flow).
 */
export function computeRunwayMonths(history: Finance[]): number | null {
  if (history.length === 0) return null;
  const latest = history[0];
  const recent = history.slice(0, Math.min(3, history.length));
  const avgBurn =
    recent.reduce((acc, row) => {
      const net = netMonthly(row);
      return acc + (net < 0 ? -net : 0);
    }, 0) / recent.length;
  if (avgBurn <= 0) return Infinity;
  return Number(latest.savings) / avgBurn;
}

// ─── Human labels for enums ───────────────────────────────────────────

export const PRIORITY_LABELS: Record<ActionPriority, string> = {
  must: "Must",
  should: "Should",
  could: "Could"
};

export const PRIORITY_ORDER: Record<ActionPriority, number> = {
  must: 0,
  should: 1,
  could: 2
};

export const CATEGORY_LABELS: Record<GoalCategory, string> = {
  career: "Career",
  financial: "Financial",
  creative: "Creative",
  personal: "Personal",
  network: "Network"
};

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived"
};

// ─── Form state types shared across mutations ────────────────────────

export type MutationState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | { ok: null };

export const initialMutationState: MutationState = { ok: null };
