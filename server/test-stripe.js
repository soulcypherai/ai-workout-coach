#!/usr/bin/env node

/**
 * Stripe Integration Test Script
 * 
 * This script tests the Stripe integration without UI
 * Run with: node test-stripe.js
 */

import dotenv from 'dotenv';
import Stripe from 'stripe';

dotenv.config();

const requiredEnvVars = [
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY'
];

console.log('🧪 Testing Stripe Integration...\n');

// Check environment variables
console.log('1. Checking environment variables...');
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\nPlease add these to your server/.env file');
  process.exit(1);
}

console.log('✅ All required environment variables found');

// Test Stripe connection
console.log('\n2. Testing Stripe connection...');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

try {
  // Test retrieving account info
  const account = await stripe.accounts.retrieve();
  const isTestMode = process.env.STRIPE_SECRET_KEY.startsWith('sk_test_');
  
  console.log('✅ Successfully connected to Stripe');
  console.log(`   Account ID: ${account.id}`);
  console.log(`   Mode: ${isTestMode ? 'Test' : 'Live'}`);
  console.log(`   Country: ${account.country}`);
  console.log(`   Email: ${account.email || 'Not set'}`);
  
  if (!isTestMode) {
    console.warn('⚠️  WARNING: You are using LIVE Stripe keys!');
    console.warn('   Switch to test keys for development');
  }
} catch (error) {
  console.error('❌ Failed to connect to Stripe:');
  console.error(`   Error: ${error.message}`);
  console.error('\nPlease check your STRIPE_SECRET_KEY');
  process.exit(1);
}

// Test creating a checkout session
console.log('\n3. Testing checkout session creation...');
try {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Test Credits',
            description: 'Test purchase for 100 credits',
          },
          unit_amount: 1000, // $10.00 in cents
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
         success_url: 'http://localhost:3004/purchase/success?session_id={CHECKOUT_SESSION_ID}',
     cancel_url: 'http://localhost:3004/purchase/cancelled',
    metadata: {
      userId: 'test-user-123',
      credits: '100',
    },
  });

  console.log('✅ Successfully created test checkout session');
  console.log(`   Session ID: ${session.id}`);
  console.log(`   Status: ${session.status}`);
  console.log(`   Amount: $${session.amount_total / 100}`);
  
  // Clean up - expire the test session
  await stripe.checkout.sessions.expire(session.id);
  console.log('✅ Test session cleaned up');
  
} catch (error) {
  console.error('❌ Failed to create checkout session:');
  console.error(`   Error: ${error.message}`);
  process.exit(1);
}

// Test webhook signature verification (if webhook secret is provided)
if (process.env.STRIPE_WEBHOOK_SECRET) {
  console.log('\n4. Testing webhook signature verification...');
  try {
    const testPayload = JSON.stringify({
      id: 'evt_test_webhook',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123' } }
    });
    
    const testSignature = stripe.webhooks.generateTestHeaderString({
      payload: testPayload,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    
    const event = stripe.webhooks.constructEvent(
      testPayload,
      testSignature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    console.log('✅ Webhook signature verification works');
    console.log(`   Event type: ${event.type}`);
    
  } catch (error) {
    console.error('❌ Webhook signature verification failed:');
    console.error(`   Error: ${error.message}`);
    console.error('   Please check your STRIPE_WEBHOOK_SECRET');
  }
} else {
  console.log('\n4. Webhook secret not found (optional for testing)');
  console.log('   Set STRIPE_WEBHOOK_SECRET to test webhook signatures');
}

console.log('\n🎉 Stripe integration test completed!');
console.log('\nNext steps:');
console.log('1. Start your development server: pnpm run dev:server');
console.log('2. Start your frontend: pnpm run dev');
console.log('3. If testing webhooks, run: stripe listen --forward-to localhost:3005/api/payments/webhook');
console.log('4. Open your app and try purchasing credits');
console.log('\nTest cards:');
console.log('- Success: 4242 4242 4242 4242');
console.log('- Declined: 4000 0000 0000 0002');
console.log('- 3D Secure: 4000 0025 0000 3155'); 