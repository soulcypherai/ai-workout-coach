-- 020_remove_community_post_duration_constraint.sql
-- Remove the duration constraint from CommunityPost to allow longer recordings

-- Drop the existing constraint
ALTER TABLE "CommunityPost" DROP CONSTRAINT IF EXISTS "CommunityPost_duration_sec_check";

-- Add the column back without the constraint
ALTER TABLE "CommunityPost" ALTER COLUMN duration_sec TYPE INTEGER; 