# Email Nurture Sequence (timed waitlist drip)

> A daily cron drips a fixed sequence of follow-up emails to waitlist signups,
> timed by day-offset from when each person joined, rendered through one shared
> template, with idempotent send logging so nobody gets the same email twice.

- **Slug:** `email-nurture-sequence`
- **Tags:** `lifecycle`, `email`, `retention`
- **Source project:** Therma
- **Stack:** Next.js 15 App Router (route handler) + Drizzle + Postgres + Resend + React (server-rendered email)
- **Reuse confidence:** adapt-the-shape (the sequence data + the React email template are drop-in; the cron route is Drizzle/Resend/Vercel-shaped)
- **Status in origin:** live in prod (Vercel Cron, daily)

## Problem it solves
You collect emails (waitlist, trial, signup) and want to warm them over the
following weeks without a marketing-automation platform. The need is a small,
self-hosted drip: pre-written emails that go out on a schedule relative to each
person's join date, with no double-sends and no per-user scheduler. This is the
build-it-yourself version of a Beehiiv/Customer.io sequence, sized for one cheap
daily cron.

## When to reach for this
- You have a `createdAt` timestamp per recipient and want emails at day 2, 5, 10, 20 (etc.) after that.
- You do not want a per-user job queue or a paid sequencing tool. One daily cron is enough.
- You want the email copy to live in version control as data, edited like code, reviewed in PRs.
- You want every email in the series to share one visual shell so it reads as one conversation.

## How it works
- The sequence is a plain array of typed `NurtureEmail` objects (`email-nurture-sequence.ts`). Each carries its own `dayOffset`, subject, preheader, headline, body paragraphs, optional callout block, optional CTA, and sign-off. Copy is data, not templates.
- One React component (`email-nurture-template.tsx`) renders any `NurtureEmail` into the same card/logo/callout/CTA shell, so the whole series is visually identical. `{firstName}` is substituted at render time.
- A single daily cron (`nurture-cron-route.ts`) loops every email in the sequence. For each one it computes a 24h window: `now - dayOffset days` back one more day, then selects waitlist rows whose `createdAt` falls in that window. Because the window is exactly 24h wide and the cron runs once a day, each user lands in exactly one window per email.
- Idempotency is not a per-user scheduler. Before sending, it checks `email_events` for a row tagged `nurture_sent:<id>` for that recipient. If present, skip. After a successful send it writes that row. The send log IS the dedupe key.
- Sending goes through a multi-domain helper (`sendOptimizedEmail`) that tries verified sender domains fastest-first and returns `{ success, emailId, domain, duration }`. A failed send logs nothing, so the next daily run retries it (as long as the user is still inside the window).
- The route is Bearer-auth gated on `CRON_SECRET` and returns a per-run summary (sent / skipped / failed) for observability.

## Data model
Two existing tables, no new ones. The dedupe lives entirely in the email-events log.

```ts
// Drizzle (Postgres)
export const waitlist = pgTable('waitlist', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // attribution, referer, referralCode, referredBy ... (unused by the cron)
});

export const emailEvents = pgTable('email_events', {
  id: serial('id').primaryKey(),
  emailId: text('email_id').notNull(),        // Resend message id
  recipientEmail: text('recipient_email'),
  eventType: text('event_type').notNull(),    // dedupe key: `nurture_sent:<nurtureId>`
  metadata: jsonb('metadata'),                // { nurtureId, dayOffset, subject, domain, durationMs }
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

The `NurtureEmail` shape (the unit of the sequence):

```ts
type NurtureEmail = {
  id: string;            // stable id, also the dedupe suffix
  dayOffset: number;     // days after createdAt to send
  subject: string;
  preheader: string;
  headline: string;
  bodyParagraphs: string[];
  callout?: { label: string; lines: string[] };
  bodyParagraphsAfterCallout?: string[];
  cta?: { label: string; href: string };
  signOff: string;
  notes?: string;        // internal strategy note, never rendered
};
```

## Key decisions & gotchas
- **The 24h window is the whole timing trick, and it is fragile.** A user is caught only if a daily run lands while their `createdAt` is inside `[now - (dayOffset+1)d, now - dayOffset*d)`. If the cron does not run for a day (Vercel hiccup, deploy gap), anyone whose window passed that day is skipped permanently. There is no catch-up sweep. If you need at-least-once delivery, widen the window or back the send decision off a "max sent offset so far" computation instead.
- **The send log is the idempotency store, not a separate `nurture_sends` table.** Tagging `email_events.eventType` with `nurture_sent:<id>` means one fewer table, but it overloads the events table (which also holds Resend webhook opens/clicks). The dedupe query is an exact match on `(recipientEmail, eventType)` and has no DB unique constraint behind it. Two cron runs overlapping (manual trigger + scheduled) could double-send in the gap between the SELECT and the INSERT. The daily cadence makes this unlikely, not impossible. A unique index on `(recipient_email, event_type)` would close it.
- **Failure is retried implicitly by doing nothing.** A failed send logs no event, so the next run re-attempts, but only while the user is still inside the 24h window. Practically that means one retry the next day, and only if the windows still overlap. After the window passes, a persistently failing address never gets that email.
- **Timezone is not modeled.** All math is UTC millisecond arithmetic off `createdAt`. "Day 2" means 48h, not "9am their local time on day 2." Fine for a waitlist drip, wrong if you care about local send-time.
- **There is no unsubscribe handling in the cron.** The footer says "you signed up for the Therma waitlist" but the loop does not check any opt-out flag. Before reusing for anything CAN-SPAM/GDPR-sensitive, add an `unsubscribed` column on the recipient table and filter the candidate query on it. This is the most important missing piece for a production lifecycle program.
- **`firstName` is derived from the email local-part** (`row.email.split('@')[0]`), falling back to `'there'`. Cheap personalization with no profile table, but it will address `jsmith92@` as "jsmith92". Swap in a real name column if you have one.
- **Copy-as-data is the strength.** The sequence is the first email of five (welcome lives elsewhere in `lib/email-templates.tsx`); emails 2-5 are here. Editing cadence or copy is a code change, reviewable in a PR, with no console to drift from.

## Code layer
| File | Purpose | External deps to swap |
|------|---------|----------------------|
| `code/email-nurture-sequence.ts` | The sequence data: `NurtureEmail` type + the array of timed emails (copy, day-offsets, CTAs). Pure data, zero deps. | none (drop-in) |
| `code/email-nurture-template.tsx` | One React component rendering any `NurtureEmail` into a shared HTML email shell (logo, card, callout, CTA, footer). `{firstName}` substitution. | `react`, the `NurtureEmail` type |
| `code/nurture-cron-route.ts` | Daily cron handler: window math, candidate query, idempotency check, render, send, log, run-summary. | `next/server`, `drizzle-orm`, `resend`, `@/lib/db`, `@/lib/schema` (`waitlist`, `emailEvents`), `@/lib/email-performance` (`sendOptimizedEmail`), `CRON_SECRET`, `RESEND_API_KEY` |

## Adaptation notes
- **`email-nurture-sequence.ts` is genuinely drop-in.** Rewrite the copy and `dayOffset`s for your product; keep the shape. The `notes` field is for your own strategy, never rendered.
- **`email-nurture-template.tsx` is drop-in** if you render React emails server-side. Replace the logo URL, palette constants (`PRIMARY`/`BG`/`TEXT`/`MUTED`), and footer line. If you use react-email/Resend's `react:` option instead of `React.createElement`, it still works.
- **`nurture-cron-route.ts` is adapt-the-shape.** Map `waitlist`/`emailEvents` to your tables, swap Drizzle for your ORM, and replace `sendOptimizedEmail` with a plain `resend.emails.send` (or any provider) returning a message id. Keep the window math and the `nurture_sent:<id>` dedupe tag.
- **Wiring:** add a Vercel Cron (or any scheduler) hitting the route once daily with `Authorization: Bearer $CRON_SECRET`. Set `RESEND_API_KEY`.
- **Before production lifecycle use:** add an unsubscribe column + filter, and a unique index on `(recipient_email, event_type)` to make dedupe race-proof.

## Provenance
- Origin files: `therma-site/lib/email-nurture-sequence.ts`, `therma-site/lib/email-nurture-template.tsx`, `therma-site/app/api/cron/nurture/route.ts` @ `52f65787`
- Pairs with: `lib/email-performance.ts` (`sendOptimizedEmail`, multi-domain failover), `lib/schema.ts` (`waitlist`, `emailEvents`), `lib/email-templates.tsx` (welcome email = email 1 of the series)
- Related memory: `project_crm_ses_listmonk.md`, `reference_mailgun.md`
