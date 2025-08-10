-- 009_fix_null_handles.sql
-- Fix existing users with NULL handles by generating default handles

UPDATE "User" 
SET handle = CONCAT('user_', SUBSTRING(wallet_address, 3, 6), SUBSTRING(wallet_address, LENGTH(wallet_address) - 3, 4))
WHERE handle IS NULL AND wallet_address IS NOT NULL;