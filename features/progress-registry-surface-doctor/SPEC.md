# Progress Registry Surface Doctor (catch the surfaces the console does not know exist)

> A hand-maintained registry of features to routes, plus an advisory doctor that
> finds every route on disk no feature claims, because CI can only ask "did the
> registry change in this PR" and never "is this surface in the registry at all".

<!-- GUIDING PRINCIPLE: capture the STRUCTURE, not the skin. The reusable value is
the idea, the data model, the logic, the contracts, the flow. -->

- **Slug:** `progress-registry-surface-doctor`
- **Tags:** `ci`, `drift-detection`, `registry`, `admin`, `internal-tooling`, `static-analysis`, `dead-instrumentation`, `meta-pattern`
- **Source project:** directory / marketplace web app
- **Stack:** TypeScript (tsx script, `node:fs`) + a plain TS registry module + optional Prisma for live checks
- **Reuse confidence:** adapt-the-shape (`surfaces.ts` is drop-in and pure; the doctor is wired to a specific registry shape and metric set)
- **Status in origin:** live, run as `npm run progress:doctor`

## Problem it solves
An internal console renders build status per feature from a hand-maintained
registry. The registry is only as good as people's discipline in updating it, so
CI was added to nag when a PR touched product code without touching the registry.

That check has a hole it cannot close by construction. It can ask whether
`registry.ts` moved in this PR. It cannot ask whether a surface exists in the
registry **at all**. A brand-new route with no feature row anywhere ships
completely invisible to the console, and nothing fires, because there was never a
diff to notice. The nag catches sloppy edits and misses entire missing features.

The doctor closes it from the other direction: walk the routes that actually
exist on disk and assert every one is either claimed by a feature or explicitly
declared as furniture.

## When to reach for this
- You maintain any hand-curated index of the codebase (a feature registry, a
  status page, a docs map, an ownership file) and want it to fail loudly when
  reality drifts past it.
- Your CI check is "did file X change", and you have noticed that only catches
  edits, never omissions.
- You have an internal dashboard whose completeness nobody can vouch for.
- You want to detect dead instrumentation: a subsystem marked shipped whose
  representative metric reads zero.

## How it works
- **Three findings from one set comparison.** Compare routes discovered on disk,
  routes claimed by features, and routes declared as furniture:
  - `uncovered` = on disk, claimed by nobody, not furniture. **The finding.**
  - `phantom` = claimed by a feature, absent from disk. A typo or a deleted route,
    and just as wrong, because it makes the registry look more complete than it is.
  - `staleFurniture` = declared furniture whose route is gone. Dead config.
- **An explicit escape hatch that is a statement, not a mute.** `SITE_FURNITURE`
  maps a route to a reason ("Legal", "Company page, no build lifecycle"). Adding
  an entry is a deliberate claim that the route has no build lifecycle worth
  tracking. Requiring a reason string is what stops it becoming a silencer.
- **Only real routes count.** The disk walk recurses looking for a `page.*` file
  before counting a directory, so helper folders and colocated components never
  appear as findings. Dynamic segments (`[slug]`) are skipped because they belong
  to their parent feature.
- **Duplicate claims are reported, not failed.** Two features can legitimately
  serve one route, but the usual cause is a copy-pasted row, so it is worth
  surfacing without blocking.
- **Structural checks come first and need no database:** duplicate feature ids,
  unparseable dates, future-dated timestamps, staleness thresholds.
- **Live checks find dead instrumentation.** For each vertical with at least one
  shipped feature, run one representative count. A shipped subsystem whose count
  is zero is either broken instrumentation or a wrong status. Both are worth a line.
- **Advisory by construction: always exits 0.** It reports and never blocks.

## Data model
No tables. Two hand-maintained TypeScript structures:

```ts
// The registry (not included here; app-specific shape)
type ProgressVertical = {
  name: string;
  metricKey?: VerticalMetricKey;      // which live count represents it
  features: {
    id: string;                        // unique across the whole registry
    name: string;
    web: "planned" | "in-flight" | "shipped";
    ios: "planned" | "in-flight" | "shipped";
    lastUpdated: string;               // ISO date, checked for sanity
    surfaces?: string[];               // route segments this feature owns
  }[];
};

// The escape hatch (included, in surfaces.ts)
SITE_FURNITURE: Record<string /* route segment */, string /* why untracked */>
```

## Key decisions & gotchas
- **"Did file X change" and "is X complete" are different questions, and CI can
  only ask the first.** This is the entry. A diff-based check can never see an
  omission, because an omission produces no diff. If you rely on one, you have a
  blind spot exactly the size of "things nobody thought about".
- **Report phantoms as loudly as uncovered routes.** A registry claiming routes
  that do not exist overstates its own coverage, which is the failure the whole
  tool exists to prevent.
- **The escape hatch must cost something.** A boolean ignore list gets used to
  silence findings. A required reason string makes each entry an assertion someone
  has to be willing to write down, and `staleFurniture` then garbage-collects it.
- **Keep the set logic in a pure module with the fs walk injected.** `surfaces.ts`
  takes `{ discovered, claimed, furniture }` as plain arrays and touches neither
  disk nor database, so every interesting branch is unit-testable. The doctor does
  the I/O. This split is why the logic has tests at all.
- **Advisory, not blocking, is a deliberate trade.** Making it a failing gate would
  get it disabled the first time it blocked an urgent fix. Exit 0 keeps it useful.
  The trade is that it only helps if someone runs it, which is why the origin also
  wires the registry into a PR trailer convention.
- **Depth-limit the recursion** (3 levels here), or a deep tree makes the walk slow
  enough that nobody runs it.
- **A zero live metric is ambiguous on purpose.** It means "shipped status is wrong"
  or "instrumentation is dead" and the doctor does not guess which. Both need a human.
- **Deliberately not handled:** auto-fixing the registry, inferring feature names
  from routes, and non-route surfaces (cron jobs, webhooks, background workers) which
  are equally capable of shipping untracked.

## Code layer

| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/surfaces.ts` | The whole pure core: `surfaceCoverage()` three-way set comparison, `claimedSurfaces()`, `duplicateClaims()`, and the `SITE_FURNITURE` declaration. No fs, no ORM. | none |
| `code/progress-doctor.ts` | The driver: env loading, structural checks, the `page.*`-aware disk walk, coverage reporting, staleness, and the live zero-metric check. | `dotenv`, `node:fs`, `../src/lib/progress/registry`, `../src/lib/db` (Prisma) |

The registry module itself (`src/lib/progress/registry.ts`) is **not** included;
its shape is app-specific. The type sketch above is enough to rebuild it.

## Structure to keep, skin to drop
- **Keep (the idea):** the three-way set comparison and its three finding types,
  the reason-carrying furniture map, the pure-core / injected-I/O split, the
  `page.*` check before counting a directory, dynamic-segment skipping, the
  advisory exit-0 contract, and the shipped-but-zero-metric check.
- **Drop (regenerate natively):** every `SITE_FURNITURE` entry (yours will differ
  entirely), the `representative` metric map and its Prisma models, the vertical
  and status vocabulary, the console output formatting, and the staleness
  thresholds.

## Adaptation notes
- Define your registry first. The doctor needs `features[].id`, `.lastUpdated`,
  a shipped-ish status field, and `.surfaces[]`. Everything else is optional.
- Point `discoverSurfaces()` at your route roots. The origin walks App Router
  group directories; a pages-router or non-Next project needs a different walk but
  the same "does this resolve to a real route" test.
- Replace the whole `representative` map with one cheap count per subsystem. Keep
  them cheap: this runs interactively.
- Add `"progress:doctor": "tsx scripts/progress-doctor.ts"` to package.json.
- Keep it advisory. If you make it blocking, expect it to be skipped.
- Extend it to non-route surfaces (crons, webhooks, queue consumers) if those can
  ship untracked in your app. The origin's version does not, which is a known gap.
- Pair it with a PR convention that flips registry status, otherwise the doctor
  finds drift nobody is obligated to fix.

## Provenance
- Origin file(s): `scripts/progress-lib/surfaces.ts`, `scripts/progress-doctor.ts`
  @ `e3c4698` (2026-08-30), "Catch the surfaces the console does not know exist"
- Related features: [[build-correctness-linters]], [[content-truth-gates]],
  [[spec-locked-feature-workflow]]
