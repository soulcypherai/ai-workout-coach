-- 028_increase_default_credits.sql
-- Increase default credits to ensure users can always start their first session

-- Change default credits for new users to 50 (enough for at least 5 minutes on most avatars)
ALTER TABLE "User" ALTER COLUMN credits SET DEFAULT 50;

-- Give existing users with 0 credits the new default amount
UPDATE "User" SET credits = 50 WHERE credits = 0;