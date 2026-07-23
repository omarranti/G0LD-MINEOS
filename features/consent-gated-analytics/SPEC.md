# Consent-Gated Analytics (privacy tier modal + hook)

> A first-interaction privacy modal plus a React hook that block data capture
> until the user picks a consent tier (session-only / anonymous / account), so
> tracking and retention never run before the user has chosen.

- **Slug:** `consent-gated-analytics`
- **Tags:** `privacy`, `gdpr`, `consent`, `compliance`
- **Source project:** Therma (therma.one website)
- **Stack:** Next.js (App Router) + React client components + Tailwind. API route imports Drizzle but does not yet use it.
- **Reuse confidence:** reference-only (clean shape, but the gate is not wired to any tracker and the API route is a stub that never persists)
- **Status in origin:** prototype (hook is defined but no component in the repo consumes it; the `/api/consent` route logs and returns, it does not write to a DB)

## Problem it solves
Before you fire analytics, save journal/chat content, or run AI analysis on a
user's input, GDPR-style rules (and Apple Guideline 5.1.2(i) for the Therma app)
want the user to have made an explicit choice first. This is the gate: a modal
that appears on first interaction and a hook that reports whether consent exists,
so the rest of the app can hold tracking and persistence behind it.

## When to reach for this
- You need a consent wall that shows up once, then stays out of the way until revoked.
- You want graded consent (no-storage vs anonymous vs full account), not a binary
  accept/reject cookie banner.
- You want a single `hasConsented` boolean a parent can read before deciding to
  track, persist, or run analysis.
- You want the modal markup and the consent state machine as a starting shape, and
  you will wire the actual gating and persistence yourself.

## How it works
- `useConsent(sessionId)` owns the state. On mount it reads `sessionStorage` key
  `therma-consent`. If present and parseable, `hasConsented` is true with the stored
  tier. If absent, it flips `showConsentModal` to true (default-deny, modal opens).
- `ConsentModal` is a pure presentational radio picker over three tiers
  (`session` | `anonymous` | `account`) plus a retention-days `<select>` (30 / 90 /
  180 / 365 / 730) shown only for the two non-session tiers. It calls back with the
  chosen tier and retention. `session` always forces `retentionDays = 0`.
- `createConsent` POSTs to `/api/consent`, then writes the returned record to
  `sessionStorage` and sets `hasConsented: true`, closing the modal.
- `revokeConsent` DELETEs to `/api/consent`, clears `sessionStorage`, resets state
  to not-consented, and re-opens the modal.
- The gating itself is the consumer's job: a parent reads `consentState.hasConsented`
  (and the tier) and decides whether to fire analytics / persist / run AI. That wiring
  does not exist in the source repo, which is why this is reference-only.

## Data model
Client persistence is **`sessionStorage`**, not a cookie and not `localStorage`:
```
key:   "therma-consent"
value: ConsentData {
  consentId, userId?, sessionId,
  consentType: 'session' | 'anonymous' | 'account',
  acceptedAt, dataRetentionDays?
}
```
Server side the `/api/consent` route defines a `ConsentRecord` interface
(`id, sessionId, userId?, consentType, acceptedAt, dataRetentionDays, revokedAt?`)
and generates `consent_<timestamp>_<random>` IDs, but it only `console.log`s for
audit and returns the object. No table is written (imports `getDb`/`sql` but never
calls them). Default retention by tier: session 0, anonymous 90, account 365.

## Key decisions & gotchas
- **Default-deny.** Initial state is `hasConsented: false` and the modal auto-opens
  when no stored consent is found. Nothing should track before the user chooses.
- **`sessionStorage`, not cookies/localStorage.** Consent evaporates when the tab
  closes. This contradicts the retention-days UI (30 days to 2 years), which implies
  durable server-side retention the client never actually remembers. For real GDPR
  persistence you must move this to a cookie or `localStorage` plus a real DB row.
- **No SSR guard.** `sessionStorage` is read inside `useEffect`, so it is client-only
  by construction (both files are `'use client'`). Fine for App Router, but the hook
  cannot inform a server component's first render.
- **Three tiers, not a switch.** Consent is graded (no-storage / anonymous /
  account), so a consumer reads the tier, not just a boolean, to decide retention and
  what to persist.
- **The API route is a stub.** It logs IP / user-agent / tier for "audit" and returns
  the record, but persists nothing and the DELETE does not trigger deletion. Treat the
  route as a placeholder, not a compliance backend.
- **Revoke parse failure is swallowed.** A corrupt `sessionStorage` blob logs an error
  and silently leaves `hasConsented: false` (so it re-prompts), which is the safe
  fallback.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/useConsent.ts` | Consent state machine: read `sessionStorage`, open modal on first visit, create/revoke via `/api/consent` | `fetch('/api/consent')` endpoint, `sessionStorage` key name |
| `code/ConsentModal.tsx` | Presentational 3-tier radio picker + retention select, fires `onConsent(type, retentionDays)` | Tailwind classes, Therma brand colors, `/privacy` + `/terms-of-service` links |

## Adaptation notes
- Wire it: render `ConsentModal` with `isOpen={showConsentModal}`, pass
  `onConsent={createConsent}` and `onClose={() => setShowConsentModal(false)}`, then
  gate your analytics/tracking calls behind `consentState.hasConsented` and branch on
  `consentState.consentType` for retention behavior.
- For durable GDPR consent, change `sessionStorage` to a cookie or `localStorage` and
  build the real `/api/consent` persistence (the route currently writes nothing).
- Restyle `ConsentModal`: it is hard-coded to Therma's orange/red gradient, "Therma
  Assistant" copy, the "T" avatar, the HIPAA line, and `/privacy` + `/terms-of-service`
  hrefs. Swap all brand strings.
- Provide a stable `sessionId` from the parent (the hook keys its mount effect on it).

## Provenance
- Origin files: `therma-site/components/ConsentModal.tsx`, `therma-site/lib/useConsent.ts` @ `52f65787`
- Related (stub backend): `therma-site/app/api/consent/route.ts` (logs only, no DB write)
- Related memory: App Store priority "AI consent flow must gate AI analysis before it runs (Apple Guideline 5.1.2(i))"
