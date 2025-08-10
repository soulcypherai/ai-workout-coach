-- Add a transcript column to the CallSession table to store conversation history
ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "transcript" JSONB;

-- Add a foreign key to the Project table to link it to a CallSession
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "call_session_id" UUID;

-- Add the foreign key constraint only if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_call_session'
  ) THEN
    ALTER TABLE "Project" ADD CONSTRAINT "fk_project_call_session"
      FOREIGN KEY ("call_session_id")
      REFERENCES "CallSession" ("id")
      ON DELETE CASCADE;
  END IF;
END$$;

-- Optional: Add an index for faster lookups
CREATE INDEX IF NOT EXISTS "idx_project_call_session_id" ON "Project" ("call_session_id");
