import { NextRequest } from 'next/server';
import { getAuthenticatedUser, isAdmin } from '@/lib/team-auth';
import { db } from '@/lib/db';
import { knowledgeEntries } from '@/lib/schema';
import {
  runClaudeHttp,
  processOutput,
  flattenList,
  extractVideoId,
  canonicalYoutubeUrl,
  extractWithMapReduce,
} from './lib.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// streaming version of /ingest. emits server-sent events so the form can
// show progress (chunk extraction, reduce, upsert) as it happens.
// final event is "result" with the same payload the non-streaming route
// would have returned. errors become "error" events; the connection
// closes cleanly either way.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!isAdmin(user)) {
    return new Response('unauthorized', { status: 401 });
  }

  let body: {
    corpus?: 'growth' | 'brain';
    url?: string;
    transcript?: string;
    channel?: string;
    meta?: {
      title?: string;
      channel?: string;
      guest?: string;
      duration?: string;
      description?: string;
    };
  };
  try {
    body = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const corpus = body.corpus;
  const url = body.url?.trim();
  const transcript = body.transcript;
  const channel = body.channel?.trim() || undefined;
  if (!corpus || (corpus !== 'growth' && corpus !== 'brain')) {
    return new Response('corpus must be growth|brain', { status: 400 });
  }
  if (!url) return new Response('url required', { status: 400 });
  if (!transcript || transcript.trim().length < 50) {
    return new Response('transcript required (min 50 chars)', { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response('ANTHROPIC_API_KEY not configured', { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        send('log', { msg: 'starting' });
        const today = new Date().toISOString().slice(0, 10);
        const videoId = extractVideoId(url);
        const runner = (p: string) =>
          runClaudeHttp(p, { apiKey: process.env.ANTHROPIC_API_KEY });

        const raw = await extractWithMapReduce({
          corpus,
          url,
          transcript,
          channel,
          today,
          meta: body.meta,
          runner,
          onLog: (msg: string) => send('log', { msg }),
        });
        send('log', { msg: 'parsing output' });

        const { output, parsed, stem, frontmatterRaw, body: markdownBody, structured } = processOutput({
          raw,
          corpus,
          channel,
          today,
          videoId,
        });
        send('parsed', { parsed, structured });

        const row = {
          slug: stem,
          corpus,
          channel: parsed.channel || channel || 'unknown',
          guest: parsed.guest || '',
          title: parsed.title || 'untitled',
          url: canonicalYoutubeUrl(parsed.url || url),
          duration: parsed.duration || '',
          ingestedDate: parsed.ingested || today,
          vertical: typeof parsed.vertical === 'string' ? parsed.vertical : '',
          subvertical: typeof parsed.subvertical === 'string' ? parsed.subvertical : '',
          secondaryVerticals: flattenList(parsed.secondary_verticals),
          businessArea: flattenList(parsed.business_area),
          stage: flattenList(parsed.stage),
          surface: flattenList(parsed.surface),
          tags: flattenList(parsed.tags),
          body: markdownBody,
          frontmatterRaw,
          keyClaims: structured?.keyClaims || [],
          prescriptions: structured?.prescriptions || [],
          entities: structured?.entities || [],
          references: structured?.references || [],
        };

        send('log', { msg: 'upserting row' });
        const [entry] = await db
          .insert(knowledgeEntries)
          .values(row)
          .onConflictDoUpdate({
            target: knowledgeEntries.slug,
            set: {
              channel: row.channel,
              guest: row.guest,
              title: row.title,
              url: row.url,
              duration: row.duration,
              ingestedDate: row.ingestedDate,
              vertical: row.vertical,
              subvertical: row.subvertical,
              secondaryVerticals: row.secondaryVerticals,
              businessArea: row.businessArea,
              stage: row.stage,
              surface: row.surface,
              tags: row.tags,
              body: row.body,
              frontmatterRaw: row.frontmatterRaw,
              keyClaims: row.keyClaims,
              prescriptions: row.prescriptions,
              entities: row.entities,
              references: row.references,
            },
          })
          .returning();

        send('result', {
          ok: true,
          entry: {
            id: entry.id,
            slug: entry.slug,
            corpus: entry.corpus,
            title: entry.title,
            channel: entry.channel,
            url: entry.url,
            ingested: entry.ingestedDate,
          },
          parsed,
          structured,
          output,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[knowledge/ingest-stream] failed:', message);
        send('error', { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
