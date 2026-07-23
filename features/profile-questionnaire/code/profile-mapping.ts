/**
 * Profile mapping: questionnaire answers → dashboard next steps.
 *
 * This is the deterministic layer that sits between the raw
 * `profile_questionnaire` row and every dashboard vertical. It does
 * three jobs:
 *
 *   1. Parses free-text answers into normalized signals (numbers,
 *      booleans, lists). See `deriveSignals`.
 *   2. Slices the questionnaire into per-vertical context bundles via
 *      the `verticals` tags on each question. See `profileSliceForVertical`.
 *   3. Generates concrete, source-attributed next steps for each
 *      vertical using signals + answer text. See `nextStepsForVertical`
 *      and `nextStepsForAllVerticals`.
 *
 * Everything here is pure. No I/O, no Claude calls. The endpoint at
 * /api/profile/next-steps reads from this file. The Smart Tool prompt
 * builder in lib/claude.ts also reads from this file when a vertical
 * hint is supplied.
 *
 * Voice rule: no em dashes anywhere in user-facing strings. Use
 * periods, commas, colons, parens.
 */

import {
  FIELDS_BY_VERTICAL,
  QUESTIONS_BY_FIELD,
  SECTIONS_BY_VERTICAL,
  questionnaireSections,
  type DashboardVertical,
  type Question,
  type QuestionField
} from "@/content/profile-questionnaire";
import type {
  ActionPriority,
  ProfileQuestionnaire,
  ProfileRoleType,
  ProfileSectionKey
} from "@/lib/database";

export type { DashboardVertical } from "@/content/profile-questionnaire";

// ─── Signal types ────────────────────────────────────────────────────

/**
 * Normalized derived signals computed from the questionnaire. Every
 * field is nullable so the helper degrades gracefully when the
 * questionnaire is partially filled. Downstream code should always
 * null-check before using these.
 */
export type ProfileSignals = {
  // Identity
  roleType: ProfileRoleType | null;
  /** True when the role-type "why" answer leans toward control or operating equity. */
  prefersOperatingControl: boolean;

  // Meridian
  wmeUncertain: boolean;
  /** Free-text "would I stay" terms, present when answered. */
  hasStayTerms: boolean;

  // Builder
  /** Skills the user themself listed as monetizable outside salary. */
  monetizableSkills: string[];
  /** True when the user has never made non-salary money OR explicitly named the blocker. */
  needsFirstNonSalaryDollar: boolean;
  /** Has a concrete builder project in motion. */
  hasActiveBuild: boolean;

  // Creative
  /** Self-rated music seriousness on 1-10 scale, parsed from free text. */
  musicSeriousness: number | null;
  wantsOnCamera: boolean;
  socialFollowers: number | null;
  /** True when the user said the personal brand has not been actively built. */
  personalBrandDormant: boolean;

  // Money
  earningsMonthlyLow: number | null;
  earningsMonthlyHigh: number | null;
  monthlyBurn: number | null;
  runwayMonths: number | null;
  /** Stated stability floor (minimum monthly income to feel safe). */
  stabilityFloor: number | null;
  /** Floor minus current high earnings. Positive means a gap. */
  gapToFloor: number | null;
  totalDebt: number | null;
  /** True when there is no buffer at all. */
  zeroRunway: boolean;

  // Network
  /** Names parsed from the top-five answer. May be fewer than 5. */
  topFivePeople: string[];
  /** True when the user listed fewer than five names (signals undercultivated network). */
  topFiveIncomplete: boolean;
  hasMeetingMaker: boolean;
  /** True when the user explicitly said they are not yet leveraging the Hunker access. */
  underleveragedHunker: boolean;

  // Vision
  /** Locking-in is the canonical blocker per Jordan's questionnaire. */
  hasLockingInBlocker: boolean;
  visionKnownFor: string | null;
  visionFear: string | null;

  // Tools and workflow
  /** True when the user describes active calendar planning (not just invite collection). */
  calendarOrganized: boolean;
  /** True when the user named specific integrations they want. */
  hasConnectorWishlist: boolean;
  /** Connector names extracted from the tools_connectors_wanted answer. */
  wantedConnectors: string[];
  /** True when the user tracks health, energy, or sleep in any form. */
  tracksHealth: boolean;
  /** True when the user described manual workflows that should be automated. */
  hasBrokenWorkflows: boolean;
};

// ─── Next step type ──────────────────────────────────────────────────

export type NextStep = {
  /** Stable id so reruns are diff-able. Format: `<vertical>-<slug>`. */
  id: string;
  vertical: DashboardVertical;
  title: string;
  /** One-line tie-back to the answer or signal that motivated this step. */
  why: string;
  /** Question fields whose answers informed this step. */
  source_fields: QuestionField[];
  priority: ActionPriority;
  /** Optional concrete metric the user can mark as done. */
  target_metric?: string;
};

// ─── Parsers ─────────────────────────────────────────────────────────
//
// Free-text answers get normalized into numbers and booleans here.
// Every parser returns null on miss so signals stay honest about
// missing data instead of inventing zeros.

const NUMBER_RX = /(\d{1,3}(?:[,.]\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/g;

function parseFirstDollarAmount(text: string | null): number | null {
  if (!text) return null;
  // Match $1,234 / $1.2k / 1200 / 1.5k forms.
  const compact = text.replace(/\s+/g, " ");
  const dollarMatch = compact.match(
    /\$\s*([\d,\.]+)\s*(k|thousand|m|million)?/i
  );
  if (dollarMatch) {
    const raw = Number(dollarMatch[1].replace(/,/g, ""));
    if (!Number.isFinite(raw)) return null;
    const unit = (dollarMatch[2] ?? "").toLowerCase();
    if (unit.startsWith("k") || unit === "thousand") return raw * 1000;
    if (unit.startsWith("m") || unit === "million") return raw * 1_000_000;
    return raw;
  }
  // Fall back to first bare number > 100 (skip "1-10" scale answers).
  const bareMatches = compact.match(NUMBER_RX);
  if (!bareMatches) return null;
  for (const m of bareMatches) {
    const n = Number(m.replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 100) return n;
  }
  return null;
}

function parseEarningsRange(
  text: string | null
): { low: number | null; high: number | null } {
  if (!text) return { low: null, high: null };
  // Look for two dollar amounts in the same answer ("$3,600 to $4,000").
  const matches = Array.from(
    text.matchAll(/\$\s*([\d,\.]+)\s*(k|thousand|m|million)?/gi)
  );
  if (matches.length === 0) return { low: null, high: null };
  const values = matches
    .map((m) => {
      const raw = Number(m[1].replace(/,/g, ""));
      if (!Number.isFinite(raw)) return null;
      const unit = (m[2] ?? "").toLowerCase();
      if (unit.startsWith("k") || unit === "thousand") return raw * 1000;
      if (unit.startsWith("m") || unit === "million") return raw * 1_000_000;
      return raw;
    })
    .filter((v): v is number => v !== null);
  if (values.length === 0) return { low: null, high: null };
  const low = Math.min(...values);
  const high = Math.max(...values);
  return { low, high };
}

function parseTotalDebt(text: string | null): number | null {
  if (!text) return null;
  // Prefer an explicit "total" line if present, otherwise sum every
  // dollar amount in the answer.
  const totalLine = text.match(
    /(total|roughly|around|about)[^\$]*\$\s*([\d,\.]+)\s*(k|thousand)?/i
  );
  if (totalLine) {
    const raw = Number(totalLine[2].replace(/,/g, ""));
    if (Number.isFinite(raw)) {
      const unit = (totalLine[3] ?? "").toLowerCase();
      return unit.startsWith("k") || unit === "thousand" ? raw * 1000 : raw;
    }
  }
  const matches = Array.from(
    text.matchAll(/\$\s*([\d,\.]+)\s*(k|thousand)?/gi)
  );
  if (matches.length === 0) return null;
  let sum = 0;
  for (const m of matches) {
    const raw = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(raw)) continue;
    const unit = (m[2] ?? "").toLowerCase();
    sum += unit.startsWith("k") || unit === "thousand" ? raw * 1000 : raw;
  }
  return sum > 0 ? sum : null;
}

function parseBurn(text: string | null): number | null {
  if (!text) return null;
  // Sum every dollar amount in the answer. Burn answers tend to be
  // line-itemed ("rent $2,000, car $700, food $500…").
  const matches = Array.from(
    text.matchAll(/\$\s*([\d,\.]+)\s*(k|thousand)?/gi)
  );
  if (matches.length === 0) return parseFirstDollarAmount(text);
  let sum = 0;
  for (const m of matches) {
    const raw = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(raw)) continue;
    const unit = (m[2] ?? "").toLowerCase();
    sum += unit.startsWith("k") || unit === "thousand" ? raw * 1000 : raw;
  }
  return sum > 0 ? sum : null;
}

function parseRunwayMonths(text: string | null): number | null {
  if (!text) return null;
  // Explicit "no savings, no runway" → 0.
  if (/\bno (savings|runway)\b/i.test(text)) return 0;
  // "X months" pattern.
  const m = text.match(/(\d+(?:\.\d+)?)\s*month/i);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseScale1to10(text: string | null): number | null {
  if (!text) return null;
  // Look for "X/10" or "X out of 10" or a bare number ≤ 10 at the start.
  const slash = text.match(/(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*10/i);
  if (slash) {
    const n = Number(slash[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 10) return n;
  }
  return null;
}

function parseFollowerCount(text: string | null): number | null {
  if (!text) return null;
  // Match "2,000 followers" or "around 2k followers".
  const m = text.match(/(\d{1,3}(?:[,.]\d{3})*|\d+(?:\.\d+)?)\s*(k|thousand)?\s*follower/i);
  if (!m) return null;
  const raw = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(raw)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  if (unit.startsWith("k") || unit === "thousand") return raw * 1000;
  return raw;
}

function parseTopFiveNames(text: string | null): string[] {
  if (!text) return [];
  // Strip parenthetical commentary so signal text doesn't pollute the
  // name list. Then split on newlines, commas, or " and ".
  const cleaned = text.replace(/\([^)]*\)/g, "");
  const tokens = cleaned
    .split(/[\n,;]| and /i)
    .map((s) => s.trim())
    .filter(Boolean)
    // Drop tokens that look like sentences instead of names.
    .filter((t) => t.split(/\s+/).length <= 4 && !/[.!?]/.test(t));
  // De-dupe in input order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, 10);
}

function parseMonetizableSkills(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 60)
    .slice(0, 12);
}

function answerMentions(
  text: string | null,
  needles: readonly string[]
): boolean {
  if (!text) return false;
  const lc = text.toLowerCase();
  return needles.some((n) => lc.includes(n.toLowerCase()));
}

// ─── Signal derivation ───────────────────────────────────────────────

const EMPTY_SIGNALS: ProfileSignals = {
  roleType: null,
  prefersOperatingControl: false,
  wmeUncertain: false,
  hasStayTerms: false,
  monetizableSkills: [],
  needsFirstNonSalaryDollar: false,
  hasActiveBuild: false,
  musicSeriousness: null,
  wantsOnCamera: false,
  socialFollowers: null,
  personalBrandDormant: false,
  earningsMonthlyLow: null,
  earningsMonthlyHigh: null,
  monthlyBurn: null,
  runwayMonths: null,
  stabilityFloor: null,
  gapToFloor: null,
  totalDebt: null,
  zeroRunway: false,
  topFivePeople: [],
  topFiveIncomplete: false,
  hasMeetingMaker: false,
  underleveragedHunker: false,
  hasLockingInBlocker: false,
  visionKnownFor: null,
  visionFear: null,
  calendarOrganized: false,
  hasConnectorWishlist: false,
  wantedConnectors: [],
  tracksHealth: false,
  hasBrokenWorkflows: false
};

export function deriveSignals(
  profile: ProfileQuestionnaire | null | undefined
): ProfileSignals {
  if (!profile) return EMPTY_SIGNALS;

  const earningsRange = parseEarningsRange(profile.money_earnings);
  const stabilityFloor = parseFirstDollarAmount(profile.money_stable_min);
  const gapToFloor =
    stabilityFloor !== null && earningsRange.high !== null
      ? Math.max(0, stabilityFloor - earningsRange.high)
      : null;

  const topFivePeople = parseTopFiveNames(profile.network_top_five);
  const monetizableSkills = parseMonetizableSkills(
    profile.builder_monetizable_skills
  );

  return {
    roleType: profile.identity_role_type,
    prefersOperatingControl: answerMentions(profile.identity_role_type_why, [
      "operating equity",
      "operating logic",
      "control",
      "behind the scenes"
    ]),

    wmeUncertain:
      Boolean(profile.wme_doubts && profile.wme_doubts.trim().length > 0),
    hasStayTerms:
      Boolean(profile.wme_stay_terms && profile.wme_stay_terms.trim().length > 0),

    monetizableSkills,
    needsFirstNonSalaryDollar: answerMentions(profile.builder_made_money, [
      "only really djing",
      "not stopping",
      "not finishing",
      "no",
      "stopped me",
      "stopping me"
    ]),
    hasActiveBuild:
      Boolean(profile.builder_offer_tool && profile.builder_offer_tool.trim().length > 0),

    musicSeriousness: parseScale1to10(profile.creative_music_seriousness),
    wantsOnCamera: answerMentions(profile.creative_on_camera_again, [
      "yes",
      "hosting",
      "interviewing",
      "creating content",
      "performing"
    ]),
    socialFollowers: parseFollowerCount(profile.creative_social_state),
    personalBrandDormant: answerMentions(profile.creative_personal_brand, [
      "not really",
      "haven't",
      "havent",
      "no"
    ]),

    earningsMonthlyLow: earningsRange.low,
    earningsMonthlyHigh: earningsRange.high,
    monthlyBurn: parseBurn(profile.money_burn),
    runwayMonths: parseRunwayMonths(profile.money_runway),
    stabilityFloor,
    gapToFloor,
    totalDebt: parseTotalDebt(profile.money_debt),
    zeroRunway: answerMentions(profile.money_runway, [
      "no savings",
      "no runway",
      "0",
      "zero"
    ]),

    topFivePeople,
    topFiveIncomplete: topFivePeople.length < 5,
    hasMeetingMaker:
      Boolean(
        profile.network_meeting_maker &&
          profile.network_meeting_maker.trim().length > 0
      ),
    underleveragedHunker: answerMentions(profile.network_hunker_use, [
      "haven't",
      "havent",
      "not yet",
      "soon",
      "will soon",
      "not really"
    ]),

    hasLockingInBlocker: answerMentions(profile.vision_obstacle, [
      "lock in",
      "locking in",
      "lockin"
    ]),
    visionKnownFor: profile.vision_known_for,
    visionFear: profile.vision_fear,

    calendarOrganized: answerMentions(profile.tools_calendar, [
      "plan", "block", "schedule", "organize", "use it to", "every week"
    ]) && !answerMentions(profile.tools_calendar, [
      "just collect", "only invites", "don't really", "rarely"
    ]),
    hasConnectorWishlist:
      Boolean(profile.tools_connectors_wanted) &&
      (profile.tools_connectors_wanted?.trim().length ?? 0) > 10,
    wantedConnectors: parseConnectorNames(profile.tools_connectors_wanted),
    tracksHealth:
      Boolean(profile.tools_health_tracking) &&
      !answerMentions(profile.tools_health_tracking, [
        "no", "not really", "nothing", "don't track", "don't use"
      ]),
    hasBrokenWorkflows:
      Boolean(profile.tools_broken_workflows) &&
      (profile.tools_broken_workflows?.trim().length ?? 0) > 20
  };
}

function parseConnectorNames(text: string | null): string[] {
  if (!text) return [];
  const KNOWN = [
    "notion", "slack", "google calendar", "gcal", "gmail", "email",
    "whatsapp", "phone", "contacts", "health", "apple watch", "fitness",
    "airtable", "trello", "asana", "linear", "hubspot", "salesforce",
    "spotify", "soundcloud", "instagram", "tiktok", "twitter", "x",
    "linkedin", "dropbox", "drive", "google drive", "sheets"
  ];
  const lc = text.toLowerCase();
  return KNOWN.filter((name) => lc.includes(name));
}

// ─── Slicing: per-vertical context bundles ───────────────────────────

/**
 * Q&A pair with vertical attribution. Used by both the prompt builder
 * and the API endpoint.
 */
export type ProfileSliceEntry = {
  field: QuestionField;
  question: string;
  answer: string;
  section: ProfileSectionKey;
};

/**
 * Returns the questionnaire entries that feed a specific dashboard
 * vertical. Includes both per-question vertical tags and section-level
 * tags. Empty answers are filtered out so partial completion still
 * yields useful slices.
 */
export function profileSliceForVertical(
  profile: ProfileQuestionnaire | null | undefined,
  vertical: DashboardVertical
): ProfileSliceEntry[] {
  if (!profile) return [];

  const directFields = new Set<QuestionField>(
    FIELDS_BY_VERTICAL[vertical] ?? []
  );
  // Also include any field whose parent section is tagged for this
  // vertical, even if the question itself is not. This catches the
  // "broad context" case (e.g. all of Vision feeding /smart).
  const sectionKeys = new Set<ProfileSectionKey>(
    SECTIONS_BY_VERTICAL[vertical] ?? []
  );

  const entries: ProfileSliceEntry[] = [];
  for (const section of questionnaireSections) {
    const sectionMatches = sectionKeys.has(section.key);
    for (const q of section.questions) {
      const fieldMatches = directFields.has(q.field);
      if (!fieldMatches && !sectionMatches) continue;
      const raw = profile[q.field];
      if (raw == null) continue;
      const text = String(raw).trim();
      if (!text) continue;
      entries.push({
        field: q.field,
        question: q.label,
        answer: text,
        section: section.key
      });
    }
  }
  return entries;
}

/**
 * Renders a profile slice as a flat string suitable for prompt
 * injection. Preserves question wording so the LLM has the framing,
 * not just the answer.
 */
export function profileSliceToString(slice: ProfileSliceEntry[]): string {
  if (slice.length === 0) return "";
  return slice
    .map((e) => `Q: ${e.question}\nA: ${e.answer}`)
    .join("\n\n");
}

// ─── Next-step generators ────────────────────────────────────────────
//
// One generator per vertical. Each one reads from `signals` and `p`
// (the raw profile) and emits an array of NextStep objects. The output
// is order-stable so the API endpoint and the UI can rely on it.

type Generator = (
  p: ProfileQuestionnaire,
  s: ProfileSignals
) => NextStep[];

function step(
  vertical: DashboardVertical,
  slug: string,
  title: string,
  why: string,
  sources: QuestionField[],
  priority: ActionPriority,
  target_metric?: string
): NextStep {
  return {
    id: `${vertical}-${slug}`,
    vertical,
    title,
    why,
    source_fields: sources,
    priority,
    ...(target_metric ? { target_metric } : {})
  };
}

const dashboardGen: Generator = (_p, s) => {
  const out: NextStep[] = [];
  if (s.hasLockingInBlocker) {
    out.push(
      step(
        "dashboard",
        "lock-in-call",
        "Book the lock-in call with Sam this week",
        "You named locking in as your single biggest blocker. The dashboard cannot help if the lane is undecided.",
        ["vision_obstacle", "identity_role_type", "identity_role_type_why"],
        "must",
        "1 calendar invite sent"
      )
    );
  }
  if (s.visionKnownFor) {
    out.push(
      step(
        "dashboard",
        "pin-known-for",
        `Pin "${s.visionKnownFor}" as the dashboard mantra`,
        "Your one-line known-for answer is the strongest filter for daily decisions. Show it on the home card.",
        ["vision_known_for"],
        "should"
      )
    );
  }
  if (s.gapToFloor !== null && s.gapToFloor > 0) {
    out.push(
      step(
        "dashboard",
        "gap-to-floor",
        `Track the $${Math.round(s.gapToFloor)}/mo gap to your stability floor`,
        "You said you need to clear your stated stability floor before any new swing feels safe. Surface the gap on the home page.",
        ["money_stable_min", "money_earnings"],
        "must",
        `Close the $${Math.round(s.gapToFloor)}/mo gap`
      )
    );
  }
  return out;
};

const actionsGen: Generator = (p, s) => {
  const out: NextStep[] = [];
  if (s.hasLockingInBlocker) {
    out.push(
      step(
        "actions",
        "force-lane-decision",
        "Run a 60-minute lane decision session with Sam",
        "Locking in is the named blocker. A timed session forces a choice instead of more drift.",
        ["vision_obstacle", "identity_role_type"],
        "must"
      )
    );
  }
  if (s.hasActiveBuild) {
    out.push(
      step(
        "actions",
        "finish-offer-tool",
        "Finish the PDF extraction module on the offer tool",
        "You named the broken piece yourself. Closing it converts the project from in-progress to portfolio-grade.",
        ["builder_offer_tool"],
        "should",
        "1 working PDF→ERP demo recording"
      )
    );
  }
  if (s.gapToFloor !== null && s.gapToFloor > 0 && s.monetizableSkills.length > 0) {
    const skill = s.monetizableSkills[0];
    out.push(
      step(
        "actions",
        "first-side-dollar",
        `Book one paid ${skill} engagement this month`,
        "First non-salary dollar is the single highest-leverage move toward your stability floor.",
        ["builder_monetizable_skills", "money_stable_min"],
        "must",
        "$1 of non-salary income"
      )
    );
  }
  if (s.underleveragedHunker) {
    out.push(
      step(
        "actions",
        "hunker-first-night",
        "Show up to the first Hunker Night after the May 1 move",
        "You said you have not used the access yet. The first night sets the pattern.",
        ["network_hunker_use"],
        "should"
      )
    );
  }
  if (p.money_burn) {
    out.push(
      step(
        "actions",
        "burn-audit",
        "Audit subscriptions and cancel three this week",
        "Your line-itemed burn includes recurring charges. Three cancellations is the lowest-friction win on the board.",
        ["money_burn"],
        "could",
        "3 subscriptions cancelled"
      )
    );
  }
  return out;
};

const goalsGen: Generator = (p, s) => {
  const out: NextStep[] = [];
  if (s.hasLockingInBlocker) {
    out.push(
      step(
        "goals",
        "lock-in-90day",
        "Add a 90-day lock-in goal to the goals list",
        "Your own named blocker plus a hard horizon turns the strategic question into a measurable goal.",
        ["vision_obstacle", "identity_role_type"],
        "must",
        "1 lane committed for 90 days"
      )
    );
  }
  if (s.gapToFloor !== null && s.gapToFloor > 0 && s.stabilityFloor !== null) {
    out.push(
      step(
        "goals",
        "stability-floor",
        `Reach $${Math.round(s.stabilityFloor)}/mo stable income`,
        "Your stated floor before any new swing feels safe. Track it as the canonical financial goal.",
        ["money_stable_min", "money_earnings"],
        "must",
        `$${Math.round(s.stabilityFloor)}/mo stable`
      )
    );
  }
  if (p.vision_three_year) {
    out.push(
      step(
        "goals",
        "three-year-vision",
        "Pin the 3-year vision to the goals page header",
        "The vision answer is the only place a long-horizon picture exists. Promote it so daily decisions can ladder up to it.",
        ["vision_three_year", "vision_known_for"],
        "should"
      )
    );
  }
  if (p.wme_stay_terms) {
    out.push(
      step(
        "goals",
        "wme-stay-terms",
        "Convert your Meridian stay-terms into a tracked condition",
        "You wrote a specific list of what would have to be true for you to stay. Tracking them turns drift into a yes/no.",
        ["wme_stay_terms", "wme_doubts"],
        "should"
      )
    );
  }
  return out;
};

const networkGen: Generator = (_p, s) => {
  const out: NextStep[] = [];
  if (s.topFivePeople.length > 0) {
    out.push(
      step(
        "network",
        "create-top-five-cards",
        `Create contact cards for ${s.topFivePeople.join(", ")}`,
        "These are the people you said could change your trajectory. They belong on the network page first.",
        ["network_top_five"],
        "must",
        `${s.topFivePeople.length} contact cards created`
      )
    );
  }
  if (s.topFiveIncomplete) {
    out.push(
      step(
        "network",
        "complete-top-five",
        "Complete the top-five list (you stopped early)",
        "You named fewer than five people. The blank slots are the strategic question, not the answer.",
        ["network_top_five"],
        "should",
        "5 named relationships"
      )
    );
  }
  if (s.underleveragedHunker) {
    out.push(
      step(
        "network",
        "hunker-room-map",
        "Map the Hunker Night room before the first event",
        "You have proximity but no plan for it. Three names per night beats showing up cold.",
        ["network_hunker_use", "network_rooms"],
        "should"
      )
    );
  }
  if (s.hasMeetingMaker) {
    out.push(
      step(
        "network",
        "meeting-maker-followup",
        "Send your meeting-maker contact one specific ask this month",
        "You named someone who could open a door. Doors close when they are not used.",
        ["network_meeting_maker"],
        "should",
        "1 specific ask sent"
      )
    );
  }
  return out;
};

const careerGen: Generator = (p, s) => {
  const out: NextStep[] = [];
  if (s.wmeUncertain) {
    out.push(
      step(
        "career",
        "wme-decision-doc",
        "Write a 1-page Meridian decision doc",
        "You named specific doubts about the long-term play. A written doc forces clarity instead of background anxiety.",
        ["wme_doubts", "wme_stay_terms", "wme_take_with_you"],
        "must"
      )
    );
  }
  if (p.wme_envy_who) {
    out.push(
      step(
        "career",
        "envy-shadow-map",
        "Map the people you envy to a shadowing or coffee plan",
        "You named real career models inside the building. Map each one to a specific conversation goal.",
        ["wme_envy_who"],
        "should"
      )
    );
  }
  if (p.wme_take_with_you) {
    out.push(
      step(
        "career",
        "career-archive-import",
        "Import your Meridian-portable assets into the career archive",
        "You listed what would still have value after Meridian. The archive is where it lives so it survives any role change.",
        ["wme_take_with_you"],
        "could"
      )
    );
  }
  if (s.roleType) {
    out.push(
      step(
        "career",
        "role-lane-tag",
        `Tag the career page with role lean: ${s.roleType}`,
        "Your declared role type filters which career events count as signal vs noise.",
        ["identity_role_type", "identity_role_type_why"],
        "could"
      )
    );
  }
  return out;
};

const financesGen: Generator = (p, s) => {
  const out: NextStep[] = [];
  if (
    s.earningsMonthlyHigh !== null ||
    s.monthlyBurn !== null ||
    s.totalDebt !== null
  ) {
    out.push(
      step(
        "finances",
        "seed-baseline",
        "Seed the current month from your questionnaire numbers",
        "You already wrote the numbers down in the questionnaire. The finances page should pre-fill from them instead of asking again.",
        ["money_earnings", "money_burn", "money_debt"],
        "must"
      )
    );
  }
  if (s.zeroRunway) {
    out.push(
      step(
        "finances",
        "runway-alert",
        "Turn on the runway alert (you said zero)",
        "You wrote zero savings, zero runway. Surface a banner on the dashboard until the number is non-zero.",
        ["money_runway"],
        "must",
        ">0 months of runway"
      )
    );
  }
  if (s.gapToFloor !== null && s.gapToFloor > 0) {
    out.push(
      step(
        "finances",
        "gap-tracker",
        `Track the $${Math.round(s.gapToFloor)}/mo gap to your floor`,
        "Your stated floor minus your stated current earnings. Surface the gap as a single number on the finances page.",
        ["money_stable_min", "money_earnings"],
        "must",
        `$${Math.round(s.gapToFloor)}/mo`
      )
    );
  }
  if (s.totalDebt !== null && s.totalDebt > 0) {
    out.push(
      step(
        "finances",
        "debt-snapshot",
        `Pin your $${Math.round(s.totalDebt).toLocaleString()} debt snapshot to the finances header`,
        "You listed the breakdown. Make it visible so it informs every cash decision instead of staying abstract.",
        ["money_debt"],
        "should"
      )
    );
  }
  return out;
};

const journalGen: Generator = (_p, s) => {
  const out: NextStep[] = [];
  if (s.visionFear) {
    out.push(
      step(
        "journal",
        "fear-prompt",
        "Add a recurring journal prompt about your stated fear",
        "You wrote it down once. The journal is where you face it on a cadence so it stops being background noise.",
        ["vision_fear"],
        "should"
      )
    );
  }
  if (s.hasLockingInBlocker) {
    out.push(
      step(
        "journal",
        "weekly-lock-in-check",
        "Weekly journal check on the lock-in question",
        "Your blocker is named. A weekly entry creates the friction that forces an answer instead of drift.",
        ["vision_obstacle"],
        "should",
        "1 entry per week"
      )
    );
  }
  return out;
};

const socialGen: Generator = (_p, s) => {
  const out: NextStep[] = [];
  if (s.wantsOnCamera) {
    out.push(
      step(
        "social",
        "first-build-video",
        "Record one short video this month about the build",
        "You said you want to be on camera again and named hosting plus content as the lane. Start with what you are already doing.",
        ["creative_on_camera_again", "builder_offer_tool"],
        "should",
        "1 short video published"
      )
    );
  }
  if (s.personalBrandDormant && s.socialFollowers !== null) {
    out.push(
      step(
        "social",
        "brand-restart",
        "Pick one platform and post once a week for four weeks",
        `You said the personal brand is dormant and you have ${s.socialFollowers} followers to start from. Cadence beats virality at this stage.`,
        ["creative_personal_brand", "creative_social_state"],
        "should",
        "4 posts in 4 weeks"
      )
    );
  }
  if (_p.creative_domino_aftermath) {
    out.push(
      step(
        "social",
        "domino-clip-reuse",
        "Pull one Tower Games clip into the social archive",
        "You said the moment went quiet. One clip reused now is more leverage than the original airing.",
        ["creative_domino_aftermath"],
        "could"
      )
    );
  }
  return out;
};

const smartGen: Generator = (_p, s) => {
  const out: NextStep[] = [];
  out.push(
    step(
      "smart",
      "vertical-context",
      "Inject vertical context into Smart Tool prompts",
      "Every page in the dashboard should pass its vertical to /api/chat so the system prompt only loads the relevant slice.",
      [],
      "must"
    )
  );
  if (s.hasLockingInBlocker) {
    out.push(
      step(
        "smart",
        "decision-mode-default",
        "Default Smart Tool to decision mode on the goals page",
        "Locking in is the active question. Decision mode is the right starting point for that vertical.",
        ["vision_obstacle"],
        "should"
      )
    );
  }
  return out;
};

const discoveryGen: Generator = (p, s) => {
  const out: NextStep[] = [];
  if (p.builder_dream_tool) {
    out.push(
      step(
        "discovery",
        "dream-tool-session",
        "Run a discovery session on your dream tool",
        "You named a specific build you would do if nothing was in the way. Discovery is where it gets pressure-tested.",
        ["builder_dream_tool", "builder_offer_tool"],
        "must"
      )
    );
  }
  if (s.monetizableSkills.length >= 3) {
    out.push(
      step(
        "discovery",
        "skill-stack-session",
        "Stack your monetizable skills into one offer",
        `You listed ${s.monetizableSkills.length} skills that work outside salary. The combined offer is usually stronger than any one alone.`,
        ["builder_monetizable_skills"],
        "should"
      )
    );
  }
  if (s.wantsOnCamera && s.roleType !== "business") {
    out.push(
      step(
        "discovery",
        "media-house-session",
        "Discovery session: the Vice + Bourdain + King media house idea",
        "You named the dream format yourself. Discovery is the right surface to take it from line item to first artifact.",
        ["creative_on_camera_again"],
        "could"
      )
    );
  }
  return out;
};

const GENERATORS: Record<DashboardVertical, Generator> = {
  dashboard: dashboardGen,
  actions: actionsGen,
  goals: goalsGen,
  network: networkGen,
  career: careerGen,
  finances: financesGen,
  journal: journalGen,
  social: socialGen,
  smart: smartGen,
  discovery: discoveryGen
};

// ─── Public API ──────────────────────────────────────────────────────

export const ALL_VERTICALS: DashboardVertical[] = [
  "dashboard",
  "actions",
  "goals",
  "network",
  "career",
  "finances",
  "journal",
  "social",
  "smart",
  "discovery"
];

export function isDashboardVertical(value: string): value is DashboardVertical {
  return (ALL_VERTICALS as string[]).includes(value);
}

/**
 * Returns the next steps for a single vertical, sorted by priority.
 * Returns an empty array (not null) so callers can chain safely.
 */
export function nextStepsForVertical(
  profile: ProfileQuestionnaire | null | undefined,
  vertical: DashboardVertical
): NextStep[] {
  if (!profile) return [];
  const signals = deriveSignals(profile);
  const generator = GENERATORS[vertical];
  if (!generator) return [];
  const steps = generator(profile, signals);
  return sortByPriority(steps);
}

/**
 * Returns next steps grouped by vertical. The map is always populated
 * with every vertical key (empty arrays for verticals with no
 * generated steps) so the UI can render a stable shape.
 */
export function nextStepsForAllVerticals(
  profile: ProfileQuestionnaire | null | undefined
): Record<DashboardVertical, NextStep[]> {
  const out = {} as Record<DashboardVertical, NextStep[]>;
  for (const v of ALL_VERTICALS) {
    out[v] = nextStepsForVertical(profile, v);
  }
  return out;
}

/**
 * Pretty-prints a vertical context bundle for prompt injection.
 * Renders the slice as a section labeled with the vertical name and
 * leads with the top derived signals so the LLM has both the structured
 * facts and the original question wording.
 */
export function profileContextBlockForVertical(
  profile: ProfileQuestionnaire | null | undefined,
  vertical: DashboardVertical
): string {
  if (!profile) return "";
  const slice = profileSliceForVertical(profile, vertical);
  if (slice.length === 0) return "";
  const signals = deriveSignals(profile);
  const facts = signalsToFactLines(signals).join("\n");
  return [
    `# Profile context for the ${vertical} vertical`,
    "",
    "## Derived facts",
    facts || "(no derived facts)",
    "",
    "## Source answers (Jordan's own words)",
    profileSliceToString(slice)
  ].join("\n");
}

// ─── Helpers ─────────────────────────────────────────────────────────

function sortByPriority(steps: NextStep[]): NextStep[] {
  const order: Record<ActionPriority, number> = { must: 0, should: 1, could: 2 };
  return steps
    .slice()
    .sort((a, b) => order[a.priority] - order[b.priority]);
}

function signalsToFactLines(s: ProfileSignals): string[] {
  const lines: string[] = [];
  if (s.roleType) lines.push(`- Self-declared role lean: ${s.roleType}`);
  if (s.hasLockingInBlocker) lines.push(`- Named blocker: locking in`);
  if (s.visionKnownFor) lines.push(`- Wants to be known for: ${s.visionKnownFor}`);
  if (s.earningsMonthlyHigh !== null && s.earningsMonthlyLow !== null) {
    lines.push(
      `- Stated earnings: $${s.earningsMonthlyLow}-$${s.earningsMonthlyHigh}/mo`
    );
  }
  if (s.stabilityFloor !== null) {
    lines.push(`- Stated stability floor: $${s.stabilityFloor}/mo`);
  }
  if (s.gapToFloor !== null && s.gapToFloor > 0) {
    lines.push(`- Gap to floor: $${s.gapToFloor}/mo`);
  }
  if (s.totalDebt !== null && s.totalDebt > 0) {
    lines.push(`- Total debt: $${s.totalDebt.toLocaleString()}`);
  }
  if (s.zeroRunway) lines.push(`- Runway: zero`);
  if (s.monetizableSkills.length > 0) {
    lines.push(`- Monetizable skills: ${s.monetizableSkills.join(", ")}`);
  }
  if (s.topFivePeople.length > 0) {
    lines.push(`- Top-five named: ${s.topFivePeople.join(", ")}`);
  }
  if (s.topFiveIncomplete && s.topFivePeople.length > 0) {
    lines.push(`- Top-five list is incomplete (${s.topFivePeople.length}/5)`);
  }
  if (s.wmeUncertain) lines.push(`- Meridian long-term: uncertain per own answer`);
  if (s.underleveragedHunker) lines.push(`- Hunker Night access: not yet leveraged`);
  if (s.wantsOnCamera) lines.push(`- Wants to return to on-camera work`);
  if (s.musicSeriousness !== null) {
    lines.push(`- Music seriousness (self-rated): ${s.musicSeriousness}/10`);
  }
  if (s.socialFollowers !== null) {
    lines.push(`- Social followers (approx): ${s.socialFollowers}`);
  }
  return lines;
}

/**
 * Re-export so callers that already pull from this file do not also
 * have to import from the content module.
 */
export { questionnaireSections } from "@/content/profile-questionnaire";
export type { Question };
