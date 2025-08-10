-- Add id_hash column to User table for storing keccak256(uuid) hash

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS id_hash TEXT UNIQUE NULL;