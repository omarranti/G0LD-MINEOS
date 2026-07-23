# Profile Next-Steps Engine

> A deterministic layer that turns a stored questionnaire into normalized signals and concrete, source-attributed "next steps" for every surface of an app, served through one API shape that each surface slices.

- **Slug:** `profile-next-steps-engine`
- **Tags:** `personalization, onboarding, profile, ai-context, derived-signals`
- **Source project:** KIID (Jordan's personal-OS dashboard, `Loft`)
- **Stack:** Next.js 15 App Router + TypeScript (pure functions, no I/O in the engine)
- **Reuse confidence:** adapt-the-shape
- **Status in origin:** live in the dashboard (demo-mode backend)

## Problem it solves
A profile questionnaire is dead weight unless something reads it. This is the
piece that makes onboarding answers *do* work: it converts free-text answers into
typed signals, then turns those signals into a prioritized to-do list per area of
the product. The same derivation also feeds the LLM prompt builder, so the model
and the UI always agree on what the user said and what they should do next.

## When to reach for this
- You collect a structured onboarding/profile questionnaire (see
  [[profile-questionnaire]]) and want it to drive the rest of the app, not just sit
  in a row.
- You have several product surfaces (goals, finances, network, etc.) that each
  need *their slice* of the profile plus tailored recommendations, and you want one
  contract instead of bespoke logic per page.
- You feed an LLM with user context and need the structured facts and the user's
  own words in the same block, derived the same way the UI derives them. Pairs with
  [[smart-chat-over-data]].
- You want recommendations to be explainable: every step cites the answer that
  motivated it.

## How it works
- **Three pure jobs, one file.** (1) `deriveSignals(profile)` parses free-text
  answers into a flat `ProfileSignals` object (numbers, booleans, lists). (2)
  `profileSliceForVertical` cuts the questionnaire into a per-area bundle using
  `verticals` tags on each question. (3) `nextStepsForVertical` runs that area's
  generator over the signals to emit `NextStep[]`.
- **Generators are a registry.** `GENERATORS: Record<Vertical, Generator>` maps each
  product area to a `(profile, signals) => NextStep[]` function. Adding an area is
  adding one entry. Each generator is a list of `if (signal) push(step(...))` rules.
- **Steps are diff-able and attributed.** `step()` builds a `NextStep` with a stable
  `id` (`<vertical>-<slug>`), a `why` line tying back to the answer, the
  `source_fields` that informed it, and a `must|should|could` priority. Reruns are
  diffable because ids are stable.
- **Parsers fail to null, never to zero.** Every free-text parser returns `null` on a
  miss so signals stay honest about missing data; downstream null-checks before use.
  Generators only fire rules whose signals are present, so a half-filled
  questionnaire degrades gracefully.
- **One endpoint, two modes.** `GET /api/profile/next-steps` returns either a single
  vertical (`?vertical=goals`) or the full grouped map. `?include=signals` and
  `?include=context` opt into the derived signal object and the raw Q&A slice. Every
  vertical reads the same response shape.
- **LLM-ready context.** `profileContextBlockForVertical` renders a markdown block
  with derived facts first, then the user's source answers, for prompt injection.

## Data model
Reads one `ProfileQuestionnaire` row (one column per question field, all nullable).
The engine itself is stateless and pure: no DB, no Claude calls. Output types:

```ts
type ProfileSignals = { /* ~35 nullable derived fields, grouped by area */ };
type NextStep = {
  id: string;                 // `<vertical>-<slug>`, stable for diffing
  vertical: DashboardVertical;
  title: string;
  why: string;                // tie-back to the motivating answer
  source_fields: QuestionField[];
  priority: "must" | "should" | "could";
  target_metric?: string;     // optional concrete done-condition
};
type ProfileSliceEntry = { /* question + the user's answer */ };
```

The vertical taxonomy (`ALL_VERTICALS`) and the question→field→vertical tags live in
the companion content module `@/content/profile-questionnaire`.

## Key decisions & gotchas
- **Determinism on purpose.** The mapping is pure and rule-based, not an LLM call, so
  the same answers always produce the same steps. The LLM consumes this layer; it
  does not replace it. This keeps recommendations auditable and free.
- **Null over zero.** Parsers return `null` on a miss. Inventing `0` for an unparsed
  dollar amount would silently fabricate a "zero runway" signal. The whole signal
  object is nullable for this reason.
- **Number parsing is heuristic.** `parseFirstDollarAmount` handles `$1,234`, `1.5k`,
  `2m` forms and falls back to the first bare number > 100 to skip "rate this 1-10"
  answers. Reused for earnings ranges, burn, debt, stability floor. Re-check the
  regexes against your own answer phrasing.
- **`answerMentions` keyword lists are content, not logic.** Many booleans
  (`needsFirstNonSalaryDollar`, `wantsOnCamera`, `personalBrandDormant`) are derived
  by matching hard-coded phrase lists pulled from Jordan's actual answers ("only really
  djing", "hunker night"). These are the single most app-specific thing here and must
  be rewritten for a new user/domain.
- **Empty arrays, never null, from the public functions.** `nextStepsForVertical`
  and `nextStepsForAllVerticals` always return a populated shape so the UI renders
  stable. `deriveSignals(null)` returns `EMPTY_SIGNALS`.
- **Steps sort by priority** (`must` < `should` < `could`) before returning.
- **Voice rule baked in:** no em dashes in any user-facing string (matches
  [[feedback_no_em_dashes]]). Keep that if you reuse the copy.

## Code layer

| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/profile-mapping.ts` | The whole engine: parsers, `deriveSignals`, the per-vertical generator registry, `nextStepsFor*`, slice + prompt-context helpers, `ALL_VERTICALS`, `isDashboardVertical`. Pure, no I/O. | `@/content/profile-questionnaire` (question/field/vertical taxonomy, see [[profile-questionnaire]]), `@/lib/database` (`ProfileQuestionnaire`, `ProfileRoleType`, `ActionPriority` types) |
| `code/next-steps.route.ts` | `GET /api/profile/next-steps`. Auth-gates, loads the profile row, branches single-vertical vs all-verticals, honors `include=signals|context`. | `@/lib/auth` (`isAuthenticated`), `@/lib/repo` (`getProfileQuestionnaire`, see [[neon-data-repo-layer]]) |

## Structure to keep, skin to drop
- **Keep (the idea):** the three-stage pipeline (parse → signals → per-vertical
  generators), the `NextStep` shape with stable ids + `why` + `source_fields` +
  priority, the generator-registry pattern (one entry per product area), the
  null-honest parsing discipline, and the one-endpoint/two-mode API contract with
  `include` opt-ins. This is why the entry exists.
- **Drop (regenerate for the new app):** every keyword list in `answerMentions`
  calls, every hard-coded step `title`/`why` string, the `DashboardVertical`
  taxonomy itself, and the specific question fields (`money_stable_min`,
  `network_top_five`, `creative_*`, `wme_*`, all Jordan-specific). The dollar/scale
  parsers are reusable but tune the regexes to your answer phrasing. There is no UI
  in this feature; the consuming pages style themselves.

## Adaptation notes
- Define your own questionnaire taxonomy first (fork [[profile-questionnaire]]):
  the `DashboardVertical` union, the `QuestionField` union, and the
  `FIELDS_BY_VERTICAL` / `SECTIONS_BY_VERTICAL` maps the engine imports.
- Replace `ProfileSignals` fields and the body of `deriveSignals` with signals that
  matter for your domain. Rewrite the `answerMentions` keyword lists against your
  real answers, not Jordan's.
- Rewrite each generator's rules and copy. Keep the `step(...)` helper as-is; it just
  enforces the `NextStep` shape.
- Swap `getProfileQuestionnaire` (`@/lib/repo`) for your data access, and
  `isAuthenticated` (`@/lib/auth`) for your auth. In origin this runs in demo mode
  reading a fixture; wire to your real store.
- Optional but high-value: reuse `profileContextBlockForVertical` to feed your LLM
  prompt builder so the model sees the same derived facts the UI does.

## Provenance
- Origin files (`~/Documents/GitHub/Loft` @ `5a1adfb`):
  - `apps/web/src/lib/profile-mapping.ts`
  - `apps/web/src/app/api/profile/next-steps/route.ts`
- Related features: [[profile-questionnaire]], [[neon-data-repo-layer]], [[smart-chat-over-data]], [[ai-insights-engine]], [[action-items-queue]]
- Related memory: `project_feature_library`
