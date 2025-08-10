-- Migration to consolidate 'coach' category into 'fitness'
-- This ensures all fitness/coach personas use the same category value

-- Update any personas using 'coach' category to 'fitness'
UPDATE "AvatarPersona"
SET category = 'fitness'
WHERE category = 'coach';

-- Log the change
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count > 0 THEN
    RAISE NOTICE 'Updated % personas from category "coach" to "fitness"', updated_count;
  END IF;
END $$;