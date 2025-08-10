-- Fix music_generations table to properly set UUID as primary key
-- This migration ensures the id column is properly configured as UUID PRIMARY KEY

-- Drop any existing primary key constraint
ALTER TABLE music_generations 
DROP CONSTRAINT IF EXISTS music_generations_pkey;

-- Add primary key constraint to the UUID id column
ALTER TABLE music_generations 
ADD PRIMARY KEY (id);

-- Verify the column type is UUID
-- If it's still showing as SERIAL, we need to ensure it's properly typed
DO $$
BEGIN
    -- Check if the id column is properly typed as UUID
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'music_generations' 
        AND column_name = 'id' 
        AND data_type = 'uuid'
    ) THEN
        RAISE EXCEPTION 'id column is not properly typed as UUID';
    END IF;
END $$; 