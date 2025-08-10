-- 005_add_updated_at_to_avatar_persona.sql
-- Add updated_at column to AvatarPersona table (if not exists)

ALTER TABLE "AvatarPersona" 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Set updated_at to created_at for existing records
UPDATE "AvatarPersona" 
SET updated_at = created_at 
WHERE updated_at IS NULL; 