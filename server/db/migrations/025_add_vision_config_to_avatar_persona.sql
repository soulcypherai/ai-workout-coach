-- 025_add_vision_config_to_avatar_persona.sql
-- Add vision configuration fields to AvatarPersona table

ALTER TABLE "AvatarPersona" 
ADD COLUMN IF NOT EXISTS vision_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS vision_capture_interval INTEGER DEFAULT 5;

-- Add comments to document the fields
COMMENT ON COLUMN "AvatarPersona".vision_enabled IS 'Whether vision capture is enabled for this persona';
COMMENT ON COLUMN "AvatarPersona".vision_capture_interval IS 'How frequently to capture images in seconds (default: 5)';

-- Update existing personas to have vision disabled by default
UPDATE "AvatarPersona" 
SET vision_enabled = false,
    vision_capture_interval = 5
WHERE vision_enabled IS NULL;