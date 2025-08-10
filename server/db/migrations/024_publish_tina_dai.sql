-- Publish Tina Dai as a music producer avatar
UPDATE "AvatarPersona"
SET 
  is_published = TRUE,
  category = 'producer'
WHERE name = 'Tina Dai';
