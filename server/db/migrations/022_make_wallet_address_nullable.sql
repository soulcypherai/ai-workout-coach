-- 022_make_wallet_address_nullable.sql
-- Make wallet_address nullable to support email-based authentication

-- Remove NOT NULL constraint from wallet_address
ALTER TABLE "User" ALTER COLUMN wallet_address DROP NOT NULL;

-- Update unique constraint to allow multiple NULL values
-- (PostgreSQL allows multiple NULL values in UNIQUE columns by default)

-- Add index for non-null wallet addresses for performance
CREATE INDEX IF NOT EXISTS idx_user_wallet_address_non_null ON "User" (wallet_address) WHERE wallet_address IS NOT NULL;