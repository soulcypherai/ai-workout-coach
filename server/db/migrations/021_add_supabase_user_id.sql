-- 021_add_supabase_user_id.sql
-- Add supabase_user_id column to User table for Supabase authentication migration

ALTER TABLE "User" ADD COLUMN supabase_user_id UUID UNIQUE;

-- Add index for performance (without CONCURRENTLY to allow running in transaction)
CREATE INDEX IF NOT EXISTS idx_user_supabase_user_id ON "User" (supabase_user_id);

-- Add comment for clarity
COMMENT ON COLUMN "User".supabase_user_id IS 'Supabase user UUID for authentication migration from Privy';