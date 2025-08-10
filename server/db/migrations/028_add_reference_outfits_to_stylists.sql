-- 028_add_reference_outfits_to_stylists.sql
-- Add reference outfit images to AvatarPersona for stylists

-- Add reference_outfits column to AvatarPersona table
ALTER TABLE "AvatarPersona"
ADD COLUMN IF NOT EXISTS reference_outfits JSONB DEFAULT '[]';

-- Update existing stylists to have empty array
UPDATE "AvatarPersona"
SET reference_outfits = '[]'::jsonb
WHERE category = 'stylist' AND reference_outfits IS NULL;

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_avatar_persona_category_reference_outfits 
ON "AvatarPersona"(category) 
WHERE category = 'stylist' AND jsonb_array_length(reference_outfits) > 0;

-- Example structure for reference_outfits:
-- [
--   {
--     "id": "outfit-1",
--     "name": "Casual Summer Look",
--     "imageUrl": "https://storage.example.com/outfits/casual-summer.jpg",
--     "tags": ["casual", "summer", "beach"],
--     "description": "Light blue linen shirt with beige shorts"
--   },
--   {
--     "id": "outfit-2", 
--     "name": "Business Professional",
--     "imageUrl": "https://storage.example.com/outfits/business-pro.jpg",
--     "tags": ["business", "formal", "office"],
--     "description": "Navy blazer with white dress shirt and gray slacks"
--   }
-- ]