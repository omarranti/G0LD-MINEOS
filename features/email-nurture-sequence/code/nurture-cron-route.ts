/**
 * Daily nurture cron. Vercel Cron hits this once per day.
 *
 * For each waitlist row whose createdAt maps to a day-offset in
 * thermaNurtureSequence (±12h window), render the corresponding
 * NurtureEmailTemplate and send via Resend. Writes an emailEvents row
 * tagged with the nurture id so we never double-send.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { and, eq, gte, lt } from 'drizzle-orm';
import React from 'react';
import { db } from '../../../../lib/db';
import { waitlist, emailEvents } from '../../../../lib/schema';
import { sendOptimizedEmail } from '../../../../lib/email-performance';
import { thermaNurtureSequence } from '../../../../lib/email-nurture-sequence';
import { NurtureEmailTemplate } from '../../../../lib/email-nurture-template';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type SendRecord = {
  nurtureId: string;
  email: string;
  status: 'sent' | 'skipped-already-sent' | 'failed';
  error?: string;
};

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY missing' }, { status: 500 });
  }
  const resend = new Resend(resendKey);

  const results: SendRecord[] = [];
  const now = new Date();

  for (const nurture of thermaNurtureSequence) {
    // Target window: users whose createdAt is between (dayOffset+1) and dayOffset days ago.
    // That gives a 24h window so one daily run catches each user exactly once.
    const windowEnd = new Date(now.getTime() - nurture.dayOffset * 24 * 60 * 60 * 1000);
    const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);

    let candidates: { id: number; email: string }[] = [];
    try {
      candidates = await db
        .select({ id: waitlist.id, email: waitlist.email })
        .from(waitlist)
        .where(
          and(gte(waitlist.createdAt, windowStart), lt(waitlist.createdAt, windowEnd)),
        );
    } catch (err: unknown) {
      return NextResponse.json(
        {
          error: 'db query failed',
          nurtureId: nurture.id,
          message: err instanceof Error ? err.message : String(err),
        },
        { status: 500 },
      );
    }

    for (const row of candidates) {
      // Skip if we already logged a send for this nurture id + email.
      const existing = await db
        .select({ id: emailEvents.id })
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.recipientEmail, row.email),
            eq(emailEvents.eventType, `nurture_sent:${nurture.id}`),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        results.push({
          nurtureId: nurture.id,
          email: row.email,
          status: 'skipped-already-sent',
        });
        continue;
      }

      // Render + send
      const firstName = row.email.split('@')[0] || 'there';
      const element = React.createElement(NurtureEmailTemplate, {
        email: nurture,
        firstName,
      });

      const sendResult = await sendOptimizedEmail(
        resend,
        row.email,
        nurture.subject,
        element,
      );

      if (sendResult.success) {
        // Log the send so we never double-fire
        await db.insert(emailEvents).values({
          emailId: sendResult.emailId || 'unknown',
          recipientEmail: row.email,
          eventType: `nurture_sent:${nurture.id}`,
          metadata: {
            nurtureId: nurture.id,
            dayOffset: nurture.dayOffset,
            subject: nurture.subject,
            domain: sendResult.domain,
            durationMs: sendResult.duration,
          },
        });
        results.push({
          nurtureId: nurture.id,
          email: row.email,
          status: 'sent',
        });
      } else {
        results.push({
          nurtureId: nurture.id,
          email: row.email,
          status: 'failed',
          error: sendResult.error,
        });
      }
    }
  }

  const summary = {
    ran: new Date().toISOString(),
    total: results.length,
    sent: results.filter((r) => r.status === 'sent').length,
    skipped: results.filter((r) => r.status === 'skipped-already-sent').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  };

  return NextResponse.json(summary);
}
