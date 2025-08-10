-- 010_credits_system.sql
-- Credits System Implementation

-- Add credits column to User table (separate from meta.points)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 25;

-- Update existing users to have default credits
UPDATE "User" SET credits = 25 WHERE credits IS NULL;

-- Add new credit-related columns to AvatarPersona
ALTER TABLE "AvatarPersona" ADD COLUMN IF NOT EXISTS credit_cost INTEGER DEFAULT 0;
ALTER TABLE "AvatarPersona" ADD COLUMN IF NOT EXISTS per_minute_cost INTEGER DEFAULT 1;

-- Copy existing unlock_points to credit_cost for backwards compatibility
UPDATE "AvatarPersona" SET credit_cost = unlock_points WHERE unlock_points IS NOT NULL AND credit_cost = 0;

-- Create credit transaction tracking table
CREATE TABLE IF NOT EXISTS "CreditTransaction" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES "User"(id) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('purchase', 'spend', 'refund', 'bonus')),
    amount INTEGER NOT NULL, -- positive for credit, negative for debit
    description TEXT,
    stripe_payment_intent_id TEXT,
    avatar_persona_id UUID REFERENCES "AvatarPersona"(id),
    call_session_id UUID REFERENCES "CallSession"(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta JSONB DEFAULT '{}'
);

-- Update CallSession to track credit costs
ALTER TABLE "CallSession" 
ADD COLUMN IF NOT EXISTS credits_spent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS per_minute_rate INTEGER DEFAULT 1;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_credit_transaction_user_id ON "CreditTransaction"(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transaction_created_at ON "CreditTransaction"(created_at);
CREATE INDEX IF NOT EXISTS idx_call_session_credits ON "CallSession"(credits_spent);

-- Add index for credits on User table
CREATE INDEX IF NOT EXISTS idx_user_credits ON "User"(credits); 