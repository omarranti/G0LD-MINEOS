# GitHub Actions as the App's Scheduler (self-updating repo state)

> Run scheduled jobs that open PRs against your own repo from GitHub Actions
> rather than a hosted agent runner, because the runner cannot reach your private
> database and, critically, Vercel silently blocks production deploys whose merge
> is not attributed to a real team member.

<!-- GUIDING PRINCIPLE: capture the STRUCTURE, not the skin. The reusable value is
the idea, the data model, the logic, the contracts, the flow. -->

- **Slug:** `github-actions-app-scheduler`
- **Tags:** `github-actions`, `vercel`, `cron`, `automation`, `pat`, `deployment`, `self-updating`, `ci`
- **Source project:** directory / marketplace web app
- **Stack:** GitHub Actions (schedule + workflow_dispatch) + tsx scripts + a fine-grained PAT
- **Reuse confidence:** adapt-the-shape (the workflow skeleton and the PAT/identity handling transfer; the scripts they drive are app-specific)
- **Status in origin:** live, armed on weekly and monthly crons

## Problem it solves
An internal console reads state committed in the repo (a registry, snapshots,
targets). Keeping it true means something has to periodically recompute that
state and commit it. Three plausible homes for that job, two of which fail:

- **A hosted/cloud agent routine** cannot reach the private database or the
  hosting provider's API, and cannot hold the repo owner's identity.
- **A provider cron hitting an app route** can compute, but cannot commit to the
  repo, so derived state never lands in version control.
- **GitHub Actions** can do both, and already has the repo write scope.

The non-obvious blocker is identity. A workflow using the default `GITHUB_TOKEN`
opens PRs owned by `github-actions[bot]`. **Vercel silently blocks production
deploys whose merge is not attributed to a team member**, so the bot's PR merges
and then simply never deploys, with no error anywhere obvious. A fine-grained PAT
belonging to a real member makes the PR owner deterministic and the deploy fire.

## When to reach for this
- You have derived state that lives in the repo and must be refreshed on a schedule.
- You want an automation to open a PR rather than push to main, so a human still reviews.
- You are moving a scheduled job off a hosted agent runner because it cannot reach
  your infrastructure.
- Your bot-authored PRs merge but mysteriously do not deploy. That is this bug.

## How it works
- **A preflight step hard-fails on missing secrets, with the reason.** The first
  step checks the PAT (and any other required secret) and emits a `::error::`
  naming the consequence and the fix. Without it the failure surfaces much later
  as a deploy that silently did not happen.
- **`actions/checkout` is given the PAT**, not the default token, so every commit
  and PR the job creates is attributed to a real member.
- **A `concurrency` group shared across every job in the family**, with
  `cancel-in-progress: false`. The weekly and monthly jobs both write repo state,
  so they must queue rather than race, and neither may be cancelled mid-write.
- **The workflow is a thin driver.** All judgment lives in a tested script; the
  YAML installs, runs one command, and reports. Any safety fence (a path
  whitelist, an evidence rule) is enforced **in the script**, where it can be unit
  tested, not in the YAML where it cannot.
- **The script owns normal failure; the workflow only covers infrastructure death.**
  The script opens its own labelled issues for ambiguity and expected failure. The
  final `if: failure()` step exists only for the case where the job died before
  the script could speak.
- **The failure notifier degrades gracefully.**
  `secrets.PAT != '' && secrets.PAT || github.token` means the "we failed" issue
  still gets filed even when the missing PAT was the failure.
- **Credentials stay out of CI where possible.** The monthly job pulls its data
  from a PIN-gated endpoint using a signed admin cookie, so no database URL is
  stored in GitHub at all.
- **Every job also takes `workflow_dispatch`**, with inputs where re-running a
  specific period makes sense, so a missed run can be replayed by hand.

## Data model
Stateless in CI. Repo secrets:

| Secret | Purpose | Consequence if missing |
|---|---|---|
| `PROGRESS_UPKEEP_PAT` | Fine-grained PAT of a real team member; owns checkout, commits, PRs | PRs are bot-owned and **the production deploy silently does not run** |
| `ADMIN_PIN_COOKIE` | Signed admin cookie for the data endpoint | Monthly snapshot cannot read its source |

Permissions requested: `contents: write`, `pull-requests: write`, `issues: write`.

## Key decisions & gotchas
- **Bot-authored merges can silently not deploy.** This is the entry, and the
  symptom is maddening: the PR merges, the check is green, and production is
  simply never updated. A PAT owned by a real member is the fix. Budget for its
  expiry: a fine-grained PAT is time-limited, and when it lapses the automation
  stops in exactly the same quiet way.
- **Fail loudly at the top on a missing secret.** A workflow that runs 40 steps
  and then produces an undeployable PR is far worse than one that refuses to start.
- **Put the fence in the script, not the YAML.** A whitelist expressed in shell
  inside a workflow cannot be unit tested and will drift from the logic it guards.
- **`cancel-in-progress: false` on anything that writes.** The default cancels the
  in-flight run, which for a job mid-commit means a half-written state.
- **Share one concurrency group across the whole job family.** Two workflows on
  different schedules that touch the same files will eventually overlap.
- **Scheduled runs drift and get disabled.** GitHub delays `schedule` under load,
  and disables cron on repos with no activity for 60 days. Anything that must
  happen exactly on time needs a different home, and anything important needs a
  liveness check.
- **`schedule` only runs from the default branch.** Editing the cron on a feature
  branch does nothing until it merges, which reliably wastes an afternoon.
- **Deliberately not handled:** auto-merging the PR (a human reviews on purpose),
  retries, and any secret rotation. The PAT is armed by a local script.

## Code layer

| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/scheduled-upkeep-weekly.yml` | Weekly driver: PAT preflight, PAT-authenticated checkout, run the upkeep script, file an issue on infrastructure failure. | `PROGRESS_UPKEEP_PAT`, `scripts/progress-upkeep.ts`, label name |
| `code/scheduled-snapshot-monthly.yml` | Monthly driver: same skeleton plus a second required secret and a `workflow_dispatch` input for replaying a specific month. | `ADMIN_PIN_COOKIE`, `scripts/progress-snapshot.ts` |

The scripts they invoke are **not** included; they are the app-specific half. See
[[progress-registry-surface-doctor]] for the registry these jobs maintain.

## Structure to keep, skin to drop
- **Keep (the idea):** the PAT-for-deploy-attribution rule, the fail-loud secret
  preflight, PAT-authenticated checkout, the shared non-cancelling concurrency
  group, thin-driver / fenced-script separation, script-owns-normal-failure, the
  degrading token fallback in the notifier, credentials-via-gated-endpoint, and
  `workflow_dispatch` with a replay input.
- **Drop (regenerate natively):** the cron expressions, secret names, label names
  and colors, node version, script paths, and every string of issue copy.

## Adaptation notes
- Mint a **fine-grained** PAT owned by a real team member, scoped to this repo with
  contents + pull-requests write. Store it as a secret and note its expiry
  somewhere you will actually see it.
- Verify the attribution end to end before trusting the automation: let it open a
  PR, merge it, and confirm a production deploy actually ran. Do not assume.
- Replace the script invocations. Keep the rule that judgment and fences live in
  the script.
- Reuse one concurrency group name across every workflow touching the same state.
- Pick cron times in UTC and off the hour, since the top of the hour is the most
  contended and most delayed slot.
- If a job must read private data, prefer a gated endpoint over putting a database
  URL in CI secrets.
- Add a liveness check. A scheduled job that silently stops is the failure mode
  this whole family is prone to, including via PAT expiry and the 60-day
  inactivity disable.

## Provenance
- Origin file(s): `.github/workflows/progress-upkeep-weekly.yml`,
  `.github/workflows/progress-snapshot-monthly.yml` @ `origin/main`
  (captured 2026-08-31). Genericized: owner identity, secret name, console path.
- Related features: [[progress-registry-surface-doctor]],
  [[post-deploy-production-smoke]], [[vercel-platform-config]]
