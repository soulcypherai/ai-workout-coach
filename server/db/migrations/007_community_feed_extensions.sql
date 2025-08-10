-- 007_community_feed_extensions.sql
-- Community Feed Implementation: Extend CommunityPost and add CommunityReaction/CommunityComment tables

-- 1.1 Extend CommunityPost table with duration and transcript
ALTER TABLE "CommunityPost"
  ADD COLUMN IF NOT EXISTS duration_sec INTEGER CHECK (duration_sec <= 120),
  ADD COLUMN IF NOT EXISTS transcript TEXT;

-- 1.2 Reactions table (👍 / 👎)
CREATE TABLE IF NOT EXISTS "CommunityReaction" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES "CommunityPost"(id) ON DELETE CASCADE,
  user_id UUID REFERENCES "User"(id) ON DELETE CASCADE,
  value SMALLINT CHECK (value IN (1, -1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- 1.3 Comments table
CREATE TABLE IF NOT EXISTS "CommunityComment" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES "CommunityPost"(id) ON DELETE CASCADE,
  user_id UUID REFERENCES "User"(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_comm_post_created ON "CommunityPost" (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_reaction_post ON "CommunityReaction" (post_id);
CREATE INDEX IF NOT EXISTS idx_comm_comment_post_created ON "CommunityComment" (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_comment_user ON "CommunityComment" (user_id);