import { Resend } from "resend";
import { sendEmail as sesSendEmail, isSESConfigured } from "@/lib/ses";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

const FROM = "Example <hello@example.com>";

/**
 * Unified email sender. Routes through SES when configured, falls back to
 * Resend. Every one-off sender (admin tools, webhooks, crons) imports THIS,
 * not a provider directly, so provider routing lives in one place and you can
 * swap or add a provider without touching call sites.
 */
export async function sendMail(opts: {
  from?: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
}) {
  const from = opts.from || FROM;
  const to = Array.isArray(opts.to) ? opts.to : [opts.to];
  const provider = isSESConfigured() ? "ses" : "resend";

  try {
    if (provider === "ses") {
      await sesSendEmail({ to, subject: opts.subject, html: opts.html, from, replyTo: opts.replyTo });
      return;
    }

    // Fallback to Resend. The SDK does NOT throw on API errors: it returns
    // { data, error }. An unchecked call therefore silently drops the email
    // and looks successful. Read `error` and throw it so the catch below and
    // the caller both see the failure.
    const { error } = await getResend().emails.send({
      from,
      to,
      subject: opts.subject,
      html: opts.html,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      ...(opts.headers ? { headers: opts.headers } : {}),
      ...(opts.tags ? { tags: opts.tags } : {}),
    });
    if (error) throw new Error(`Resend: ${error.name}: ${error.message}`);
  } catch (err) {
    console.error(
      `[email] send failed via ${provider}: subject="${opts.subject}" to=${to.join(",")}:`,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
}
