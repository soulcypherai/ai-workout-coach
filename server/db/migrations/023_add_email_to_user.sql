-- 023_add_email_to_user.sql
-- Add email column to User table and migrate existing emails from meta field

-- Add email column
ALTER TABLE "User" ADD COLUMN email TEXT;

-- Copy emails from meta JSONB field to the new email column
UPDATE "User" 
SET email = meta->>'email' 
WHERE meta->>'email' IS NOT NULL;

-- Add index for email lookups (performance)
CREATE INDEX IF NOT EXISTS idx_user_email ON "User" (email);

-- Add comment for clarity
COMMENT ON COLUMN "User".email IS 'User email address migrated from meta field for better performance and querying';