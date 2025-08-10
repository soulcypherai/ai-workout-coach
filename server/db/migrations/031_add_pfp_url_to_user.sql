-- Migration: Add pfp_url field to User table
-- Date: 2024-12-19
-- Description: Adds a profile picture URL field to the users table for storing user profile images

ALTER TABLE "User" 
ADD COLUMN pfp_url TEXT;
-- Add comment to document the field
COMMENT ON COLUMN "User".pfp_url IS 'Profile picture URL for the user'; 
