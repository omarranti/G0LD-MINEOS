/**
 * Amazon SES email provider. Configure via env:
 *   AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY
 * Falls back to the default AWS credential chain (AWS_PROFILE / instance role)
 * if explicit keys are not set.
 */

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const FROM_NAME = "Example";
const FROM_EMAIL = "hello@example.com";

// ── Client singleton ─────────────────────────────────────────────────
let _client: SESClient | null = null;

function getClient(): SESClient {
  if (!_client) {
    const config: ConstructorParameters<typeof SESClient>[0] = {
      region: process.env.AWS_SES_REGION || "us-east-1",
    };
    // Only pin explicit credentials when both are present; otherwise let the
    // AWS SDK resolve them from the ambient credential chain.
    if (process.env.AWS_SES_ACCESS_KEY_ID && process.env.AWS_SES_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY,
      };
    }
    _client = new SESClient(config);
  }
  return _client;
}

// ── Config check: drives provider routing in the unified sender ───────
export function isSESConfigured(): boolean {
  return !!(
    process.env.AWS_SES_REGION &&
    (process.env.AWS_SES_ACCESS_KEY_ID || process.env.AWS_PROFILE)
  );
}

// ── Send one message ──────────────────────────────────────────────────
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from,
  replyTo,
}: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}): Promise<{ messageId: string }> {
  const toList = Array.isArray(to) ? to : [to];
  const source = from || `${FROM_NAME} <${FROM_EMAIL}>`;

  const cmd = new SendEmailCommand({
    Source: source,
    Destination: { ToAddresses: toList },
    Message: {
      Subject: { Data: subject, Charset: "UTF-8" },
      Body: {
        Html: { Data: html, Charset: "UTF-8" },
        ...(text ? { Text: { Data: text, Charset: "UTF-8" } } : {}),
      },
    },
    ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
  });

  const res = await getClient().send(cmd);
  return { messageId: res.MessageId || "" };
}
