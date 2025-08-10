-- Up migration for adding coin tracking to music_generations table
ALTER TABLE music_generations 
ADD COLUMN is_coined BOOLEAN DEFAULT FALSE,
ADD COLUMN coin_address VARCHAR(255) DEFAULT NULL,
ADD COLUMN metadata JSONB DEFAULT NULL;

-- Create index for coin_address for efficient lookups
CREATE INDEX IF NOT EXISTS idx_music_generations_coin_address ON music_generations(coin_address);

-- Create index for is_coined for filtering coined music
CREATE INDEX IF NOT EXISTS idx_music_generations_is_coined ON music_generations(is_coined);

-- Add comment to describe the metadata structure
COMMENT ON COLUMN music_generations.metadata IS 'Stores coin metadata with structure: {title: string, cover: string}'; 