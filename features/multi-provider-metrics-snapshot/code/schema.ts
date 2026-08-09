import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

// Team state: cached metrics, dashboards, and other team-console blobs that
// originate outside the app (background syncs, cron snapshots). Keyed by
// short string. Written by background jobs (e.g. the marketing-snapshot
// cron), read by team console pages on each request (force-dynamic).
//
// One generic KV table instead of a table per snapshot type: every new
// cached blob is just a new key, no migration.
export const teamState = pgTable('team_state', {
  key: text('key').primaryKey(),
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
