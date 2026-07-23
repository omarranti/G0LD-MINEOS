# Schema-Driven Profile Questionnaire + Mapping to an AI-Grounding Shape

> A declarative question schema renders the entire onboarding/profile form,
> persists answers section by section, and a pure mapping layer turns those
> free-text answers into the normalized, source-attributed shape the AI uses
> to ground every downstream surface.

<!-- GUIDING PRINCIPLE: capture the STRUCTURE, not the skin. -->

- **Slug:** `profile-questionnaire`
- **Tags:** `onboarding`, `profile`, `ai-grounding`, `schema-driven`, `personalization`
- **Source project:** Kiiid (web, `apps/web`)
- **Stack:** Next.js 15 App Router + React Server Components + server actions + Neon Postgres (raw SQL, jsonb)
- **Reuse confidence:** adapt-the-shape (the schema + render-from-schema + mapping pattern is the reusable core; the questions, signals, and next-step generators are tenant-specific and get rewritten)
- **Status in origin:** live in prod

## Problem it solves
Any product that personalizes itself off a user profile needs three things that
usually drift apart: the questions, the storage, and whatever shape the
personalization engine actually consumes. When those are hand-wired separately,
adding a question means touching the form, the table, the type, and the prompt
builder in four places, and they fall out of sync. This feature collapses them
into one declarative schema that drives the UI, names the DB columns, and tags
which downstream "verticals" each answer feeds, plus a single pure mapping layer
that transforms raw answers into the grounding shape the AI reads.

## When to reach for this
- You have an onboarding or profile form whose answers feed an LLM (system
  prompt grounding, recommendations, "next steps") and you want the questions
  and the prompt shape to never diverge.
- You want one config to be the single edit point: reorder, relabel, or add a
  question without hunting through render code, mutations, and prompt builders.
- You want partial completion to be useful, save per section, and have the AI
  start personalizing off whatever subset exists.
- You need a deterministic layer between raw answers and the model so the AI
  gets normalized facts (numbers, booleans, lists) plus the original wording,
  not just a blob of text.

## How it works
- **One declarative schema** (`profile-questionnaire.ts`) is the source of
  truth: an array of section configs, each holding an array of question configs.
  A question carries `field` (must match a DB column), `label`, optional
  `helper`, an input `type` (`textarea` / `role-radio`), and a `verticals[]` tag
  listing which downstream surfaces the answer feeds.
- **The UI renders straight off the schema.** `page.tsx` maps sections to cards;
  `QuestionnaireSection.tsx` maps a section's questions to inputs and switches on
  `q.type`. No question is hardcoded in JSX, so a content edit is a one-file
  change. Each section is its own `<form>` with its own save button.
- **Persistence is one row per user, upserted per section.** `mutations.ts` is a
  server action: it looks up the section config, reads only that section's fields
  from `FormData`, and builds a dynamic upsert. The key move is `section_completed`
  jsonb merged with `|| patch::jsonb` so saving one section never clears the
  others, and fields outside the current section are left out of the column list
  so they are preserved untouched. Empty string clears a field to null.
- **The mapping layer (`profile-mapping.ts`) is the reusable contract** between
  the answer row and the AI. It does three pure, I/O-free jobs:
  1. **Derive signals**: parse free text into normalized values (dollar amounts,
     1-10 scales, follower counts, name lists, booleans via keyword matching).
     Every signal is nullable so a partial profile degrades gracefully.
  2. **Slice per vertical**: using the `verticals[]` tags (plus precomputed
     reverse indexes `FIELDS_BY_VERTICAL` / `SECTIONS_BY_VERTICAL`), return only
     the Q&A pairs that feed a given surface, then render them to a prompt string
     that keeps the question wording, not just the answer.
  3. **Generate next steps**: one generator per vertical reads signals + raw
     answers and emits stable-id, source-attributed `NextStep` objects sorted by
     priority.
- **The grounding block** (`profileContextBlockForVertical`) is what the LLM
  reads: a "Derived facts" section (structured) followed by "Source answers"
  (the user's own words). Structured facts plus original framing, for one
  vertical at a time, so the prompt only loads the relevant slice.

## Data model
One row per user in `public.profile_questionnaire`, primary key `user_id`. One
nullable text column per question field (names match the schema's `field` keys),
plus a jsonb completion tracker and timestamps.

```ts
type ProfileQuestionnaire = {
  user_id: string;
  // one nullable column per question, e.g.
  identity_party_answer: string | null;
  identity_role_type: "talent" | "business" | "both" | null; // the role-radio
  // ... ~36 more answer columns grouped by section ...
  // section save tracking: section key -> ISO timestamp of last save
  section_completed: Record<string, string>; // jsonb
  created_at: string;
  updated_at: string;
};
```

Key schema facts:
- `section_completed` is jsonb, merged on each save with `coalesce(..., '{}') || patch::jsonb`. Completion = count of keys present.
- Most answers are free text. One field (`identity_role_type`) is a constrained enum rendered as radios.
- The schema config's `field` names, the DB columns, and the type keys must stay in lockstep. Adding a question = add to schema + add column (migration) + add to the type, together.

## Key decisions & gotchas
- **Schema is the single edit point.** The header comment is explicit: edit the
  config to change wording; the page renders off it. The three-place coupling
  (config field / DB column / type) is the deliberate cost of that single point.
- **Per-section save, not a 36-question commit.** Each section is its own form
  and its own upsert. The jsonb merge is what makes this safe: writing section N
  must not blank sections 1..N-1. Fields outside the section are simply absent
  from the INSERT column list, so the existing values survive the upsert.
- **The mapping layer is pure on purpose.** No DB, no LLM calls. The endpoint and
  the prompt builder both read from it, so the AI-grounding shape can't diverge
  per caller, and it is trivially testable. Signals are all nullable so a
  half-filled profile never invents zeros.
- **No hard gate.** The user can skip the questionnaire forever; the dashboard
  runs on provisional context and sharpens as sections get saved. Personalization
  is framed as leverage, not friction.
- **Verticals tags are the routing primitive.** Both per-question and
  per-section tags exist; the slice includes a field if either its own tag or its
  parent section's tag matches. Reverse indexes are computed once at module load.
- **Free-text parsing is heuristic and tenant-specific.** Dollar/scale/follower
  regexes and the keyword lists for boolean signals (e.g. "no savings" -> zero
  runway) are tuned to this user's actual phrasings. They are illustrative of the
  pattern, not a general NLP layer. Re-author for a new domain.
- **The dynamic SQL uses the positional `sql(text, params)` form**, not the
  tagged-template form, because the column list is built at runtime from the
  section config. (Mind SQL-injection: here columns come from a trusted config,
  never user input.)
- **Demo-mode fallback:** if no DB client is configured, the action returns an
  "ok" stub so the UI works offline. Origin note flags this previously masked a
  no-persist bug.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/profile-questionnaire.ts` | The declarative schema: section + question configs, `verticals` tags, and the precomputed reverse indexes (`QUESTIONS_BY_FIELD`, `FIELDS_BY_VERTICAL`, `SECTIONS_BY_VERTICAL`). The source of truth. | `@/lib/database` (types only) |
| `code/profile-mapping.ts` | Pure mapping: `deriveSignals` (text -> normalized signals), `profileSliceForVertical` + `profileSliceToString` (answers -> per-vertical Q&A bundle), `nextStepsForVertical` (signals -> next steps), `profileContextBlockForVertical` (the LLM grounding block). | `@/content/profile-questionnaire`, `@/lib/database` (types) |
| `code/page.tsx` | RSC that loads the row and renders one card per section straight off the schema, with a progress meter. | `@/lib/repo`, `@/lib/database`, dashboard UI components |
| `code/QuestionnaireSection.tsx` | Client form: maps a section's questions to inputs, switches on `q.type`, binds the server action to the section key, shows save state + last-saved stamp. | `useActionState`, `@/app/(dashboard)/profile/mutations`, `@/lib/database` |
| `code/mutations.ts` | Server action: section-scoped dynamic upsert with the `section_completed` jsonb merge. | `@/lib/neon` (raw SQL client), `@/lib/database` |

## Structure to keep, skin to drop
- **Keep (the idea):**
  - The **declarative question/section schema shape** (`field` + `label` +
    `type` + `verticals[]`, grouped into sections) as the single source of truth.
  - The **render-from-schema** approach: page and section components iterate the
    config and switch on input type, never hardcode questions in markup.
  - The **per-section upsert with jsonb completion merge** so partial saves are
    safe and non-destructive.
  - The **answer -> signals -> per-vertical slice -> grounding block** transform.
    This pure mapping is the load-bearing contract between the form and the AI:
    normalized facts plus original wording, sliced to one downstream surface.
  - The **reverse-index precomputation** and **stable-id, source-attributed**
    output objects.
- **Drop (regenerate natively):**
  - `QuestionnaireSection.tsx`'s specific styling: the Tailwind classes, the
    `text-[0.85rem]` / `bg-bg-raised` / `emerald` token names, the radio chip
    look, the last-saved stamp formatting.
  - `page.tsx`'s card layout, copy ("Why this exists"), progress-bar visuals.
  - The actual **question wording**, **section names** (Identity / Meridian / etc.),
    and the **vertical names** (these are one specific user's life domains).
  - The **signal parsers and next-step generators' content**: dollar regexes,
    keyword blocklists, and every hardcoded recommendation string are tuned to
    this tenant and must be re-authored.

## Adaptation notes
- Define your own sections, questions, and `verticals` for the destination
  product. Add a DB column per `field`, mirror it in the row type, keep all three
  in lockstep.
- Swap `@/lib/neon` for your DB client. If you use an ORM, the upsert becomes an
  `upsert` call but keep the jsonb-merge-on-`section_completed` semantics (or an
  equivalent per-section completion record).
- Rewrite `deriveSignals`, the parsers, and the per-vertical generators for your
  domain. Keep the contract: pure functions, nullable signals, source-attributed
  outputs, one grounding-block builder the prompt layer calls.
- Wire `profileContextBlockForVertical` into your system-prompt builder, passing
  the current surface's vertical so only the relevant slice loads.
- Restyle the form and page from scratch to match the destination (see Structure
  to keep, skin to drop).

## Provenance
- Origin files (`Loft/apps/web/src/`) @ `5a1adfb`:
  - `content/profile-questionnaire.ts` (schema)
  - `lib/profile-mapping.ts` (answer -> AI-grounding mapping)
  - `app/(dashboard)/profile/page.tsx` (render-from-schema)
  - `app/(dashboard)/profile/mutations.ts` (per-section upsert)
  - `components/dashboard/QuestionnaireSection.tsx` (schema-driven form)
- Related types: `lib/database.ts` (`ProfileQuestionnaire`, `ProfileSectionKey`, `PROFILE_SECTION_ORDER`)
- Pairs with: `/api/profile/next-steps` endpoint and the Smart Tool prompt builder in `lib/claude.ts` (both read from `profile-mapping.ts`)
