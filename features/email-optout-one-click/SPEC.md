# Email Opt-Out and RFC 8058 One-Click Unsubscribe

> An unsubscribe endpoint where GET only asks and POST only writes, because mail
> scanners prefetch footer links and a GET that records silently unsubscribes
> real people who never clicked.

<!-- GUIDING PRINCIPLE: capture the STRUCTURE, not the skin. The reusable value is
the idea, the data model, the logic, the contracts, the flow. -->

- **Slug:** `email-optout-one-click`
- **Tags:** `email`, `compliance`, `unsubscribe`, `rfc8058`, `deliverability`, `lifecycle`, `prefetch`, `idempotency`
- **Source project:** directory / marketplace web app
- **Stack:** Next.js 15 App Router route handler + Prisma + Postgres
- **Reuse confidence:** drop-in (`email-optout.ts` is drop-in; the route's logic is drop-in, its HTML is skin)
- **Status in origin:** live in prod

## Problem it solves
Three failures that all look fine in a browser and are not:

1. **A GET that writes gets triggered by robots.** The original endpoint recorded
   the opt-out on page load. Corporate mail scanners, link-preview bots, and
   prefetchers all issue GETs against every URL in an email. Each one silently
   unsubscribed a real recipient who never clicked anything.
2. **Two URL builders drift.** Footer links and the `List-Unsubscribe` header were
   built in different places. One of them pointed at a route that did not exist,
   so seven email footers 404'd while promising an opt-out that was never recorded.
3. **Gmail's one-click is a POST with a body you did not expect.** RFC 8058
   providers fire `List-Unsubscribe-Post` with `List-Unsubscribe=One-Click` and
   expect a bare 200. Serving them an HTML confirmation page, or worse requiring a
   button press, means the provider marks the unsubscribe as failed.

Getting these wrong is not cosmetic. Unsubscribe reliability feeds sender
reputation, and silently unsubscribing engaged users is invisible churn.

## When to reach for this
- You are adding an unsubscribe link to any lifecycle or marketing email.
- You are adding `List-Unsubscribe` / `List-Unsubscribe-Post` headers.
- You have an unsubscribe route today and have never checked whether a bare GET
  writes to the database. Check that first; it is the common case.
- You need suppression that works for a recipient who is not signed in.

## How it works
- **GET asks, POST writes.** GET renders a confirmation page and records nothing.
  All writes live behind POST. This single split defeats every prefetcher, since
  link prefetching is a GET.
- **POST writes on every shape it receives.** Both the confirm button
  (`confirm=1`) and RFC 8058 one-click (`List-Unsubscribe=One-Click`) land on the
  same write. Only the *response* branches: the button gets HTML, one-click gets a
  bare 200. An unrecognized POST body still unsubscribes rather than stranding
  someone on a list.
- **One URL builder, exported from the same module that reads the scope back.**
  `unsubscribeUrl()` encodes the `type` that `isOptedOut()` queries, so the link
  and the suppression check cannot describe different scopes.
- **Keyed by email address, not user id.** The link works signed-out, and
  suppression is enforceable before any account row is loaded. A row for
  `(email, "all")` suppresses every type.
- **Suppression is checked at send time by the sender**, not by the template. Every
  broadcast caller asks `isOptedOut()` before sending.
- **Transactional mail never consults opt-out.** Receipts, password resets, and
  account lifecycle mail must still send to someone who unsubscribed from marketing.

## Data model

```prisma
model EmailOptOut {
  id        String   @id @default(cuid())
  email     String              // normalized: trimmed + lowercased
  type      String              // "marketing" | "weekly-recap" | "all" | ...
  createdAt DateTime @default(now())

  @@unique([email, type], name: "email_type")
}
```

The `@@unique([email, type])` is what makes `recordOptOut()` idempotent via
upsert, so repeat clicks and duplicate provider posts are harmless.

## Key decisions & gotchas
- **Never let GET mutate.** This is the entry. If you take one thing, take this.
  It applies to every "click this link to confirm/cancel/approve" email pattern,
  not just unsubscribe.
- **A bare 200 with no body is the correct response to one-click.** Providers
  ignore the body. Returning HTML is merely pointless; returning a 3xx or a page
  that needs interaction makes the provider treat the unsubscribe as failed.
- **Read the request body before anything else consumes it.** The body is a stream
  and can only be read once. Reading it first, with a `.catch(() => "")`, keeps an
  empty or malformed body from throwing the whole handler.
- **Swallow write errors on the user's side.** A transient database error must not
  render an error page to someone trying to leave a list. They will click again,
  and the upsert makes that safe.
- **Missing email is a no-op success, not a 400.** Never reveal whether an address
  exists, and never show an error to someone who followed a broken footer link.
- **Two builders is the real bug behind the 404 footers.** Anywhere a URL is
  constructed in more than one place, the copies drift. Export exactly one.
- **Normalize before writing and before reading.** `recordOptOut` and `isOptedOut`
  both lowercase and trim, or `User@x.com` opts out and `user@x.com` keeps getting
  mail.
- **A separate broadcast tool can bypass this entirely.** In the origin app an
  external campaign sender does not consult `EmailOptOut` at all, so opt-outs are
  honored on app-sent mail but not on that channel. If you have two send paths,
  either both check suppression or you do not actually have suppression.
- **Deliberately not handled:** signed/tamper-proof unsubscribe tokens (the URL
  carries a plaintext address, so anyone who guesses an address can unsubscribe
  it), per-user preference centers, and resubscribe flows.

## Code layer

| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/email-optout.ts` | The suppression core: normalize, the single URL builder, `isOptedOut()`, idempotent `recordOptOut()`. | `@/lib/db` (Prisma), `NEXT_PUBLIC_APP_URL` |
| `code/unsubscribe-route.ts` | The GET-asks / POST-writes route handler, handling both the confirm button and RFC 8058 one-click. HTML page builders included but marked as skin. | `@/lib/email-optout`, `next/server` |

## Structure to keep, skin to drop
- **Keep (the idea):** the GET/POST split, POST writing on every body shape while
  only the response branches, the bare-200 one-click response, the single URL
  builder co-located with the scope reader, email-keyed suppression with an
  `"all"` scope, the unique-constraint upsert, the swallowed write error, and the
  missing-address no-op.
- **Drop (regenerate natively):** every `page()` / `confirmPage()` /
  `confirmedPage()` / `missingAddressPage()` builder and the color constants. They
  are inline-styled HTML shaped to the origin's email design. Rebuild them in the
  destination's system. Also drop `subjectOf()`'s copy.

## Adaptation notes
- Add the `EmailOptOut` model plus the `@@unique([email, type])` constraint and
  migrate before wiring anything.
- Set `NEXT_PUBLIC_APP_URL`. The builder falls back to `example.com`, which will
  ship broken footers if you forget.
- Add both headers to every broadcast send, pointing at the same URL:
  `List-Unsubscribe: <{url}>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- Audit every existing send path for a second URL builder and delete it.
- Gate every broadcast caller on `isOptedOut()`. Grep for the send helper and check
  each call site; this is the step most likely to be missed.
- Leave transactional sends alone. If you gate receipts on opt-out you will break
  billing support.
- Verify the fix the same way it was found: `curl` the GET and confirm no row is
  written, then POST and confirm one is.

## Provenance
- Origin file(s): `src/lib/email-optout.ts`, `src/app/api/unsubscribe/route.ts` @
  `7d5eeec` (2026-08-27), "Email compliance: honor opt-outs, fix the 404 footers,
  stop scanners unsubscribing people"
- Related features: [[email-nurture-sequence]], [[email-provider-failover]],
  [[calendar-quiet-windows]]
