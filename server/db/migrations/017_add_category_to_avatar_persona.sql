-- Add category field to AvatarPersona table
ALTER TABLE "AvatarPersona" 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'vc';

-- Update existing personas to be VCs
UPDATE "AvatarPersona" 
SET category = 'vc' 
WHERE category IS NULL;