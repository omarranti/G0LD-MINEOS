# Entity Claim with Domain-Match Auto-Approval

> "Claim your business profile" for any directory or marketplace: an email at the listing's own website domain gets approved instantly, everything else queues for a human, and free-email domains never count as proof.

<!-- Structure over skin: the value is the transport-agnostic core + the proof hierarchy, not the form fields. -->

- **Slug:** `entity-claim-auto-approval`
- **Tags:** `claims, ownership-verification, auto-approval, directory, marketplace, mobile-parity, abuse-limits`
- **Source project:** directory / marketplace web app
- **Stack:** Next.js 15 App Router (server action + route handler) + Prisma + Postgres + zod
- **Reuse confidence:** drop-in for `claim-auto-approve.ts`; adapt-the-shape for the core and transports
- **Status in origin:** live in prod (web + mobile)

## Problem it solves
A directory seeds thousands of listings the businesses themselves never created. Owners want to claim their profile, but manual review of every claim doesn't scale and adds days of latency for the obviously legitimate case. The opposite failure is worse: approve on weak signals and a hostile actor takes over someone's business page. This pattern splits the difference. Email-at-the-listing's-own-domain is treated as proof of affiliation and approves instantly; every other claim goes to an admin queue; and a rolling cap plus a daily digest keep the automated path auditable.

## When to reach for this
- Your product has entities (businesses, venues, practitioners, projects) that exist before their owners sign up, and owners need to take control of them.
- You want Google-Business-Profile-style instant verification for the common case without giving up a human gate for everything ambiguous.
- You have (or will have) both a web and a mobile client, and duplicated claim logic between them would drift.
- You need the auto path to be abuse-resistant from day one: free-email domains excluded, link-in-bio and social hosts excluded, per-email daily cap, marker string for audit.

## How it works
1. **One transport-agnostic core.** `createListingClaim()` takes `{listingId, userId, userEmail, input}` and returns a typed result union (`ok` with claimId/status/slug, or `ok:false` with a machine-readable error code). The web server action and the mobile route are thin wrappers over it, so validation, the uniqueness rule, and auto-approval can never diverge between clients. The core does no auth and no transport mapping; callers own both.
2. **Validation via one zod schema** (`ClaimInputSchema`): relationship required, email/phone/proof optional strings where "" means absent, plus a cross-field rule that at least one contact method is present.
3. **One claim per (listing, user)** enforced by a DB unique constraint and an upsert. Resubmitting overwrites the old claim and resets status to PENDING.
4. **The auto-approve decision** (`shouldAutoApprove`) is a pure function: extract the listing website's host (tolerating scheme-less input, stripping `www.`), extract the claimant email's domain, then approve only if the email domain equals the website host or is a subdomain of it. Three hard vetoes: no website or no email means no auto-approve; the website host being a social/link-in-bio host (instagram.com, linktr.ee, ...) means no auto-approve; the email domain being a free-email provider (gmail.com, ...) means no auto-approve.
5. **Match email preference:** the business email typed in the form, falling back to the signed-in account email. Either can win the domain match.
6. **Rolling 24h cap:** before auto-approving, count prior auto-approvals (identified by a `reviewNotes` marker prefix) for the same claimant email in the trailing 24h; at 5, the claim silently stays PENDING for the human queue instead.
7. **Approval is one transaction** (`runApprovalTransaction`): reject all other PENDING claims on the listing as superseded, mark this claim APPROVED with reviewedAt + notes, and transfer listing ownership (`createdById`). The manual admin approve action and the auto path share this function.
8. **Lifecycle emails are best-effort** and wrapped in try/catch; delivery failure never fails the claim.
9. **Admin review queue (described, not copied):** an `/admin/claims` page lists claims by status with claimant, contact info, relationship, and proof notes; approve and reject actions call the same core transaction; reject requires a written reason; auto-approved rows carry a visible "Auto" badge derived from the marker string.
10. **Daily auto-approve digest cron (described, not copied):** a cron route (bearer-secret protected) counts claims approved in the trailing 24h whose reviewNotes start with the marker, and emails an admin digest with up to 10 samples. Quiet days send nothing. The point is that a hostile sweep of auto-approvals is visible within a day even if nobody opens the admin page.

## Data model
```
ListingClaim
  id            String   @id @default(cuid())
  listingId     String   -> Listing (cascade delete)
  userId        String   -> User (claimant, cascade delete)
  businessEmail String?          -- work email the claimant offers
  businessPhone String?
  relationship  String           -- role at the business (owner, manager, ...)
  proofNotes    String?  @db.Text
  status        ClaimStatus @default(PENDING)   -- PENDING | APPROVED | REJECTED
  reviewedAt    DateTime?
  reviewedById  String?  -> User (SetNull)      -- null for auto-approvals
  reviewNotes   String?  @db.Text               -- marker string identifies auto path
  @@unique([listingId, userId])
  @@index([status, createdAt])

Listing.website     -- the domain matched against
Listing.createdById -- ownership; transferred on approval
```
The audit trail for auto-approval lives entirely in `reviewNotes` starting with `AUTO_APPROVE_MARKER`; no extra column needed.

## Key decisions & gotchas
- **Free-email domains never count as proof.** `owner@gmail.com` claiming a listing whose website is `gmail.com`-anything must not exist as a path; the blocklist veto runs before the match. Same for social/link-in-bio websites: a listing whose "website" is an Instagram page has no ownable domain, so nothing auto-approves against it.
- **Subdomain match is one-directional.** `mail.joesdeli.com` matches `joesdeli.com`, but an email at `joesdeli.com` does NOT match a listing website of `x.joesdeli.com`'s parent by reversal; concretely, `hostMatches` only lets the email host be equal to or a subdomain of the website host, never the reverse, so `subdomain.gmail.com` sites can't be used to validate gmail addresses.
- **The cap fails closed to PENDING, not to rejection.** Hitting the 5-per-24h cap is not an error and not a rejection; the claim just takes the human lane. Legitimate multi-location owners (one email, many listings) are slowed, not blocked.
- **Superseding rejections happen inside the approval transaction.** Approving claim A must atomically reject other pending claims on the same listing, or two owners can both end up believing they hold the profile.
- **Resubmit resets to PENDING.** A rejected claimant can fix their info and try again without a support ticket; the upsert keeps the row count at one per (listing, user).
- **Typed error codes, not thrown errors.** The core returns `validation | no_contact | listing_not_found | internal` so the HTTP caller maps codes to 400/404/500 and the server action maps them to form errors. No transport leaks into the core.
- **Deliberately not handled:** postcard/phone verification, document upload proof, claim expiry, and disputing an already-approved claim (that is a manual admin operation on purpose).

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/claim-auto-approve.ts` | Pure decision module: `extractHost`, `emailDomain`, `hostMatches`, `shouldAutoApprove`, the free-email and social/link-host blocklists, the audit marker constant | none; drop-in |
| `code/claim-core.ts` | Transport-agnostic core: zod schema, typed result union, upsert, cap check, auto-approve, shared `runApprovalTransaction` | `@/lib/db` (Prisma), `@/lib/email` (2 lifecycle sends, deletable) |
| `code/listing-claims-actions.ts` | Web server action `submitListingClaim` + admin `approveClaim`/`rejectClaim` | `@/auth` (session), `@/lib/admin-pin-gate` (your admin auth), `@/lib/email`, revalidate paths |
| `code/mobile-claim-route.ts` | Mobile POST route: bearer auth, slug-to-id resolution, error-code-to-HTTP-status mapping over the same core | `@/app/api/mobile/v1/_lib/mobile-jwt` (your mobile auth) |
| `code/claim-pending.ts` | Adjacent, optional: the origin's other "claim" path, attaching an anonymous pre-signup Stripe purchase (incl. a SKIP LOCKED capped-seat grab) to a new account. Unrelated to listing claims; delete unless you sell pre-auth checkout | `@/lib/db`, `@/lib/stripe`, `STRIPE_FOUNDER_COUPON_ID` |

## Structure to keep, skin to drop
- **Keep (the idea):** the transport-agnostic core with typed result union and thin per-client wrappers; the proof hierarchy (domain match approves, everything else queues, free email is never proof); the two blocklist vetoes; one-directional subdomain matching; the (listing, user) uniqueness + resubmit-resets-to-pending rule; the atomic approve-and-supersede transaction with ownership transfer; the marker-string audit trail plus daily digest; the rolling per-email cap.
- **Drop (regenerate natively):** the form copy and zod error messages, the specific email templates, the admin PIN-cookie gate (use your real admin auth), the revalidate paths, `Cache-Control` header choices, and the mobile JWT helper. The origin's admin queue UI and digest email are described above, not shipped; rebuild both in your own stack. `claim-pending.ts` is a sibling pattern, not part of this flow; treat it as reference for anonymous-purchase claiming only.

## Adaptation notes
- Prisma: add the `ListingClaim` model (schema slice above) with the `@@unique([listingId, userId])` constraint and a `ClaimStatus` enum; migrate. Rename `Listing` to your entity if needed; the core only reads `id, slug, website, name` and writes `createdById`.
- Swap `@/auth` for your session provider in the action, and `requireMobileUser` for your mobile bearer auth in the route. Replace the PIN-cookie admin check with a role check.
- Wire `sendClaimReceivedEmail` / `sendClaimApprovedEmail` to your email layer or delete the calls; they are best-effort by design.
- Build the two described-but-not-copied pieces: an admin claims page calling `runApprovalTransaction` / the reject update, and a daily cron that queries `status=APPROVED AND reviewNotes startsWith AUTO_APPROVE_MARKER AND reviewedAt >= now-24h` and emails a digest (protect it with a bearer `CRON_SECRET`).
- Extend the blocklists for your market (regional free-email providers, marketplace hosts your listings commonly use as "website").
- Tune `AUTO_APPROVE_DAILY_CAP` (origin: 5) to your multi-location owner reality.

## Provenance
- Origin files: `src/lib/claim-core.ts`, `src/lib/claim-auto-approve.ts`, `src/lib/claim-pending.ts`, `src/app/actions/listing-claims.ts`, `src/app/api/mobile/v1/listings/[slug]/claim/route.ts` @ 2026-08-08 (directory / marketplace web app, live). Genericized for this library: brand and business-model specifics removed; numbered email-template names replaced with neutral send functions, the origin's product path (`/explore/...`) replaced with `/listings/...`, brand comparisons dropped from comments, and the founding-tier price in `claim-pending.ts` moved behind a placeholder constant. The admin review queue and digest cron are described in this SPEC rather than copied. Control flow is intact.
- Related features: [[stripe-subscription-webhook]] (the webhook side of `claim-pending.ts`'s PendingCheckout), [[pin-auth-gate]] (the origin's admin gate), [[token-bucket-rate-limit]]
- Related memory: KCW owner-funnel CRO docket (claim flow is the top of the owner monetization funnel).
