import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getProfileQuestionnaire } from "@/lib/repo";
import {
  ALL_VERTICALS,
  deriveSignals,
  isDashboardVertical,
  nextStepsForAllVerticals,
  nextStepsForVertical,
  profileSliceForVertical,
  type DashboardVertical,
  type NextStep,
  type ProfileSliceEntry,
  type ProfileSignals
} from "@/lib/profile-mapping";

/**
 * GET /api/profile/next-steps
 *
 * Returns the structured next-step payload derived from the user's
 * questionnaire answers. This is the bridge between the /profile page
 * and the rest of the dashboard. Every vertical reads the same shape
 * so a goals page, a finances page, and the Smart Tool can each pull
 * exactly the slice they care about.
 *
 * Query params:
 *   - vertical=<key>   Optional. When supplied, narrows the response
 *                      to a single vertical. Otherwise returns the
 *                      full grouped map. 400 if the key is unknown.
 *   - include=context  Optional. When present, includes the raw Q&A
 *                      slice for the requested vertical (or all
 *                      verticals if no vertical is supplied).
 *   - include=signals  Optional. When present, includes the derived
 *                      signal object alongside the steps.
 *
 * Response shape (single vertical):
 *   {
 *     vertical: "goals",
 *     steps: NextStep[],
 *     signals?: ProfileSignals,
 *     context?: ProfileSliceEntry[]
 *   }
 *
 * Response shape (all verticals):
 *   {
 *     verticals: ["dashboard", "actions", ...],
 *     steps: Record<DashboardVertical, NextStep[]>,
 *     signals?: ProfileSignals,
 *     context?: Record<DashboardVertical, ProfileSliceEntry[]>
 *   }
 *
 * In demo mode (no real backend yet) this reads from
 * `demoProfileQuestionnaire`. When the Supabase wiring lands, swap the
 * `loadProfile()` helper for a real query.
 */

type SingleVerticalResponse = {
  vertical: DashboardVertical;
  steps: NextStep[];
  signals?: ProfileSignals;
  context?: ProfileSliceEntry[];
};

type AllVerticalsResponse = {
  verticals: DashboardVertical[];
  steps: Record<DashboardVertical, NextStep[]>;
  signals?: ProfileSignals;
  context?: Record<DashboardVertical, ProfileSliceEntry[]>;
};

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const url = new URL(request.url);
  const verticalParam = url.searchParams.get("vertical");
  const includeParams = url.searchParams.getAll("include");
  const wantContext = includeParams.includes("context");
  const wantSignals = includeParams.includes("signals");

  const profile = await loadProfile();
  if (!profile) {
    return NextResponse.json(
      { error: "No profile found." },
      { status: 404 }
    );
  }

  // Single-vertical mode.
  if (verticalParam) {
    if (!isDashboardVertical(verticalParam)) {
      return NextResponse.json(
        {
          error: `Unknown vertical: ${verticalParam}`,
          allowed: ALL_VERTICALS
        },
        { status: 400 }
      );
    }
    const body: SingleVerticalResponse = {
      vertical: verticalParam,
      steps: nextStepsForVertical(profile, verticalParam)
    };
    if (wantSignals) body.signals = deriveSignals(profile);
    if (wantContext) {
      body.context = profileSliceForVertical(profile, verticalParam);
    }
    return NextResponse.json(body);
  }

  // All-verticals mode.
  const body: AllVerticalsResponse = {
    verticals: ALL_VERTICALS,
    steps: nextStepsForAllVerticals(profile)
  };
  if (wantSignals) body.signals = deriveSignals(profile);
  if (wantContext) {
    const ctx = {} as Record<DashboardVertical, ProfileSliceEntry[]>;
    for (const v of ALL_VERTICALS) {
      ctx[v] = profileSliceForVertical(profile, v);
    }
    body.context = ctx;
  }
  return NextResponse.json(body);
}

async function loadProfile() {
  return getProfileQuestionnaire();
}
