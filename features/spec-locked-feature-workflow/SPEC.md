# Spec-Locked Feature Workflow

> A five-step lock workflow (idea, one-page spec, screens, review-and-lock, build) that makes mid-build amendments structurally impossible on contractor and AI-assisted feature builds.

<!-- Structure over skin: this is a meta-pattern. The artifact is a markdown
template plus a filesystem convention; the value is the lock semantics. -->

- **Slug:** `spec-locked-feature-workflow`
- **Tags:** `process, specs, workflow, contractors, ai-assisted, meta-pattern`
- **Source project:** iOS app (spec-driven contractor workflow)
- **Stack:** markdown + git filesystem convention (stack-agnostic; origin applied it to native Swift iOS)
- **Reuse confidence:** drop-in
- **Status in origin:** live in prod (governs every shipped iOS feature)

## Problem it solves
Features built by contractors, across time zones, or with AI assistance die by mid-build amendment: a "small" change requested in chat to a build already in flight. Nobody can later say what was agreed, the build owner absorbs unpaid scope, and the shipped thing matches neither the original intent nor the chat thread. This workflow makes the spec the only canonical artifact and makes changing it a formal, logged event.

## When to reach for this
- You are handing feature builds to a contractor, a remote teammate, or an AI coding session and need the deliverable pinned before the build starts.
- Scope keeps arriving through Slack/chat while builds are in flight, and post-hoc arguments about "what we agreed" are burning trust.
- Features touch review gates bigger than the team (App Review, compliance, culturally or legally sensitive content) where an undocumented tweak can cost a rejection.
- You want AI sessions to build against a stable contract instead of re-deriving intent from conversation history.

## How it works
- **Five steps, strictly ordered:** idea, 1-page spec, screens, review-and-lock, build. No skipping, no reordering. Step 02 cannot start until the one-sentence idea is written; step 05 cannot start until status is `locked`.
- **Ideas directory.** Step 01 is a one-sentence intent (who, what, why) captured as a file under `_ideas/`. Cheap to write, so nothing lives only in chat.
- **One-page spec, one file per feature.** `<feature-slug>.md` holds a behavioral spec: intent, user behaviour (no implementation language), surface, data inputs/outputs, edge cases, success criteria, explicit out-of-scope, platform-review constraints, and canon cross-checks. If it spills past one page, the feature is too big and gets split. If a section cannot be filled, the feature is not ready to spec.
- **Version-stamped screen reference.** One canonical Figma frame or screenshot per surface, version number in the filename. After lock it is never edited; a post-lock design iteration becomes a v2 file while locked v1 stays untouched.
- **Append-only review log.** Each reviewer (backend, platform, domain reviewer when content is sensitive) signs off with a timestamp and verdict inside the spec file. The owner's final row flips status `in-review` to `locked`. Only the product owner can flip it back.
- **Re-lock triggers, not mid-build edits.** Scope changes route back to step 02 through named triggers (platform guideline risk, data-shape change, brand-canon decision, user-facing bug, domain-sensitivity correction). A superseded spec is marked, never rewritten.
- **Shipped code back-references its spec.** Implementation files carry a doc comment pointing at `<feature-slug>.md`, so a future session lands on the contract before the code.

## Data model
Stateless / filesystem convention. The whole system is markdown under git:
```
.agents/
├── ios-spec-template.md           (the workflow + template, this pattern's code/)
└── ios-specs/
    ├── _ideas/                    (step 01 intents)
    ├── <feature-slug>.md          (the locked spec, one per feature)
    ├── screens/<feature-slug>-v1.png
    └── _archive/                  (shipped specs kept for reference)
```
Status lives as a field inside each spec (`drafting | in-review | locked | shipped`); the review log is an append-only markdown table.

## Key decisions & gotchas
- **The spec file is the only canonical artifact.** Figma, chat, and supplements are explicitly labeled reference-only. This single sentence resolves most "but you said" disputes.
- **One page is a forcing function, not a formatting rule.** Overflow means the scope is wrong. Splitting at spec time is cheap; splitting mid-build is not.
- **Behavioral language only in the user-behaviour section.** "Tapping save adds the item to their list" not "calls POST /saved". Keeps the spec reviewable by non-engineers and keeps implementation freedom with the builder.
- **Lock is a one-way door held by one person.** Reviewers can block; only the product owner can unlock. Prevents the quiet reviewer-to-builder side-channel amendment.
- **The re-lock triggers are enumerated.** Anything not on the list is not a reason to touch a locked spec mid-build. The origin added a domain-sensitivity trigger for its culturally sensitive content; add triggers for whatever review gates your product has.
- **The self-test is behavioral:** a feature scoped 30 days ago shipping on its original locked spec means the workflow works; a "small" change in chat to a build in flight means it is broken and the spec author owes the build owner a re-lock.
- **Deliberately not handled:** tooling enforcement (no CI check that status is `locked` before merge; the origin ran it as social contract), estimation, and sprint mechanics. It is a scoping discipline, not a project-management system.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/spec-template.md` | The full workflow doc: five-step table, copyable 1-page spec template, locked-file format, lock semantics, re-lock trigger table, file layout | none (markdown; repoint the Related files list at your own canon docs) |

## Structure to keep, skin to drop
- **Keep (the idea):** the five steps in strict order; the one-file-per-feature canonical artifact; the one-page limit; the append-only review log with a single lock owner; version-stamped immutable screen references; enumerated re-lock triggers; the code-to-spec back-reference convention; the 30-day self-test.
- **Drop (regenerate natively):** the iOS framing (directory names, App Review section, HealthKit/Location examples) if your platform differs; the specific reviewer roles (backend/ios/domain) in favor of your own gate list; the origin's canon cross-check items (lexicon, trademark casing, locale register), which should be rewritten against your product's brand rules; the referenced doc names (`_lib/shapes.ts`, personalization matrix), which are placeholders for your own source-of-truth pointers.

## Adaptation notes
- Copy `code/spec-template.md` into your repo (e.g. `.agents/spec-template.md`), create the `specs/`, `specs/_ideas/`, `specs/screens/`, `specs/_archive/` directories, and rename the `ios-` prefixes if the platform differs.
- Fill in the roles: who owns specs, who reviews backend, who reviews the platform surface, and whether you need a domain reviewer (regulated, medical, religious, or legal content). Delete the domain-review section only if you truly have no sensitive territory.
- Repoint the Related files list at your real canon: architecture doc, endpoint contracts, DTO source of truth, brand canon, UX checklist.
- Adopt the back-reference convention: every new feature's primary source files open with a doc comment citing the spec path. Enforce in code review.
- Optional hardening the origin skipped: a CI grep that blocks merge when the named spec's status is not `locked`.
- No runtime code, so nothing to restyle; the template prose itself should be edited into your team's voice.

## Provenance
- Origin file: `.agents/ios-spec-template.md` @ 2026-08-08 (iOS app, spec-driven contractor workflow; the workflow governs the repo's shipped features).
- Genericized for this library per its editorial convention: person and product names neutralized (product owner, build owner, the product), the origin's community-specific review gate generalized to a domain reviewer, product-mode examples generalized (its commerce-suppression mode appears here as "calendar quiet mode"), and repo-specific Related files turned into placeholders. The five steps, template sections, lock semantics, and re-lock triggers are verbatim.
- Related features: [[calendar-quiet-windows]] (the kind of product-wide mode the template's edge-case section forces every spec to address)
- Related memory: none

