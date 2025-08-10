-- 001_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 3.1. User Table
CREATE TABLE "User" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT UNIQUE NOT NULL,
    privy_user_id TEXT UNIQUE,
    handle TEXT,
    "role" TEXT NOT NULL DEFAULT 'user', -- Simplified ENUM for SQL
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta JSONB DEFAULT '{}'
);

-- 3.2. AvatarPersona Table
CREATE TABLE "AvatarPersona" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    system_prompt TEXT,
    personality JSONB DEFAULT '{}',
    voice_id TEXT,
    model_uri TEXT,
    pricing_per_min INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta JSONB DEFAULT '{}'
);

-- 3.3. CallSession Table
CREATE TABLE "CallSession" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES "User"(id),
    avatar_id UUID REFERENCES "AvatarPersona"(id),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    points_spent INT,
    meta JSONB DEFAULT '{}'
);

-- 3.4. Payment Table
CREATE TABLE "Payment" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES "User"(id),
    tx_hash TEXT,
    amount DECIMAL,
    usage_sec INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta JSONB DEFAULT '{}'
);

-- 3.5. LeaderboardSnapshot Table
CREATE TABLE "LeaderboardSnapshot" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period TEXT,
    user_id UUID REFERENCES "User"(id),
    score INT,
    rank INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta JSONB DEFAULT '{}'
);

-- 3.6. Project Table
CREATE TABLE "Project" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES "User"(id),
    kind TEXT,
    slug TEXT UNIQUE,
    title TEXT,
    summary TEXT,
    cover_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta JSONB DEFAULT '{}'
);

-- 3.7. CommunityPost Table
CREATE TABLE "CommunityPost" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES "CallSession"(id),
    project_id UUID REFERENCES "Project"(id),
    video_url TEXT,
    thumbnail_url TEXT,
    posted_by UUID REFERENCES "User"(id),
    vote_score INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta JSONB DEFAULT '{}'
);

-- 3.8. Episode Table
CREATE TABLE "Episode" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scheduled_at TIMESTAMPTZ,
    status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta JSONB DEFAULT '{}'
);

-- 3.9. RewardPool & RewardShare Tables
CREATE TABLE "RewardPool" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    episode_id UUID REFERENCES "Episode"(id),
    total_shark INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta JSONB DEFAULT '{}'
);

CREATE TABLE "RewardShare" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reward_pool_id UUID REFERENCES "RewardPool"(id),
    user_id UUID REFERENCES "User"(id),
    ratio DECIMAL,
    shark_amount INT,
    meta JSONB DEFAULT '{}'
);

-- 3.10. EpisodeVerdict Table
CREATE TABLE "EpisodeVerdict" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    episode_id UUID REFERENCES "Episode"(id),
    project_id UUID REFERENCES "Project"(id),
    judge_id UUID REFERENCES "User"(id),
    verdict TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta JSONB DEFAULT '{}'
);

-- 3.11. ProjectVote Table
CREATE TABLE "ProjectVote" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES "Project"(id),
    voter_id UUID REFERENCES "User"(id),
    value SMALLINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta JSONB DEFAULT '{}'
);

-- Indexes for foreign keys and common lookups
CREATE INDEX ON "CallSession" (user_id);
CREATE INDEX ON "Payment" (user_id);
CREATE INDEX ON "Project" (owner_id);
CREATE INDEX ON "CommunityPost" (project_id);
CREATE INDEX ON "CommunityPost" (posted_by);
CREATE INDEX ON "EpisodeVerdict" (episode_id);
CREATE INDEX ON "EpisodeVerdict" (project_id);
CREATE INDEX ON "ProjectVote" (project_id);
CREATE INDEX ON "ProjectVote" (voter_id); 