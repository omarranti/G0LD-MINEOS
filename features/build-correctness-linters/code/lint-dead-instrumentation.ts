/**
 * Instrumentation health report: absence AND regression.
 *
 * Two different failures hide in analytics, and only one of them was covered
 * before.
 *
 * 1. ABSENCE. An event the code can emit that PostHog has never received.
 *    That blind spot is why `phone_otp_sent`, `login_completed`,
 *    `seo_cta_clicked` and `signup_method_selected` sat at zero ingests for
 *    120+ days without anyone noticing. Phone auth was later removed outright:
 *    it had never once succeeded, and no account in production had a phone
 *    number.
 *
 * 2. REGRESSION. An event that WAS firing and stopped. The absence check is
 *    blind to this for a full window: `signup_attempted` stopped on 2026-07-11
 *    but had fired inside the preceding 30 days, so it read as alive until
 *    2026-08-10. Signups were dead for 15 days and this report would have said
 *    everything was fine. That is the hole this half closes.
 *
 * Run: npm run lint:instrumentation
 * Needs POSTHOG_API_KEY (personal API key, scope `query:read`) and
 * POSTHOG_PROJECT_ID.
 *
 * Exits 1 when a CRITICAL_PATH event is dead or has regressed. Everything else
 * is INFO, because a zero on `review_submitted` means nobody has reviewed
 * anything yet, not that the code is broken.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");
const WINDOW_DAYS = 30;

/**
 * Week-over-week regression thresholds.
 *
 * VOLUME_FLOOR: only judge an event that fired at least this many times in the
 * prior week. Most events here fire single digits per week, where a percentage
 * drop is meaningless noise: 2 to 0 is not a signal. Below the floor the
 * report stays silent rather than guessing.
 *
 * Why 5 specifically. It matches the floor already used by the "Signup funnel
 * flatline" PostHog alert, so both sentinels agree on what counts as enough
 * traffic to judge. It is also empirically the right cut for this dataset:
 * replaying the real outage as of 2026-07-19, exactly one event cleared the
 * floor and collapsed (`signup_attempted`, prior 5 to current 0) while
 * `explore_cta_clicked` (5 to 3), `founding_checkout_started` (5 to 1) and
 * `signup_page_viewed` (5 to 5) correctly stayed silent. One true positive,
 * zero false positives, on the incident this was written for.
 *
 * COLLAPSE_RATIO: fire when the current week fell to a tenth or less of the
 * prior week. Applied as floor(prior * ratio), which self-tightens at low
 * volume and is what keeps this quiet: at prior=5 the bar is current==0 (a
 * complete stop, nothing less), while at prior=139 it is current<=13 (a 91%
 * collapse). One rule, appropriately strict at both ends of the traffic range.
 */
const VOLUME_FLOOR = 5;
const COLLAPSE_RATIO = 0.1;

/**
 * Events on the money path. A zero here means something is broken, not that
 * the product is young. These fail the check.
 */
const CRITICAL_PATH = new Set([
  "signup_page_viewed",
  "signup_attempted",
  "signup_completed",
  "login_page_viewed",
  "login_attempted",
  "listing_saved",
  "save_signup_prompt",
  "seo_cta_clicked",
  // Exposure metric for a live experiment (hero CTA). If this stops
  // firing the experiment silently collects nothing, which looks identical to
  // "no result yet". Firing at ~30/day as of 2026-07-26, so it will not
  // false-alarm.
  "hero_cta_viewed",
  // Promoted 2026-07-26 once both were confirmed ingesting on production.
  // Volume checked before promoting rather than assumed: real visitors reach
  // searched /explore URLs on most days of the last 30, 4-19 people daily, so
  // weekly totals clear VOLUME_FLOOR comfortably and a zero here means search
  // or the filter rail broke.
  "explore_searched",
  "explore_filter_applied",
]);

/**
 * Money-path events that cannot fire until something upstream does. Marking
 * these CRITICAL unconditionally paints the check red for a reason that is not
 * a defect, and a permanently red check is one everybody learns to ignore.
 * Each is only escalated to CRITICAL once its precondition fired in the same
 * window; until then it reports as INFO.
 */
const CONDITIONAL_CRITICAL: Record<string, string> = {
  // Nobody can save a listing before an account exists to save it to.
  // Proven wired end-to-end 2026-07-28: the tracker fires on every surface and
  // the historical zero traced to the save MUTATION failing server-side
  // (stale-session FK violation), not to missing instrumentation. Do not
  // re-audit the wiring; audit save volume.
  listing_saved: "signup_completed",
};

/**
 * Failure-path events that are legitimately allowed to never fire. A zero on
 * these is good news, so they are excluded from the report entirely.
 */
const EXPECTED_SILENT = new Set([
  "waitlist_error",
  "signup_error",
  "login_error",
  "founding_checkout_error",
]);

/**
 * Deliberately NOT in CRITICAL_PATH, with the reason, so nobody re-adds them
 * on a hunch:
 *
 * - `login_completed`: only the email/credentials path emits it
 *   (auth-form.tsx). Google logins redirect server-side and never reach that
 *   line. Verified 2026-07-26: all 4 `login_attempted` in project history were
 *   google (2) or the since-removed phone flow (2), so an email login has
 *   never once been attempted. Zero is correct, not broken. The regression
 *   half of this report now covers it the moment email logins get real volume,
 *   which is why demoting it is safe.
 * - `listing_website_clicked`: added 2026-08-06 as the exit popup's new
 *   trigger. The action itself is well established, 75 taps in the first 7.5
 *   weeks of ListingMetric, but only ~10/week and only on the 47% of listings
 *   that carry a website link, so weekly totals sit under VOLUME_FLOOR and a
 *   CRITICAL listing here would go red for being small rather than broken.
 *   Promote it once organic volume clears the floor, per the same rule that
 *   held explore_searched back.
 * - `founding_checkout_completed`, `trial_started`, `review_submitted`,
 *   `referral_link_copied`: legitimately zero for a pre-revenue product.
 *   `founding_checkout_completed` and `trial_started` are captured server-side
 *   from the Stripe webhook, which is why this script also scans for
 *   `captureServer(id, "event")` (see collectEvents).
 *
 * `referral_landed` was DELETED from analytics.ts 2026-07-28 rather than wired.
 * It had no call site and no surface that could supply its payload: the landing
 * route /r/[code] drops an httpOnly cookie and redirects to /?ref=1, so the
 * client can read neither the referrer id nor the code, and an anonymous
 * visitor has no distinct_id for a server capture. Referral attribution does
 * not depend on it (the createUser event writes User.referredByUserId).
 *
 * `explore_searched` and `explore_filter_applied` were listed here and have
 * since been PROMOTED to CRITICAL_PATH (2026-07-26), once both were confirmed
 * ingesting on production. Getting there took two fixes, worth recording:
 * they were exported from analytics.ts and imported by nothing (a wiring PR
 * fixed that), and `explore_searched` still did not fire afterwards because it
 * captures on mount, which runs before PostHogProvider calls posthog.init()
 * and was silently discarded (a later PR fixed that for every mount-time
 * capture).
 */

type EventStats = {
  total: number;
  current7d: number;
  prior7d: number;
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

/** Collect statically-declared event names, plus a count of dynamic ones. */
function collectEvents(): { names: Set<string>; dynamic: string[] } {
  const names = new Set<string>();
  const dynamic: string[] = [];
  const staticCall = /(?:posthog\.)?capture\(\s*"([a-z0-9_]+)"/g;
  // Server-side captures take the distinct id first: captureServer(userId,
  // "event", props). They were invisible to the pattern above, which only
  // matched `capture("`. That was harmless while every server event also had a
  // client-side twin in analytics.ts, and stopped being harmless the moment
  // `founding_checkout_completed` (a revenue event, fired only from the Stripe
  // webhook) lost its unused twin. Missing it here would have quietly dropped
  // the money path's last step out of this report.
  const serverCall = /captureServer\(\s*[^,]+,\s*"([a-z0-9_]+)"/g;
  // capture(`quiz_${action}`) and friends cannot be resolved without running
  // the code, so they are surfaced rather than silently dropped.
  const dynamicCall = /(?:posthog\.)?capture\(\s*`/g;

  for (const file of walk(SRC)) {
    const body = readFileSync(file, "utf8");
    for (const m of body.matchAll(staticCall)) names.add(m[1]);
    for (const m of body.matchAll(serverCall)) names.add(m[1]);
    if (dynamicCall.test(body)) dynamic.push(file.replace(process.cwd() + "/", ""));
    dynamicCall.lastIndex = 0;
  }
  // `capture` is also the name of the local helper's own definition.
  names.delete("event");
  return { names, dynamic };
}

/**
 * One query answers both halves: 30-day totals for the absence check, and the
 * two trailing weeks for the regression check.
 */
async function eventStats(apiKey: string, projectId: string): Promise<Map<string, EventStats>> {
  const res = await fetch(`https://us.posthog.com/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query: `
          SELECT
              event,
              count() AS total,
              countIf(timestamp >= now() - INTERVAL 7 DAY) AS current_7d,
              countIf(timestamp >= now() - INTERVAL 14 DAY
                      AND timestamp < now() - INTERVAL 7 DAY) AS prior_7d
          FROM events
          WHERE timestamp > now() - INTERVAL ${WINDOW_DAYS} DAY
          GROUP BY event
        `,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`PostHog query failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { results: unknown[][] };
  const stats = new Map<string, EventStats>();
  for (const row of json.results) {
    stats.set(String(row[0]), {
      total: Number(row[1]),
      current7d: Number(row[2]),
      prior7d: Number(row[3]),
    });
  }
  return stats;
}

/** True when the event is on the money path given what else fired this window. */
function isCritical(event: string, stats: Map<string, EventStats>): boolean {
  const precondition = CONDITIONAL_CRITICAL[event];
  if (precondition) {
    return (stats.get(precondition)?.total ?? 0) > 0;
  }
  return CRITICAL_PATH.has(event);
}

type Regression = {
  event: string;
  prior: number;
  current: number;
  threshold: number;
};

async function main() {
  const apiKey = process.env.POSTHOG_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;

  const { names, dynamic } = collectEvents();
  console.log(`Found ${names.size} statically-declared events in src/.`);
  if (dynamic.length) {
    console.log(
      `Note: ${dynamic.length} file(s) build event names dynamically and are NOT checked: ${dynamic.join(", ")}`,
    );
  }

  if (!apiKey || !projectId) {
    // A check that silently passes when it cannot run is worse than no check.
    // That is exactly how this job sat green while POSTHOG_API_KEY was unset.
    // Locally, skipping is fine and expected. In CI it is a broken job and has
    // to look like one.
    const message =
      "POSTHOG_API_KEY / POSTHOG_PROJECT_ID not set, so nothing was checked.";
    if (process.env.CI) {
      console.error(`\n✗ ${message}\n  In CI this is a failure, not a skip: a green run here would\n  mean "we verified nothing" while looking identical to "all clear".`);
      process.exit(1);
    }
    console.log(`\n- ${message} Skipping (local run).`);
    return;
  }

  const stats = await eventStats(apiKey, projectId);

  // ── Absence: declared in code, never received ────────────────────────────
  const dead = [...names]
    .filter((e) => !stats.has(e) && !EXPECTED_SILENT.has(e))
    .sort();
  const deadCritical = dead.filter((e) => isCritical(e, stats));
  const deadInfo = dead.filter((e) => !isCritical(e, stats));

  // ── Regression: was firing, collapsed ────────────────────────────────────
  const regressions: Regression[] = [];
  let judged = 0;
  let belowFloor = 0;
  for (const event of [...names].sort()) {
    if (EXPECTED_SILENT.has(event)) continue;
    const s = stats.get(event);
    if (!s) continue; // already covered by the absence check
    if (s.prior7d < VOLUME_FLOOR) {
      belowFloor++;
      continue;
    }
    judged++;
    const threshold = Math.floor(s.prior7d * COLLAPSE_RATIO);
    if (s.current7d <= threshold) {
      regressions.push({
        event,
        prior: s.prior7d,
        current: s.current7d,
        threshold,
      });
    }
  }
  const regCritical = regressions.filter((r) => isCritical(r.event, stats));
  const regInfo = regressions.filter((r) => !isCritical(r.event, stats));

  // ── Report ───────────────────────────────────────────────────────────────
  console.log(
    `\nRegression check: compared the last 7 days against the 7 before it.\n` +
      `  ${judged} event(s) had >= ${VOLUME_FLOOR} in the prior week and were judged.\n` +
      `  ${belowFloor} event(s) were below the floor and deliberately skipped.`,
  );

  if (regressions.length) {
    console.log(`\n✗ REGRESSED (${regressions.length}) — were firing, now collapsed:`);
    for (const r of regressions) {
      const tag = isCritical(r.event, stats) ? "MONEY PATH" : "info";
      console.log(
        `    ${r.event}: ${r.prior} -> ${r.current} in 7d (fires at <= ${r.threshold}) [${tag}]`,
      );
    }
    console.log(
      "\n  An event that was healthy and stopped is the shape of a shipped\n" +
        "  defect, not a traffic dip. Check what deployed in the last week.",
    );
  } else {
    console.log(`\n✓ Nothing regressed. No judged event collapsed week over week.`);
  }

  if (dead.length) {
    if (deadCritical.length) {
      console.log(
        `\n✗ DEAD ON THE MONEY PATH (${deadCritical.length}) — no ingests in ${WINDOW_DAYS} days:`,
      );
      for (const e of deadCritical) console.log(`    ${e}`);
      console.log(
        "\n  These should be firing. Either the code path is unreachable, the\n" +
          "  capture never runs, or the feature is broken. Check the surface\n" +
          "  before assuming it is a traffic problem.",
      );
    }
    if (deadInfo.length) {
      console.log(`\n  Never fired, review but not failing (${deadInfo.length}):`);
      for (const e of deadInfo) console.log(`    ${e}`);
    }
  } else {
    console.log(`\n✓ Every declared event has fired in the last ${WINDOW_DAYS} days.`);
  }

  // Stable fingerprint of the findings, so the workflow can tell a genuinely
  // new problem from the same one it already reported and not re-comment.
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        dead: dead.sort(),
        regressed: regressions.map((r) => r.event).sort(),
      }),
    )
    .digest("hex")
    .slice(0, 12);
  console.log(`\nFINGERPRINT: ${fingerprint}`);

  // Machine-readable counts. CI treats these differently on purpose: a
  // REGRESSION is by definition a change away from a working state, so it goes
  // red immediately. A DEAD event can be a standing, already-tracked condition
  // (`listing_saved` has never fired and will not until someone signs up and
  // saves), and holding the build red for weeks on a known item is how a check
  // gets muted. Dead events notify through the issue instead.
  console.log(`DEAD_CRITICAL: ${deadCritical.length}`);
  console.log(`REGRESSED_CRITICAL: ${regCritical.length}`);

  const failures = deadCritical.length + regCritical.length;
  if (failures) {
    console.log(
      `\nFailing: ${deadCritical.length} dead + ${regCritical.length} regressed on the money path.`,
    );
    process.exit(1);
  }
  console.log(
    `\n✓ Money path clear.` +
      (deadInfo.length + regInfo.length
        ? ` (${deadInfo.length + regInfo.length} non-critical item(s) noted above.)`
        : ""),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
