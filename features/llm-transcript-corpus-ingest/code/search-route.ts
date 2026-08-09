import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isAdmin } from '@/lib/team-auth';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// full-text search over knowledge_entries.search_tsv (a generated tsvector
// covering title, channel, guest, tags, structured fields, and body, with
// weights A..D so a hit in the title outranks a buried mention in the body).
// uses websearch_to_tsquery so users can type natural phrases including
// quoted strings ("nervous system" recovery) and OR fallback when no hits.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { query?: string; corpus?: 'growth' | 'brain'; limit?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const query = body.query?.trim();
  const corpus = body.corpus;
  const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 50);
  if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 });

  const corpusFilter = corpus ? sql`AND corpus = ${corpus}` : sql``;

  // primary: weighted full-text match.
  const rows = await db.execute(sql`
    SELECT id, slug, corpus, title, channel, guest, url, ingested_date,
           vertical, subvertical, tags,
           ts_rank(search_tsv, websearch_to_tsquery('english', ${query})) AS rank
    FROM knowledge_entries
    WHERE search_tsv @@ websearch_to_tsquery('english', ${query})
    ${corpusFilter}
    ORDER BY rank DESC, ingested_date DESC
    LIMIT ${limit}
  `);

  if (rows.length > 0) {
    return NextResponse.json({ ok: true, mode: 'tsvector', results: rows });
  }

  // fallback: prefix-match each word as a tsquery (handles typos less, but
  // catches partial words like "stress-" -> "stresses" / "stressors").
  const prefixQuery = query
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, '') + ':*')
    .join(' & ');

  if (prefixQuery) {
    const prefixRows = await db.execute(sql`
      SELECT id, slug, corpus, title, channel, guest, url, ingested_date,
             vertical, subvertical, tags,
             ts_rank(search_tsv, to_tsquery('english', ${prefixQuery})) AS rank
      FROM knowledge_entries
      WHERE search_tsv @@ to_tsquery('english', ${prefixQuery})
      ${corpusFilter}
      ORDER BY rank DESC, ingested_date DESC
      LIMIT ${limit}
    `);
    if (prefixRows.length > 0) {
      return NextResponse.json({ ok: true, mode: 'tsvector-prefix', results: prefixRows });
    }
  }

  // last-resort: substring fallback for queries that miss both the
  // primary and prefix forms (e.g. unusual punctuation, code identifiers).
  const pattern = `%${query.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const fallback = await db.execute(sql`
    SELECT id, slug, corpus, title, channel, guest, url, ingested_date,
           vertical, subvertical, tags,
           NULL AS rank
    FROM knowledge_entries
    WHERE (title ILIKE ${pattern} OR body ILIKE ${pattern} OR tags ILIKE ${pattern})
    ${corpusFilter}
    ORDER BY ingested_date DESC
    LIMIT ${limit}
  `);
  return NextResponse.json({ ok: true, mode: 'ilike', results: fallback });
}
