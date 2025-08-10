-- Create SessionRecording table to store all user recordings
CREATE TABLE IF NOT EXISTS "SessionRecording" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    avatar_id UUID NOT NULL REFERENCES "AvatarPersona"(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    duration_sec INTEGER NOT NULL DEFAULT 0,
    file_size BIGINT NOT NULL DEFAULT 0,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add recording_id to CommunityPost to link to recordings
ALTER TABLE "CommunityPost" 
ADD COLUMN IF NOT EXISTS recording_id UUID REFERENCES "SessionRecording"(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_session_recording_user_id ON "SessionRecording"(user_id);
CREATE INDEX IF NOT EXISTS idx_session_recording_created_at ON "SessionRecording"(created_at);
CREATE INDEX IF NOT EXISTS idx_session_recording_session_id ON "SessionRecording"(session_id);
CREATE INDEX IF NOT EXISTS idx_community_post_recording_id ON "CommunityPost"(recording_id);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_session_recording_updated_at 
    BEFORE UPDATE ON "SessionRecording" 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 