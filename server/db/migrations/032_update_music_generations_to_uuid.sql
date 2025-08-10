-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1️⃣ Rename the existing integer id column to old_id
ALTER TABLE music_generations 
RENAME COLUMN id TO old_id;

-- 2️⃣ Add the new UUID column with default generator
ALTER TABLE music_generations
ADD COLUMN id UUID DEFAULT uuid_generate_v4();

-- 3️⃣ Add unique_id column if it doesn't exist
ALTER TABLE music_generations 
ADD COLUMN IF NOT EXISTS unique_id VARCHAR(255);

-- 4️⃣ Populate UUIDs for existing records
UPDATE music_generations
SET id = uuid_generate_v4()
WHERE id IS NULL;

-- 5️⃣ Make it NOT NULL and ensure uniqueness
ALTER TABLE music_generations 
ALTER COLUMN id SET NOT NULL;

ALTER TABLE music_generations 
ADD CONSTRAINT music_generations_id_unique UNIQUE (id);

-- 6️⃣ Drop the old integer column
ALTER TABLE music_generations
DROP COLUMN old_id;

-- 7️⃣ Update unique_id to match the UUID
UPDATE music_generations
SET unique_id = id::text
WHERE unique_id IS NULL OR unique_id != id::text;

-- 8️⃣ Make unique_id NOT NULL
ALTER TABLE music_generations 
ALTER COLUMN unique_id SET NOT NULL;

-- 9️⃣ Create unique index on unique_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_music_generations_unique_id 
ON music_generations(unique_id);

-- 🔟 Update the trigger function to use simple UUID
CREATE OR REPLACE FUNCTION generate_music_generation_unique_id()
RETURNS TRIGGER AS $$
BEGIN
    -- Generate unique ID: just the UUID itself
    NEW.unique_id := NEW.id::text;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1️⃣1️⃣ Recreate the trigger
DROP TRIGGER IF EXISTS trigger_generate_music_generation_unique_id ON music_generations;
CREATE TRIGGER trigger_generate_music_generation_unique_id
    BEFORE INSERT ON music_generations
    FOR EACH ROW
    EXECUTE FUNCTION generate_music_generation_unique_id(); 