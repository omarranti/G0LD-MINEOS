import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { knowledgeEntries } from '@/lib/schema';

export type Corpus = 'growth' | 'brain';

export type KnowledgeEntry = {
  slug: string;
  corpus: Corpus;
  channel: string;
  guest: string;
  title: string;
  url: string;
  duration: string;
  ingested: string;
  vertical: string;
  subvertical: string;
  secondary_verticals: string[];
  business_area: string[];
  stage: string[];
  surface: string[];
  tags: string[];
  body: string;
  keyClaims: string[];
  prescriptions: string[];
  entities: string[];
  references: string[];
};

function asStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

function splitList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function loadAllEntries(): Promise<KnowledgeEntry[]> {
  const rows = await db
    .select()
    .from(knowledgeEntries)
    .orderBy(desc(knowledgeEntries.ingestedDate), desc(knowledgeEntries.createdAt));

  return rows.map((row) => {
    const corpus = (row.corpus === 'brain' ? 'brain' : 'growth') as Corpus;
    const tags = splitList(row.tags);
    const keyClaims = asStringArray(row.keyClaims);
    const entities = asStringArray(row.entities);
    return {
      slug: row.slug,
      corpus,
      channel: row.channel ?? '',
      guest: row.guest ?? '',
      title: row.title ?? '',
      url: row.url ?? '',
      duration: row.duration ?? '',
      ingested: row.ingestedDate ?? '',
      vertical: row.vertical ?? '',
      subvertical: row.subvertical ?? '',
      secondary_verticals: splitList(row.secondaryVerticals),
      business_area: splitList(row.businessArea),
      stage: splitList(row.stage),
      surface: splitList(row.surface),
      tags,
      body: row.body ?? '',
      keyClaims,
      prescriptions: asStringArray(row.prescriptions),
      entities,
      references: asStringArray(row.references),
    };
  });
}

export function collectFacets(entries: KnowledgeEntry[]) {
  const counts = (
    key: 'corpus' | 'vertical' | 'subvertical' | 'business_area' | 'stage' | 'surface' | 'tags',
  ) => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const values =
        key === 'corpus' ? [e.corpus] :
        key === 'vertical' ? (e.vertical ? [e.vertical] : []) :
        key === 'subvertical' ? (e.subvertical ? [e.subvertical] : []) :
        (e[key] as string[]);
      for (const v of values) {
        map.set(v, (map.get(v) ?? 0) + 1);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }));
  };
  return {
    corpus: counts('corpus'),
    vertical: counts('vertical'),
    subvertical: counts('subvertical'),
    business_area: counts('business_area'),
    stage: counts('stage'),
    surface: counts('surface'),
    tags: counts('tags'),
  };
}
