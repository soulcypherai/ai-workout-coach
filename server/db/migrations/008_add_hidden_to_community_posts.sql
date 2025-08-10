-- 008_add_hidden_to_community_posts.sql
-- Add soft delete functionality to CommunityPost table

-- Add hidden column for soft delete
ALTER TABLE "CommunityPost"
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;

-- Add index for efficient filtering of visible posts
CREATE INDEX IF NOT EXISTS idx_community_post_hidden ON "CommunityPost" (hidden, created_at DESC) WHERE hidden = FALSE;

-- Add index for admin views to see all posts
CREATE INDEX IF NOT EXISTS idx_community_post_admin ON "CommunityPost" (created_at DESC); 