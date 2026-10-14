-- Code-aware lexical search index, written by the scanner (index format 3).
-- Repositories are re-scanned in full the next time they are scanned, which fills the column;
-- until then search falls back to substring matching.
ALTER TABLE "CodeDocument" ADD COLUMN IF NOT EXISTS "searchTokens" tsvector;
CREATE INDEX IF NOT EXISTS "idx_code_documents_search" ON "CodeDocument" USING GIN ("searchTokens");
