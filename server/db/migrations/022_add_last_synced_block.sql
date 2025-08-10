-- Add last_synced_block to SystemSettings for event syncing

-- Ensure setting exists or insert default
INSERT INTO "SystemSettings" (setting_key, setting_value, setting_type)
VALUES ('last_synced_block', '0', 'number')
ON CONFLICT (setting_key) DO NOTHING;
