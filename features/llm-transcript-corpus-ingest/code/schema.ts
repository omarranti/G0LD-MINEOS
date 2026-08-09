import { pgTable, text, timestamp, serial, jsonb } from 'drizzle-orm/pg-core';

// Knowledge entries: persistence for the team-console transcript ingest.
// One row per ingested video; body holds the markdown summary minus frontmatter.
//
// NOTE: the `search_tsv` generated tsvector column and its GIN index are NOT in
// this drizzle schema (drizzle can't express GENERATED ALWAYS AS). They are
// created by the raw migration in migration-search-tsv.sql. Run it after the
// table exists or search-route.ts will error on a missing column.
export const knowledgeEntries = pgTable('knowledge_entries', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  corpus: text('corpus').notNull(),              // growth | brain (rename to your corpora)
  channel: text('channel').notNull(),
  guest: text('guest').default(''),
  title: text('title').notNull(),
  url: text('url').notNull(),
  duration: text('duration').default(''),
  ingestedDate: text('ingested_date').notNull(), // YYYY-MM-DD
  vertical: text('vertical').default(''),               // top level of your taxonomy
  subvertical: text('subvertical').default(''),         // varies by vertical
  secondaryVerticals: text('secondary_verticals').default(''), // comma-joined "vertical/subvertical" pairs
  businessArea: text('business_area').default(''), // comma-joined
  stage: text('stage').default(''),
  surface: text('surface').default(''),
  tags: text('tags').default(''),
  body: text('body').notNull(),
  frontmatterRaw: text('frontmatter_raw').default(''),
  // structured extractions. populated by the ingest model in addition to the
  // free-text body. each is an array of short strings; jsonb so we can index
  // and query without parsing markdown back.
  // keyClaims: testable assertions the speaker makes (with optional citation).
  // prescriptions: concrete things the product team could do as a result.
  // entities: people, companies, products, papers mentioned.
  // references: external sources (papers, books, urls) the speaker cites.
  keyClaims: jsonb('key_claims').default([]).notNull(),
  prescriptions: jsonb('prescriptions').default([]).notNull(),
  entities: jsonb('entities').default([]).notNull(),
  references: jsonb('references').default([]).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
