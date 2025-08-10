-- Migration 012: System Settings Table
-- This table stores system-wide configuration settings

CREATE TABLE IF NOT EXISTS "SystemSettings" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(255) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  setting_type VARCHAR(50) NOT NULL DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default credit pricing settings
INSERT INTO "SystemSettings" (setting_key, setting_value, setting_type, description) VALUES
('credits_usd_price', '0.10', 'number', 'Price per credit in USD'),
('credits_min_purchase', '10', 'number', 'Minimum credits that can be purchased'),
('credits_max_purchase', '1000', 'number', 'Maximum credits that can be purchased'),
('credits_bonus_packages', '[{"credits": 100, "bonus": 10, "price": 9.99}, {"credits": 500, "bonus": 75, "price": 45.99}, {"credits": 1000, "bonus": 200, "price": 79.99}]', 'json', 'Bonus credit packages with bulk discounts')
ON CONFLICT (setting_key) DO NOTHING;

-- Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON "SystemSettings" (setting_key);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_system_settings_updated_at
    BEFORE UPDATE ON "SystemSettings"
    FOR EACH ROW
    EXECUTE FUNCTION update_system_settings_updated_at(); 