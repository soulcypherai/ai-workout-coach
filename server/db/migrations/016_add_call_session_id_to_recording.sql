-- 016_add_call_session_id_to_recording.sql
-- Add call_session_id to SessionRecording to link directly to CallSession

ALTER TABLE "SessionRecording" 
ADD COLUMN IF NOT EXISTS call_session_id UUID REFERENCES "CallSession"(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_session_recording_call_session_id ON "SessionRecording"(call_session_id); 