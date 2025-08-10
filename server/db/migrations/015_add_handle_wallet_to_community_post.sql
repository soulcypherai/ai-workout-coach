-- 015_add_handle_wallet_to_community_post.sql
-- Adds handle and wallet_address columns to CommunityPost for denormalised feed display

ALTER TABLE "CommunityPost"
  ADD COLUMN IF NOT EXISTS handle TEXT,
  ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- Backfill existing rows using related User data
-- (run only if the columns were newly created)
UPDATE "CommunityPost" cp
SET handle = u.handle,
    wallet_address = u.wallet_address
FROM "User" u
WHERE cp.posted_by = u.id
  AND (cp.handle IS NULL OR cp.wallet_address IS NULL); 