-- Step 1: pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Enums
DO $$ BEGIN
  CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PRO', 'TEAM', 'ENTERPRISE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RepositoryScanStatus" AS ENUM ('IDLE', 'QUEUED', 'SCANNING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Step 3: Convert User.id TEXT -> UUID
ALTER TABLE "User" ALTER COLUMN "id" TYPE UUID USING "id"::UUID;

-- Step 4: Patch existing User table (add all missing columns)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "githubId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_githubId_key" ON "User"("githubId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- Step 5: Repository table
CREATE TABLE "Repository" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "githubUrl" TEXT NOT NULL,
    "defaultBranch" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "lastScannedAt" TIMESTAMP(3),
    "scanStatus" "RepositoryScanStatus" NOT NULL DEFAULT 'IDLE',
    "scanProgress" INTEGER NOT NULL DEFAULT 0,
    "filesDiscovered" INTEGER NOT NULL DEFAULT 0,
    "filesProcessed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Repository_userId_idx" ON "Repository"("userId");
CREATE INDEX "Repository_userId_scanStatus_idx" ON "Repository"("userId", "scanStatus");
CREATE INDEX "Repository_lastScannedAt_idx" ON "Repository"("lastScannedAt");
CREATE UNIQUE INDEX "Repository_userId_githubUrl_key" ON "Repository"("userId", "githubUrl");
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 6: CodeDocument table
CREATE TABLE "CodeDocument" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "repositoryId" UUID NOT NULL,
    "filePath" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "embedding" vector(768),
    "embeddingModel" TEXT,
    "embeddingDimensions" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CodeDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CodeDocument_repositoryId_filePath_idx" ON "CodeDocument"("repositoryId", "filePath");
CREATE INDEX "CodeDocument_repositoryId_contentHash_idx" ON "CodeDocument"("repositoryId", "contentHash");
CREATE INDEX "CodeDocument_repositoryId_language_idx" ON "CodeDocument"("repositoryId", "language");
CREATE UNIQUE INDEX "CodeDocument_repositoryId_filePath_chunkIndex_key"
    ON "CodeDocument"("repositoryId", "filePath", "chunkIndex");
CREATE INDEX "idx_code_documents_embedding"
    ON "CodeDocument" USING hnsw (embedding vector_cosine_ops);
ALTER TABLE "CodeDocument" ADD CONSTRAINT "CodeDocument_repositoryId_fkey"
    FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
