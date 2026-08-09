// Representative "configured provider" adapter: creds present, real fetch,
// per-domain try/catch so one bad domain doesn't zero the rest.

export interface MailgunStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  failed: number;
}

export async function fetchMailgunStats(duration = '30d'): Promise<MailgunStats> {
  const stats: MailgunStats = { sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0 };
  const mgKey = process.env.MAILGUN_API_KEY;
  if (!mgKey) return stats;

  const auth = `Basic ${Buffer.from(`api:${mgKey}`).toString('base64')}`;
  // sending domains to aggregate across, e.g. "m.example.com,hello.example.com"
  const domains = (process.env.MAILGUN_DOMAINS ?? '').split(',').map((d) => d.trim()).filter(Boolean);

  for (const domain of domains) {
    try {
      const r = await fetch(
        `https://api.mailgun.net/v3/${domain}/stats/total?event=accepted&event=delivered&event=opened&event=clicked&event=failed&duration=${duration}`,
        { headers: { Authorization: auth }, cache: 'no-store' },
      );
      if (r.ok) {
        const d = await r.json();
        for (const s of d.stats || []) {
          stats.sent += s.accepted?.total || 0;
          stats.delivered += s.delivered?.total || 0;
          stats.opened += s.opened?.total || 0;
          stats.clicked += s.clicked?.total || 0;
          stats.failed += (s.failed?.permanent?.total || 0) + (s.failed?.temporary?.total || 0);
        }
      }
    } catch {}
  }

  return stats;
}
