-- 013_simplify_pricing_model.sql
-- Simplify pricing model to use only pricing_per_min

-- Remove unused credit-related columns from AvatarPersona
ALTER TABLE "AvatarPersona" DROP COLUMN IF EXISTS credit_cost;
ALTER TABLE "AvatarPersona" DROP COLUMN IF EXISTS per_minute_cost;
ALTER TABLE "AvatarPersona" DROP COLUMN IF EXISTS unlock_points;

-- Remove unused columns from CallSession
ALTER TABLE "CallSession" DROP COLUMN IF EXISTS per_minute_rate;

-- Update all personas to ensure they have proper pricing_per_min values
UPDATE "AvatarPersona" 
SET pricing_per_min = COALESCE(pricing_per_min, 1)
WHERE pricing_per_min IS NULL OR pricing_per_min = 0; 