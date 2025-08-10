-- Up migration for Music Generation tracking
CREATE TABLE IF NOT EXISTS music_generations (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    avatar_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255),
    generation_type VARCHAR(50) NOT NULL CHECK (generation_type IN ('lyrics', 'remix')),
    
    -- Input data stored as JSON
    input_lyrics TEXT,
    input_genres TEXT[], -- Array of genre strings
    input_audio_url TEXT,
    reference_audio_url TEXT,
    
    -- Output data
    output_audio_url TEXT,
    fal_request_id VARCHAR(255),
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_music_generations_user_id ON music_generations(user_id);
CREATE INDEX IF NOT EXISTS idx_music_generations_avatar_id ON music_generations(avatar_id);
CREATE INDEX IF NOT EXISTS idx_music_generations_session_id ON music_generations(session_id);
CREATE INDEX IF NOT EXISTS idx_music_generations_status ON music_generations(status);
CREATE INDEX IF NOT EXISTS idx_music_generations_created_at ON music_generations(created_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_music_generations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_music_generations_updated_at
    BEFORE UPDATE ON music_generations
    FOR EACH ROW
    EXECUTE FUNCTION update_music_generations_updated_at(); 