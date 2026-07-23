# Mood Ring Check-in Card (web)

> A 60-second conversational mood pulse rendered as an in-flow card on the homepage: four taps walk a visitor through identity, behavior, and intent, then mirror their answer back and drop a deep-linked App Store CTA. The animated Mood Halo lives in the iOS app; this is its web manifestation and acquisition surface.

- **Slug:** `mood-ring-checkin-card`
- **Tags:** `onboarding`, `engagement`, `conversion`
- **Source project:** Therma
- **Stack:** Next.js 15 App Router + React client component (styles inline + `styled-jsx global`)
- **Reuse confidence:** adapt-the-shape (the state machine and analytics scaffold are reusable; every chip label, mirror line, color, and font is Therma brand copy you must rewrite)
- **Status in origin:** live in prod

## Problem it solves
A static "download our app" hero asks for a commitment before the visitor has felt anything. This card replaces that with a tiny self-qualifying conversation. The visitor answers four lightweight questions, the card reflects their answer back in the product's own voice ("that gap has a name..."), and only then does the CTA appear, now personalized to the persona they self-selected. It is both an onboarding rehearsal (this is what the app's daily check-in feels like) and a conversion funnel that captures persona signal for ad attribution.

## When to reach for this
- You want a homepage interaction that demonstrates the product's core loop instead of describing it.
- Your conversion goal is an app install (or any single external CTA) and you want persona signal attached to the click.
- You want full funnel analytics (open, per-step view, per-step answer, CTA tap) on a stateless widget with no backend.
- You like the "ask, then mirror, then ask for the action" structure and want the scaffold, not the copy.

## How it works
- A five-state machine (`identity -> behavior -> specificity -> mirror -> cta`) drives the whole card. Three of the states present a fixed list of chips; picking one appends the choice plus the next bot question to a growing `entries` transcript and advances the step.
- The transcript is the UI. Each entry is a typed record (`bot` | `pick` | `rule`) rendered into a chat-like column with `aria-live="polite"`, so the card reads like a slow conversation rather than a form.
- After the third answer it looks up a two-line "mirror" keyed by the persona chosen in step one (`MIRROR[identity]`), renders an animated hairline rule, then the two reflection lines, and flips to the `cta` step. The mirror is the emotional payoff; the persona picked first determines what gets said back.
- The CTA is an App Store deep link built per-render from the selected identity: `appStoreHref` clones `APP_STORE_URL` and sets `pt` / `ct=chat_v3_<identity>` / `mt` query params so installs are attributable to the persona path.
- Four analytics events fire across the flow: `chat_opened` (once, guarded by a ref), `chat_step_view`, `chat_step_answer`, and `chat_cta_tap` (carrying all three answers). The CTA also best-effort fires a Meta Pixel `Lead` event if `window.fbq` exists.
- `start over` resets all state including the `startedRef` open guard, so a restart re-counts as a fresh `chat_opened`.

## Data model
Stateless. No persistence, no cookies, no flags. All state is React `useState` in the component and dies on unmount. The only thing leaving the browser is analytics events (`trackEvent`) and the optional Meta Pixel call. Persona signal travels out only as the `ct` query param on the outbound App Store URL.

## Key decisions & gotchas
- **`chat_opened` fires on first answer, not on render.** `fireStart()` is called inside `pickIdentity` and guarded by `startedRef`, so a scroll-past without interaction is not counted as an open. This is deliberate: open = engaged, not impression.
- **The mirror is keyed only on step one (`identity`).** Behavior and specificity answers are collected and shipped in analytics but do NOT change the reflection copy. If `identity` is somehow null it falls back to the `other` mirror. Steps two and three exist to deepen commitment and enrich attribution, not to branch the message.
- **Entry ids use `Date.now()`.** Fine for append-only single-user interaction; two picks in the same millisecond would collide on React keys. Not a problem at human tap speed, worth knowing if you automate it.
- **CTA href is memoized on `identity`**, so it is the value at the moment the mirror rendered. Behavior/specificity changes after that point would not be reflected in the URL (they cannot change post-mirror anyway, since the chips are gone).
- **Meta Pixel call is wrapped in try/catch and a typeof-window guard** and never blocks navigation. If `fbq` is absent the lead event is silently skipped; the install still happens.
- **Accessibility is built in, not bolted on:** `aria-live` transcript, `aria-label` on the section, `aria-hidden` on decorative rules/carets, `:focus-visible` gold ring on chips and CTA, and a full `prefers-reduced-motion` block that kills every `hqc-*` animation.
- **All styling is inline + one `styled-jsx global` block.** No Tailwind classes on the card itself (unlike the rest of the site). It carries its own color tokens object `C` that aliases CSS theme variables plus two hardcoded brand values (`gold #C8A96E`, `goldRing`).

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/home-quiz-card.tsx` | The actual feature. Five-state conversational check-in card, persona-keyed mirror, attributed App Store CTA, full funnel analytics. | `../../lib/analytics` (`trackEvent`), `../../lib/links` (`APP_STORE_URL`), `../shared/scroll-reveal` (`ScrollReveal`), optional `window.fbq` |
| `code/hrv-mood-tracker-page.tsx` | Related SEO landing page (`/hrv-mood-tracker`), NOT the card. A server component with Article/Breadcrumb/FAQ JSON-LD, integration list, and a `TrackedCTA`. Included as context for the same "mood + HRV" surface; it does not render the check-in card. | `next/link`, `../../components/site/tracked-cta`, `../../components/site/editorial-shell`, `../../components/shared/scroll-reveal`, `../../lib/links` |

## Adaptation notes
- **Rewrite all copy.** The `IDENTITY`, `BEHAVIOR`, `SPECIFICITY` chip arrays and the `MIRROR` record are pure Therma voice (lowercase, no em dashes, "60 seconds, one question"). They are the product, not boilerplate. Reach for this for the structure; supply your own questions and reflections.
- **Swap the two imports:** point `trackEvent` at your analytics wrapper (it takes `(name, props)`) and `APP_STORE_URL` at your CTA target. `ScrollReveal` is just an entrance-animation wrapper; replace with a plain `<section>` if you do not have one.
- **Re-key the mirror to whatever your first question is.** The `Identity` union and `MIRROR` keys must stay in sync; if you add a persona, add its two-line reflection.
- **Attribution params are Apple-specific** (`pt`, `ct`, `mt`). For a non-App-Store CTA, replace `appStoreHref` with your own UTM or attribution builder, keeping the persona in the `ct`/`utm_content` slot.
- **Theme tokens:** the `C` object reads `var(--theme-*)` and `var(--color-coral)`. Define those (or inline literals) in the target project, and decide whether to keep the gold accent.
- **Meta Pixel is optional.** Drop the `fbq` block if you do not run Meta ads; nothing else depends on it.

## Provenance
- Origin files: `therma-site/components/site/home-quiz-card.tsx`, `therma-site/app/hrv-mood-tracker/page.tsx` @ `52f65787`
- Related memory: `project_therma_chat_widget.md` (in-flow quiz card, `ct=chat_v3_*` attribution, kill rule), `project_therma_icon_review.md` (the iOS "Mood Halo" visual this card is the web echo of)
