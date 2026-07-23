# Email Provider Failover (SES primary, Resend fallback)

> One `sendMail()` every caller imports, that routes through SES when configured and falls back to Resend, so a provider outage or migration is a one-line config change, not a code change.

- **Slug:** `email-provider-failover`
- **Tags:** `email, infra, transactional, failover, ses, resend`
- **Source project:** web app (directory / marketplace)
- **Stack:** TypeScript (Node runtime) + @aws-sdk/client-ses + resend
- **Reuse confidence:** drop-in
- **Status in origin:** live in prod

## Problem it solves
Transactional email breaks in two ways nobody plans for: your provider has a bad day, or you outgrow its limits and have to migrate mid-flight. If every cron, webhook, and admin tool imports a provider SDK directly, a switch means editing dozens of call sites under pressure. This puts provider choice behind one function so the switch is an env var.

## When to reach for this
- You send transactional email from more than one place (signup, webhooks, crons, admin).
- You are migrating providers (this pattern came out of an SES to Resend move) and want both live at once with a clean cutover.
- You want the option to fail over without a deploy.

## How it works
1. **One entry point.** Everything imports `sendMail()`. No call site knows which provider ran.
2. **Config-driven routing.** `isSESConfigured()` reads env; present -> SES, absent -> Resend. Flip the env and the next send switches provider. No deploy needed if env is runtime-read.
3. **Provider adapters behind a uniform shape.** `ses.ts` wraps the SES `SendEmailCommand`; the Resend branch calls its SDK. Both take `{to, subject, html, from, replyTo}`.
4. **Lazy singletons.** Each client is constructed once, on first use, so importing the module is free and env is read at call time.
5. **Errors surface, never swallow.** See the gotcha. every failure throws so the caller (and your logs) see it.

## Data model
Stateless. Only env vars: `AWS_SES_REGION`, `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY` (or `AWS_PROFILE`), and `RESEND_API_KEY`.

## Key decisions & gotchas
- **The Resend silent-drop trap (the expensive one).** The Resend SDK does NOT throw on API errors. it returns `{ data, error }`. An unchecked `await resend.emails.send(...)` looks successful while dropping the email. You MUST read `error` and throw it. This one line is why the whole thing is wrapped.
- **Credentials: pin only when both keys exist.** If only a region is set, let the AWS SDK resolve credentials from the ambient chain (`AWS_PROFILE`, instance role). Half-pinned credentials throw confusingly.
- **`isSESConfigured()` requires region AND (key OR profile).** Region alone is not enough to send; this predicate is the actual routing switch, so it has to match what SES needs to authenticate.
- **Deliberately not included:** bulk/templated send, bounce and complaint webhooks, send-quota introspection, and open/click tracking. Those live in the origin but are not part of the failover core.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/email.ts` | The unified `sendMail()` router: pick provider, send, normalize the Resend error. | `resend`, `@/lib/ses`, `RESEND_API_KEY` |
| `code/ses.ts` | SES adapter: client singleton, `isSESConfigured()`, `sendEmail()`. | `@aws-sdk/client-ses`, `AWS_SES_*` env |

## Structure to keep, skin to drop
- **Keep (the idea):** the single `sendMail()` entry point, the `isSESConfigured()` routing switch, the uniform `{to, subject, html, from, replyTo}` shape, the mandatory Resend `error` check, and the lazy singletons.
- **Drop (regenerate natively):** the `FROM` identity, and the entire HTML template layer (the origin has a branded `baseTemplate`/`cta`/per-email builders). Templates are pure skin. build your own or use react-email.

## Adaptation notes
- Install `resend` and `@aws-sdk/client-ses`. If you only ever want one provider, keep `sendMail()` anyway and delete the other branch. the indirection is the value.
- Set `FROM` / `FROM_NAME` / `FROM_EMAIL` to a verified sender on whichever provider(s) you use.
- To fail over, unset the `AWS_SES_*` env (routes to Resend) or vice versa. Confirm your host reads env at runtime if you want zero-deploy switching.
- Swap the console logger for your structured logger.

## Provenance
- Origin files: `src/lib/email.ts`, `src/lib/ses.ts` @ `origin/main` (directory web app, live). Genericized for this library: brand, from-address, and all HTML templates removed; provider routing and the Resend error-check intact.
- Related features: [[email-nurture-sequence]], [[stripe-subscription-webhook]]
- Related memory: SES outage / SES-to-Resend migration.
