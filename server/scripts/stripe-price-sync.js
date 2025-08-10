#!/usr/bin/env node

/**
 * Stripe Price Synchronization Script
 * 
 * This script fetches all prices from Stripe and ensures they match our database configuration.
 * Run with: node scripts/stripe-price-sync.js
 */

import dotenv from 'dotenv';
import Stripe from 'stripe';
import pool from '../db/index.js';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

/**
 * Fetch all active prices from Stripe
 */
async function fetchStripePrices() {
  const prices = await stripe.prices.list({
    active: true,
    limit: 100,
  });
  
  return prices.data;
}

/**
 * Get credit packages from database
 */
async function getDatabasePackages() {
  const result = await pool.query(
    `SELECT setting_key, setting_value, setting_type
     FROM "SystemSettings"
     WHERE setting_key IN ('credits_usd_price', 'credits_bonus_packages')
     ORDER BY setting_key`
  );
  
  let creditPrice = 0.10;
  let bonusPackages = [];
  
  result.rows.forEach(row => {
    let value = row.setting_value;
    
    if (row.setting_type === 'number') {
      value = parseFloat(value);
    } else if (row.setting_type === 'json') {
      value = JSON.parse(value);
    }
    
    switch (row.setting_key) {
      case 'credits_usd_price':
        creditPrice = value;
        break;
      case 'credits_bonus_packages':
        bonusPackages = value;
        break;
    }
  });
  
  // Generate standard packages
  const standardPackages = [
    { credits: 100, price: 100 * creditPrice },
    { credits: 500, price: 500 * creditPrice },
    { credits: 1000, price: 1000 * creditPrice },
    { credits: 2000, price: 2000 * creditPrice },
  ];
  
  return { standardPackages, bonusPackages, creditPrice };
}

/**
 * Create or update Stripe prices to match database
 */
async function syncPricesToStripe(packages) {
  const stripePrices = await fetchStripePrices();
  const allPackages = [...packages.standardPackages, ...packages.bonusPackages];
  
  console.log('\n🔄 Syncing prices to Stripe...');
  
  for (const pkg of allPackages) {
    const expectedAmount = Math.round(pkg.price * 100); // Convert to cents
    
    // Check if price already exists
    const existingPrice = stripePrices.find(p => 
      p.unit_amount === expectedAmount &&
      p.currency === 'usd' &&
      p.metadata?.credits === pkg.credits.toString()
    );
    
    if (existingPrice) {
      console.log(`✅ Price exists for ${pkg.credits} credits ($${pkg.price}): ${existingPrice.id}`);
      continue;
    }
    
    // Create new price
    try {
      const price = await stripe.prices.create({
        currency: 'usd',
        unit_amount: expectedAmount,
        product_data: {
          name: `${pkg.credits} Credits`,
        },
        metadata: {
          credits: pkg.credits.toString(),
          package_type: pkg.bonus ? 'bonus' : 'standard',
        },
      });
      
      console.log(`✅ Created price for ${pkg.credits} credits ($${pkg.price}): ${price.id}`);
    } catch (error) {
      console.error(`❌ Failed to create price for ${pkg.credits} credits:`, error.message);
    }
  }
}

/**
 * Validate that all database packages have corresponding Stripe prices
 */
async function validatePriceMapping() {
  console.log('\n🔍 Validating price mappings...');
  
  const stripePrices = await fetchStripePrices();
  const packages = await getDatabasePackages();
  const allPackages = [...packages.standardPackages, ...packages.bonusPackages];
  
  let valid = true;
  
  for (const pkg of allPackages) {
    const expectedAmount = Math.round(pkg.price * 100);
    
    const matchingPrice = stripePrices.find(p => 
      p.unit_amount === expectedAmount &&
      p.currency === 'usd' &&
      p.metadata?.credits === pkg.credits.toString()
    );
    
    if (matchingPrice) {
      console.log(`✅ ${pkg.credits} credits ($${pkg.price}) → ${matchingPrice.id}`);
    } else {
      console.error(`❌ No Stripe price found for ${pkg.credits} credits ($${pkg.price})`);
      valid = false;
    }
  }
  
  // Check for orphaned Stripe prices
  const creditsPrices = stripePrices.filter(p => p.metadata?.credits);
  for (const price of creditsPrices) {
    const credits = parseInt(price.metadata.credits);
    const priceUsd = price.unit_amount / 100;
    
    const matchingPackage = allPackages.find(p => 
      p.credits === credits && 
      Math.abs(p.price - priceUsd) < 0.01 // Allow for small rounding differences
    );
    
    if (!matchingPackage) {
      console.warn(`⚠️  Orphaned Stripe price: ${credits} credits ($${priceUsd}) → ${price.id}`);
    }
  }
  
  return valid;
}

/**
 * Generate price mapping for frontend/backend use
 */
async function generatePriceMapping() {
  const stripePrices = await fetchStripePrices();
  const packages = await getDatabasePackages();
  const allPackages = [...packages.standardPackages, ...packages.bonusPackages];
  
  const mapping = {};
  
  for (const pkg of allPackages) {
    const expectedAmount = Math.round(pkg.price * 100);
    
    const matchingPrice = stripePrices.find(p => 
      p.unit_amount === expectedAmount &&
      p.currency === 'usd' &&
      p.metadata?.credits === pkg.credits.toString()
    );
    
    if (matchingPrice) {
      mapping[pkg.credits] = {
        priceId: matchingPrice.id,
        credits: pkg.credits,
        priceUsd: pkg.price,
        isPopular: pkg.isPopular || false,
        bonus: pkg.bonus || false,
      };
    }
  }
  
  return mapping;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🧪 Stripe Price Sync & Validation\n');
    
    // Environment validation
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }
    
    const isTestMode = process.env.STRIPE_SECRET_KEY.startsWith('sk_test_');
    console.log(`🔧 Mode: ${isTestMode ? 'TEST' : 'LIVE'}`);
    
    // Get current state
    const packages = await getDatabasePackages();
    console.log(`📦 Found ${packages.standardPackages.length} standard packages and ${packages.bonusPackages.length} bonus packages`);
    console.log(`💰 Credit price: $${packages.creditPrice} per credit`);
    
    // Sync prices to Stripe
    await syncPricesToStripe(packages);
    
    // Validate mappings
    const isValid = await validatePriceMapping();
    
    if (isValid) {
      console.log('\n✅ All price mappings are valid!');
      
      // Generate mapping for use in code
      const mapping = await generatePriceMapping();
      console.log('\n📋 Price mapping (for use in code):');
      console.log(JSON.stringify(mapping, null, 2));
      
    } else {
      console.log('\n❌ Some price mappings are invalid. Please fix before going to production.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
} 