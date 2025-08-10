-- Remove the redundant unique_id column from music_generations
-- Since the UUID id is already unique, we don't need both

-- Drop the trigger first
DROP TRIGGER IF EXISTS trigger_generate_music_generation_unique_id ON music_generations;

-- Drop the function
DROP FUNCTION IF EXISTS generate_music_generation_unique_id();

-- Drop the unique index on unique_id
DROP INDEX IF EXISTS idx_music_generations_unique_id;

-- Drop the unique_id column
ALTER TABLE music_generations 
DROP COLUMN unique_id; 