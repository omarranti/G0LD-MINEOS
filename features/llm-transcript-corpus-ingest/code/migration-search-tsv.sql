-- native postgres full-text search over the corpus.
-- for a small corpus (hundreds of entries) whose queries are keyword/concept
-- based, not paraphrase recall, tsvector + GIN gives stemming, stopword
-- removal, and ranked results with zero external api calls. embeddings can be
-- added later if a real semantic-recall use case emerges.

-- generated tsvector covering title, channel, guest, body, tags, and the
-- structured extractions. weights bias matches in the title/channel above
-- the body so a hit on a strong field outranks a buried mention.
ALTER TABLE "knowledge_entries"
  ADD COLUMN IF NOT EXISTS "search_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(channel, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(guest, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(tags, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(key_claims::text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(prescriptions::text, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(entities::text, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS "knowledge_entries_search_tsv_idx"
  ON "knowledge_entries" USING GIN ("search_tsv");
