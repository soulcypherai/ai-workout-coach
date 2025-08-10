// Feature flags configuration for AI PitchRoom
import dotenv from 'dotenv';

dotenv.config();

export const flags = {
  // Amazon Purchase Integration
  FEAT_AMAZON_PURCHASE_ENABLED: process.env.FEAT_AMAZON_PURCHASE_ENABLED === 'true',
  
  // Purchase Configuration
  PURCHASE_TIMEOUT_MS: parseInt(process.env.PURCHASE_TIMEOUT_MS) || 30000,
  MAX_PURCHASES_PER_SESSION: parseInt(process.env.MAX_PURCHASES_PER_SESSION) || 1,
  
  // Blockchain Configuration
  CDP_WALLET_NETWORK: process.env.CDP_WALLET_NETWORK || 'base-sepolia',
  RPC_PROVIDER_URL: process.env.RPC_PROVIDER_URL || 'https://sepolia.base.org',
  
  // Other existing feature flags can be added here
};

// Helper function to check if a feature is enabled
export const isFeatureEnabled = (featureName) => {
  return flags[featureName] === true;
};

// Helper function to get configuration value
export const getConfig = (configName, defaultValue = null) => {
  return flags[configName] !== undefined ? flags[configName] : defaultValue;
};
