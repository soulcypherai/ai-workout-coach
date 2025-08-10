-- Add frontend-related fields to AvatarPersona table
ALTER TABLE "AvatarPersona" 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS x_url TEXT,
ADD COLUMN IF NOT EXISTS unlock_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Update existing personas with data from frontend
UPDATE "AvatarPersona" 
SET 
  description = 'Founder of Base',
  x_url = 'https://x.com/jessepollak',
  unlock_points = 15,
  is_published = TRUE,
  image_url = '/assets/png/avatar-jesse.png'
WHERE name = 'Jesse Pollak - Creator of Base';

UPDATE "AvatarPersona" 
SET 
  description = 'Investor at Coinbase Ventures',
  x_url = 'https://x.com/jonathankingvc',
  unlock_points = 22,
  is_published = TRUE,
  image_url = '/assets/png/avatar-jonathan.jpg'
WHERE name = 'Jonathan King';

UPDATE "AvatarPersona" 
SET 
  description = 'Partner at Dragonfly',
  x_url = 'https://x.com/kapursanat',
  unlock_points = 35,
  is_published = TRUE,
  image_url = '/assets/png/avatar-sanat.jpg'
WHERE name = 'Sanat Kapur - Partner at Dragonfly';

UPDATE "AvatarPersona" 
SET 
  description = 'Investor at Blockchain Capital',
  x_url = 'https://x.com/DjSterlingC',
  unlock_points = 28,
  is_published = TRUE,
  image_url = '/assets/png/avatar-sterling.jpg'
WHERE name = 'Sterling Campbell';

-- Add one more published avatar from existing data
UPDATE "AvatarPersona" 
SET 
  description = 'Head of AI & DePIN',
  x_url = 'https://x.com/lucacurran',
  unlock_points = 20,
  is_published = TRUE,
  image_url = '/assets/png/placeholder-agent.png'
WHERE name = 'Luca Curran - Head of AI & DePIN';