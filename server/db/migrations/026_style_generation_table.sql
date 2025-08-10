-- Create table for storing style generation requests and results
CREATE TABLE IF NOT EXISTS style_generations (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    avatar_id UUID NOT NULL REFERENCES "AvatarPersona"(id),
    user_id UUID REFERENCES "User"(id),
    original_image_url TEXT NOT NULL,
    generated_image_url TEXT NOT NULL,
    prompt TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_style_generations_session_id ON style_generations(session_id);
CREATE INDEX IF NOT EXISTS idx_style_generations_avatar_id ON style_generations(avatar_id);
CREATE INDEX IF NOT EXISTS idx_style_generations_user_id ON style_generations(user_id);
CREATE INDEX IF NOT EXISTS idx_style_generations_created_at ON style_generations(created_at);