# <Feature name>

> One-sentence description of what this feature does and why it exists.

<!-- GUIDING PRINCIPLE: capture the STRUCTURE, not the skin. The reusable value is
the idea, the data model, the logic, the contracts, the flow. The visuals are
disposable and should be regenerated to fit the destination project. Write the SPEC
so a future session can rebuild the IDEA and style it natively. -->


- **Slug:** `<kebab-case-folder-name>`
- **Tags:** `<gamification | commerce | auth | seo | onboarding | growth | ...>`
- **Source project:** <Kosher Connect web | Kosher Connect iOS | Therma | ...>
- **Stack:** <Next.js 15 App Router + Prisma + Postgres | Expo / React Native | ...>
- **Reuse confidence:** <drop-in | adapt-the-shape | reference-only>
- **Status in origin:** <live in prod | on branch | prototype>

## Problem it solves
What user or business problem this addresses. Keep it concrete.

## When to reach for this
The signals that tell a future session "this is the pattern you want." List the
situations where copying this beats writing it fresh.

## How it works
The mechanism in 3-6 bullets. Enough that someone can rebuild it in a different
stack without reading every line. Name the non-obvious decisions.

## Data model
Tables / fields / cookies / flags this touches. Paste the relevant schema slice.
If none, say "stateless."

## Key decisions & gotchas
The things that took thought the first time and would be re-litigated otherwise:
- Trade-offs made and why.
- Edge cases handled (and deliberately NOT handled).
- Failure modes and the fallback behavior.

## Code layer
What's in `code/`, file by file, with what each does and what it depends on.

| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/foo.ts` | ... | `@/lib/db`, `@/config/x` |

## Structure to keep, skin to drop
Separate the two explicitly so a future session knows what is load-bearing.
- **Keep (the idea):** the data model, the state machine, the contracts, the
  algorithm, the flow. This is why the entry exists.
- **Drop (regenerate natively):** layout, colors, typography, component library,
  copy, spacing. Name the project-specific styling here so it gets rebuilt to match
  the destination, never pasted in as-is.

## Adaptation notes
What a future session must change to drop this into a new project: import paths,
env vars, schema migrations, API keys. Restyle from scratch to match the destination
project (see Structure to keep, skin to drop).

## Provenance
- Origin file(s): `<repo>/<path>` @ `<commit or date>`
- Related features: [[other-slug]]
- Related memory: `<memory file if any>`
