-- Migration: Create purchase_logs table for Amazon purchase integration
-- Date: 2025-01-06
-- Description: Creates table to track Amazon purchases via Crossmint & GOAT SDK

CREATE TABLE IF NOT EXISTS purchase_logs (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_asin TEXT NOT NULL,
  call_session_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','completed','failed')),
  tx_hash TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Add foreign key constraints
  CONSTRAINT fk_purchase_logs_user
    FOREIGN KEY (user_id) 
    REFERENCES "User"(id) 
    ON DELETE SET NULL,
    
  CONSTRAINT fk_purchase_logs_call_session
    FOREIGN KEY (call_session_id) 
    REFERENCES "CallSession"(id) 
    ON DELETE CASCADE
);

-- Create unique index to prevent duplicate purchases per session+asin
CREATE UNIQUE INDEX IF NOT EXISTS ux_purchase_session_asin
  ON purchase_logs (call_session_id, product_asin);

-- Create index for lookups by call session
CREATE INDEX IF NOT EXISTS idx_purchase_logs_call_session
  ON purchase_logs (call_session_id);

-- Create index for status lookups
CREATE INDEX IF NOT EXISTS idx_purchase_logs_status
  ON purchase_logs (status);

-- Create index for cleanup operations
CREATE INDEX IF NOT EXISTS idx_purchase_logs_created_at
  ON purchase_logs (created_at);

-- Add comments for documentation
COMMENT ON TABLE purchase_logs IS 'Audit trail for Amazon product purchases via Crossmint';
COMMENT ON COLUMN purchase_logs.order_id IS 'Crossmint order ID for the transaction';
COMMENT ON COLUMN purchase_logs.product_asin IS 'Amazon product identifier (amazon:B...)';
COMMENT ON COLUMN purchase_logs.call_session_id IS 'ID of the call session where purchase was made';
COMMENT ON COLUMN purchase_logs.status IS 'Purchase status: pending, completed, or failed';
COMMENT ON COLUMN purchase_logs.tx_hash IS 'Blockchain transaction hash (optional)';
