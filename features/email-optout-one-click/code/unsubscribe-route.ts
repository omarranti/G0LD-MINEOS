import { NextResponse } from "next/server";
import { recordOptOut } from "@/lib/email-optout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET/POST /api/unsubscribe?email=<addr>&type=<scope>
 *
 * The base unsubscribe endpoint the email footers link to (unsubscribeUrl()
 * in email-optout.ts) and the target of the List-Unsubscribe header.
 *
 * GET  renders a confirmation page and records NOTHING. A bare GET used to call
 *        recordOptOut on load, which meant any mail scanner or link-preview
 *        bot that prefetched the footer link silently unsubscribed a real
 *        person who never clicked. Link prefetching is a GET, so the fix is
 *        to make GET a question and put the write behind a POST.
 * POST records, always. Two callers reach it:
 *          1. The confirm button on the page above, which posts confirm=1 and
 *             gets the confirmed page back.
 *          2. RFC 8058 one-click (List-Unsubscribe-Post), fired by Gmail and
 *             other providers with a body of "List-Unsubscribe=One-Click".
 *             It expects a bare 200 and never renders anything.
 *        The write happens on both paths and only the response differs, so an
 *        unrecognized POST shape still unsubscribes the person rather than
 *        stranding them on a list.
 *
 * Opt-out is by email + type, so it needs no session. Missing email is treated
 * as a no-op success (never leak whether an address exists, never error a user
 * trying to leave a list).
 */

// ---------------------------------------------------------------------------
// SKIN: everything from here to paramsOf() is presentation. The destination
// project should rebuild these pages in its own design system. Only the
// GET-asks / POST-writes split below is load-bearing.
// ---------------------------------------------------------------------------

const BG = "#F7F7F5";
const FG = "#1B2A3C";
const ACCENT = "#7A2B4A";

/** What this scope unsubscribes the reader from, in their words. */
function subjectOf(type: string): string {
  if (type === "weekly-recap") return "the weekly recap";
  if (type === "all") return "these emails";
  return "these emails";
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" /><title>${title}</title></head>
<body style="margin:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:48px 20px;"><tr><td align="center">
<table width="100%" style="max-width:480px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
<tr><td style="padding:40px;text-align:center;">
${body}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

/** Step one: ask. Nothing has been recorded at this point. */
function confirmPage(email: string, type: string): string {
  // &amp; rather than a bare & : this is an HTML attribute, not a URL string.
  const action = `/api/unsubscribe?email=${encodeURIComponent(email)}&amp;type=${encodeURIComponent(type)}`;
  return page(
    "Unsubscribe",
    `<h1 style="margin:16px 0 8px;font-size:24px;color:${FG};">Unsubscribe from ${subjectOf(type)}?</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#444;">Confirm below and we stop sending. Your account stays exactly as it is.</p>
<form method="POST" action="${action}" style="margin:0;">
<input type="hidden" name="confirm" value="1" />
<button type="submit" style="display:inline-block;background:${ACCENT};color:#ffffff;font-size:15px;font-weight:600;font-family:inherit;padding:16px 36px;border:0;border-radius:100px;cursor:pointer;">Yes, unsubscribe</button>
</form>`,
  );
}

/** Step two: done. Reached only after the POST has written the opt-out. */
function confirmedPage(type: string): string {
  return page(
    "Unsubscribed",
    `<h1 style="margin:16px 0 8px;font-size:24px;color:${FG};">You're unsubscribed</h1>
<p style="margin:0;font-size:15px;line-height:1.7;color:#444;">You won't receive ${subjectOf(type)} anymore. Your account is untouched.</p>`,
  );
}

/** A footer link that arrived without its address. Say so plainly. */
function missingAddressPage(): string {
  return page(
    "Unsubscribe",
    `<h1 style="margin:16px 0 8px;font-size:24px;color:${FG};">This link is missing an address</h1>
<p style="margin:0;font-size:15px;line-height:1.7;color:#444;">We couldn't tell which address to remove, so nothing has changed. Reply to any email from us and we'll take you off the list by hand.</p>`,
  );
}

// ---------------------------------------------------------------------------
// STRUCTURE: the load-bearing part starts here.
// ---------------------------------------------------------------------------

function paramsOf(req: Request) {
  const params = new URL(req.url).searchParams;
  return {
    email: params.get("email") ?? "",
    type: params.get("type") ?? "marketing",
  };
}

function html(markup: string) {
  return new NextResponse(markup, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: Request) {
  const { email, type } = paramsOf(req);
  if (!email) return html(missingAddressPage());
  return html(confirmPage(email, type));
}

export async function POST(req: Request) {
  const { email, type } = paramsOf(req);

  // Read the body before anything else can consume it. One-click posts
  // "List-Unsubscribe=One-Click"; our confirm button posts "confirm=1".
  const body = await req.text().catch(() => "");
  const fromConfirmButton = new URLSearchParams(body).get("confirm") === "1";

  if (email) {
    try {
      await recordOptOut(email, type);
    } catch {
      // Never fail the unsubscribe from the user's side; a transient DB
      // error must not strand someone on a list. They can click again.
    }
  }

  // One-click providers want a bare 200 and ignore the body. Rendering the
  // page for them would be harmless but pointless; rendering nothing for a
  // person who just pressed a button would look broken.
  if (!fromConfirmButton) return new NextResponse(null, { status: 200 });
  if (!email) return html(missingAddressPage());
  return html(confirmedPage(type));
}
