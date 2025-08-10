-- 019_add_music_fields_to_avatar_persona.sql
-- Add music co-production related fields to AvatarPersona table

ALTER TABLE "AvatarPersona" 
ADD COLUMN IF NOT EXISTS preferred_genres TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS audio_references TEXT[] DEFAULT '{}';

-- Default music preferences for other personas
UPDATE "AvatarPersona" 
SET 
  preferred_genres = ARRAY['pop', 'rock', 'electronic'],
  audio_references = ARRAY[
    'https://fal.media/files/lion/OOTBTSlxKMH_E8H6hoSlb.mpga'
  ]
WHERE category = 'producer' AND (preferred_genres IS NULL OR array_length(preferred_genres, 1) IS NULL); 