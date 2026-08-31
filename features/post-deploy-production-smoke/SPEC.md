# Post-Deploy Production Smoke Tests (Vercel deploy hook to GitHub Actions)

> Fire a Playwright suite against the real production origin the moment Vercel
> marks a production deploy successful, because preview-green has repeatedly
> failed to predict production.

<!-- GUIDING PRINCIPLE: capture the STRUCTURE, not the skin. The reusable value is
the idea, the data model, the logic, the contracts, the flow. -->

- **Slug:** `post-deploy-production-smoke`
- **Tags:** `ci`, `github-actions`, `vercel`, `playwright`, `smoke-test`, `deployment`, `monitoring`, `revenue`
- **Source project:** directory / marketplace web app
- **Stack:** GitHub Actions + Playwright (chromium + webkit) + Vercel `deployment_status`
- **Reuse confidence:** drop-in (one workflow file; swap the base URL, the test command, and the issue copy)
- **Status in origin:** live in prod

## Problem it solves
Every other CI gate inspects source. None of them answer the only question that
matters after a deploy: **can a person still complete the actions that make
money.** In the origin app, two conversion-killing bugs both passed a Vercel
preview and a full local verify, then broke for real users in production.

Preview environments differ from production in database, environment variables,
feature flags, edge config, and CDN behavior, so preview-green is a weaker signal
than it feels like. This runs the suite where the users are, at the moment a
regression becomes real.

## When to reach for this
- You deploy to Vercel and want a runtime check bound to the deploy, not to the merge.
- You have a handful of revenue-bearing actions (signup, checkout, search, save)
  whose breakage you would want to know about in minutes rather than from a user.
- You already have Playwright tests and no signal that they ever run against prod.
- Your CI is entirely static analysis and you have noticed it cannot catch a
  runtime, data, or config regression.

## How it works
- **`deployment_status` is the trigger.** Vercel emits it on every deploy state
  change, so the job fires the instant a production deploy goes green.
- **A job-level `if:` filters the event**, because `deployment_status` also fires
  for previews and for `pending` / `failure` states. The guard requires
  `state == 'success'` **and** `environment == 'Production'`. Without it the suite
  runs on every preview push.
- **Three triggers, three jobs to do.** The deploy hook catches deploy-caused
  regressions. A daily `schedule` catches breakage that arrives without a deploy
  (a flag flip, an expired credential, a data problem). `workflow_dispatch` takes
  an optional `base_url` so the same suite can be pointed at a preview by hand.
- **The suite asserts only what a visitor must be able to do**, not what the DOM
  looks like. That is what keeps it stable enough to be trusted.
- **Failure opens or updates a labelled issue**, then fails the job. The issue
  body carries the last 60 lines of output and a link to the trace artifact.
- **Issues are deduplicated by label**, so a persistent failure comments on the
  existing issue rather than opening one per run.
- **The exit code is captured through the pipe.** The run pipes to `tee`, so
  `$?` would be `tee`'s status; `${PIPESTATUS[0]}` is the real one, stashed in a
  step output and re-read by the later steps.

## Data model
Stateless. Inputs:

| Name | Kind | Purpose |
|---|---|---|
| `SMOKE_BASE_URL` | env | Origin under test; defaults to production |
| `base_url` | dispatch input | Manual override for checking a preview |
| `GITHUB_TOKEN` | secret | Opening and commenting on the tracking issue |
| `production-smoke` | issue label | The dedupe key |

## Key decisions & gotchas
- **Preview-green does not predict production.** This is the entry. If your only
  runtime signal comes from a preview environment, you do not have a production
  signal.
- **`deployment_status` fires far more often than you expect.** Without the
  `state`/`environment` guard the suite runs on every preview and on pending and
  failed states, which burns minutes and trains everyone to ignore the check.
- **Install WebKit, not just Chromium.** Playwright's `devices["iPhone 14"]`
  descriptor carries `defaultBrowserType: "webkit"`, so any project spreading it
  launches WebKit regardless of the rest of the suite. Installing only Chromium
  made every mobile test die in under 30ms with "Executable doesn't exist", which
  surfaced as 28 layout failures rather than as one missing browser. Keeping
  WebKit is also correct on the merits: iPhone Safari is the engine the audience
  renders in, so measure it rather than a Chromium emulation of it.
- **A suite nobody notices is worse than no suite**, because it implies coverage
  that does not exist. Failing the check is not enough; the job also files an
  issue. Conversely, opening one issue per run is how a channel gets muted, hence
  the label dedupe.
- **`tee` eats your exit code.** `set +e` plus `${PIPESTATUS[0]}` into
  `$GITHUB_OUTPUT`, then an explicit final `exit 1` step. Forgetting this makes
  every run pass.
- **Keep the daily schedule even with the deploy hook.** Not every breakage
  arrives with a deploy, and the schedule is what catches the expired token.
- **Deliberately not handled:** automatic rollback, alerting outside GitHub
  (Slack, PagerDuty), and per-deploy history. This tells you something broke and
  where; it does not fix it.

## Code layer

| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/smoke-production.yml` | The whole pattern: triggers, the production-only guard, browser install, piped run with exit-code capture, trace upload, issue open-or-comment, final fail. | `SMOKE_BASE_URL` default, `npx playwright test` command, label name, issue copy |

The Playwright specs themselves are **not** included; they are entirely
app-specific. What transfers is the harness and the selection rule (assert only
user-completable actions).

## Structure to keep, skin to drop
- **Keep (the idea):** the `deployment_status` trigger plus the success-and-Production
  guard, the three-trigger set, running against a real origin, the WebKit install,
  `PIPESTATUS` exit capture, label-deduped issue reporting, trace upload on
  failure, and the explicit final failing step.
- **Drop (regenerate natively):** the issue body copy, the label name and color,
  the base URL, the node version, and the specific list of actions the suite covers.

## Adaptation notes
- Replace both `https://example.com` defaults with your production origin.
- Confirm your Vercel project sends `deployment_status` to GitHub. It comes free
  with the standard Vercel GitHub integration; a deploy driven purely by the
  Vercel CLI may not emit it, in which case fall back to schedule plus dispatch.
- Check the `environment` string. It is `Production` on Vercel's integration but
  differs on other providers, and a wrong value silently means the job never runs.
  Verify by opening a real `deployment_status` payload rather than assuming.
- Install the browsers your device descriptors actually require. If you use any
  Apple device descriptor, you need WebKit.
- Point `npx playwright test` at your smoke project or tag, not the whole suite.
  This runs against production, so keep it read-only and fast.
- **Make sure the tests can actually fail.** A smoke suite that passes against a
  404 page is the most dangerous outcome here. Verify by pointing `base_url` at a
  dead origin once and confirming red.
- Keep the suite to actions, not appearance. Assertions on copy or layout will
  flake against production and get the whole check disabled.

## Provenance
- Origin file: `.github/workflows/smoke-money-path.yml` @ `origin/main`
  (captured 2026-08-31). Genericized: origin hostname.
- Related features: [[build-correctness-linters]], [[content-truth-gates]],
  [[github-actions-app-scheduler]], [[website-launch-gate]]
