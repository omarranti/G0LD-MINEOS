# iOS Spec Workflow

*Adapted from a proven "locked spec" workflow another product team ran as policy. This file translates the roles and artifacts to a spec-driven iOS setup where the product owner writes specs and a contractor or AI assist holds the keyboard.*

## Why this exists

The failure mode this workflow prevents: **mid-build amendments**. A feature scoped 30 days ago that ships on its original locked spec means the workflow is working. A "small" change made in chat to a build in flight means the workflow is broken and the spec author owes the build owner a re-lock.

This is not bureaucracy. It's a discipline that survives contractors, AI-assisted builds, time zones, and the temptation to "just tweak one thing."

## The five steps

| Step | Owner | Deliverable | Time-box |
|---|---|---|---|
| **01 · idea** | Product owner | One-sentence statement of intent under `.agents/ios-specs/_ideas/`. Who, what, why. | minutes |
| **02 · 1-page spec** | Product owner | Drafts the 1-page behavioral spec using the template below into `.agents/ios-specs/<feature-slug>.md`. | hours |
| **03 · screens** | Product owner or designer | One canonical screen reference per surface. Either a Figma frame with a version-stamped name, or a screenshot saved into `.agents/ios-specs/screens/<feature-slug>-v1.png`. | day |
| **04 · review and lock** | Backend reviewer + iOS reviewer + (domain reviewer if applicable) + product owner | Each reviewer signs off in the spec's review log with a timestamp. The product owner flips status to `locked`. | day |
| **05 · build** | Whoever holds the iOS keyboard (owner, contractor, or AI assist) | Implements against the locked spec. **No mid-build amendments.** If scope must change, return to step 02. | varies |

No skipping. No reordering. Step 02 cannot start until step 01 is written. Step 05 cannot start until status is `locked`.

## The 1-page spec template

Copy this into `.agents/ios-specs/<feature-slug>.md` for every feature. The product owner fills it before any pixels or Swift moves. **One page is the goal.** If it spills onto two, the scope is too big, split the feature.

```markdown
# <feature name>

**Status:** drafting | in-review | locked | shipped
**Owners:** spec=<name> · backend=<name> · ios=<name> · design=<name|self>
**Target ship date:** YYYY-MM-DD

---

## intent
One sentence. Who is this for, what does it let them do, why now.

## user behaviour
3-5 numbered steps describing what the user does, sees, feels. Behavioral language only. No implementation detail. (Example good: "tapping save adds the item to their list and animates a confirmation." Example bad: "calls POST /api/mobile/v1/saved with the item UUID.")

## surface
Which screen or screens. Where in existing iOS navigation (tab, push, modal, sheet). Trigger event (cold launch, tap from cell, push notification, deep link).

## data inputs
What the feature reads. One bullet per data source. Cite the endpoint in the DTO source of truth if applicable, or name the device source (HealthKit, Location, Push token).

## data outputs
What the feature writes. One bullet per write event. Cite the endpoint + DTO. Include analytics events (`<event_name>` per the tracking discipline).

## edge cases and empty states
- No data / empty state
- Offline (does the feature use cached data? show a banner? fall through to web?)
- Failure (auth expired, 429, 500)
- Product-wide modes (e.g. a calendar quiet mode that suppresses commerce CTAs)
- Permissions denied (if the surface needs HealthKit, Location, Notifications, Camera)

## success criteria
1-3 metrics that say the feature works. Quantitative if possible. Examples: "70% of users who view this screen tap the primary CTA within 30 seconds," "0 P0 bugs in the first 7 days post-ship," "App Review approves on first submission."

## explicitly out of scope
The things this feature does NOT do. Cuts ambiguity. (Example: "v1.0 does not include sharing outside the app. Add to v1.1 backlog.")

## web↔iOS parity
- Web equivalent: which `/route` if any
- iOS-only behavior: list anything that exists only on iOS
- Parity rule: if a behavior exists on web and iOS, the underlying data is the same, the rendering is platform-native

## App Review constraints
List anything that touches App Review surfaces:
- IAP / payments (if the app is an access-only client to a web product, name the guideline your model relies on)
- Permissions (HealthKit, Location, Push, Camera: purpose strings must be specific)
- Subscription disclosures (auto-renew language, restore purchases)
- External links to commerce (must fit a documented exemption)

## domain-sensitivity review
- Does this surface display content in the product's regulated or culturally sensitive territory (certifications, health claims, religious or community content, legal language)?
- If yes, this spec REQUIRES sign-off from a domain reviewer in the review log before step 05. AI cannot final-approve. Define the "when AI cannot final-approve" list in your brand canon.

## brand-canon cross-check
- Lexicon: any forbidden lexicon used? (run your canon check)
- Voice: any user-facing copy that breaks the product's voice or attribution rules?
- Trademark: correct casing and mark usage per the brand canon
- Locale/register: any locale-specific wording rules that apply to this market?

---

## review log

(append-only; reviewers add a row when signing off)

| timestamp | reviewer | role | verdict |
|---|---|---|---|
| YYYY-MM-DD HH:MM | <name> | backend | OK / NEEDS-WORK / BLOCKED |
| YYYY-MM-DD HH:MM | <name> | ios | OK / NEEDS-WORK / BLOCKED |
| YYYY-MM-DD HH:MM | <name> | domain-review | OK / NEEDS-WORK / BLOCKED (if applicable) |
| YYYY-MM-DD HH:MM | <owner> | LOCK | flips status from in-review → locked |
```

**The rule:** if you cannot fill one of these sections, the feature is not ready to spec. Write down the open question instead. The spec is allowed to return to the product owner before going to the build owner.

## The locked spec file (the only canonical artifact)

One markdown file per feature at `.agents/ios-specs/<feature-slug>.md`. Lives under git. This is the only canonical artifact. Everything else is reference.

**Required sections, in order:**

1. **Header block**: feature name, status, owners (spec/backend/ios/design), target ship date
2. **1-page spec**: text only, inline
3. **Screen reference**: single canonical Figma frame OR screenshot at `.agents/ios-specs/screens/<feature-slug>-v1.png`. Version number in the filename.
4. **API schema**: inline code block citing the DTO shape from the DTO source of truth, or the new endpoint
5. **Payments contract**: for paywall-class features only. (If the app is access-only on iOS, most specs will not need this.)
6. **Review log**: append-only timestamps
7. **Supplements**: any extra context lives below, labeled "reference only, not source of truth"

## What changes when the spec is locked

- Status flips to `locked`. **Only the product owner can flip it back to `drafting`.**
- Screen reference is renamed with the version number. No edits to that frame/file.
- The build owner builds against that reference and nothing else.
- If anyone iterates on the design post-lock, the new iteration becomes a v2 file. The locked v1 stays untouched until the product owner approves a re-lock.

## When to re-lock (the re-lock triggers)

Mid-build amendment is the failure mode this workflow exists to prevent. But specs do sometimes need to change. When they do, the change goes back to the start of the flow, not into the build.

| Trigger | What it looks like | Action |
|---|---|---|
| **Platform guideline risk surfaces** | App Review feedback, new HIG rule, IAP policy shift | Re-lock with the constraint baked in. Do not patch mid-build. |
| **Data shape changes** | The DTO source of truth needs a field added/renamed; new endpoint required | Backend reviewer + product owner revise the spec, re-lock, then resume build. |
| **Brand-canon decision lands** | The brand canon updates a rule that affects existing UI copy | Brand decisions get their own spec pass. They do not arrive as mid-build edits. |
| **User-facing bug discovered** | Production bug or App Review rejection | New spec, fresh lock, clean cycle. The original spec is marked `superseded by <new-feature-slug>`. |
| **Domain-sensitivity correction** | A domain reviewer flags a factual, framing, or register issue in sensitive content | The spec returns to step 02 with the correction documented in the review log. |

## The test

If a feature you scoped 30 days ago is still on its original locked spec and just shipped, the workflow is working.

If you find yourself making a "small" change in Slack or a chat to a build already in flight, the workflow is broken and you owe the build owner a re-lock.

## File layout

```
.agents/
├── ios-spec-template.md       (this file)
└── ios-specs/
    ├── _ideas/                (step 01: one-sentence intents, captured)
    ├── <feature-slug>.md      (steps 02-05: the locked spec lives here)
    ├── screens/
    │   └── <feature-slug>-v1.png  (step 03: canonical screen reference)
    └── _archive/              (specs for shipped features stay here for reference)
```

## Related files

Point these at your own repo's canon:

- your architecture doc: the platform decisions specs build on top of
- your endpoint-contracts doc: update it when a spec ships a new endpoint
- your DTO source of truth (e.g. `_lib/shapes.ts` in the web repo): **field-additive only after the App Store ship**
- your brand canon: voice rules applied to all UI copy in specs
- your personalization/state matrix: when each user-state register applies
- your UX checklist: pre-delivery checklist applies to iOS surfaces too
