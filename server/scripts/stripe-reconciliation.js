#!/usr/bin/env node

/**
 * Stripe Reconciliation Script
 * 
 * Compares recent Stripe events with database records and processes any missing payments.
 * Run periodically via cron: 0 * * * * (every hour)
 * 
 * Usage: node scripts/stripe-reconciliation.js [--hours=24] [--dry-run]
 */

import dotenv from 'dotenv';
import Stripe from 'stripe';
import pool from '../db/index.js';
import { creditsService } from '../services/creditsService.js';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

// Parse command line arguments
const args = process.argv.slice(2);
const hours = args.find(arg => arg.startsWith('--hours='))?.split('=')[1] || '24';
const isDryRun = args.includes('--dry-run');

const LOOKBACK_HOURS = parseInt(hours);
const BATCH_SIZE = 100;

/**
 * Get recent Stripe events
 */
async function getRecentStripeEvents(hoursBack = LOOKBACK_HOURS) {
  const created = Math.floor((Date.now() - (hoursBack * 60 * 60 * 1000)) / 1000);
  
  console.log(`[Reconciliation] Fetching Stripe events from last ${hoursBack} hours...`);
  
  const events = [];
  let hasMore = true;
  let startingAfter = null;
  
  while (hasMore) {
    const params = {
      limit: BATCH_SIZE,
      created: { gte: created },
      types: [
        'checkout.session.completed',
        'charge.refunded',
        'charge.dispute.created'
      ]
    };
    
    if (startingAfter) {
      params.starting_after = startingAfter;
    }
    
    const response = await stripe.events.list(params);
    events.push(...response.data);
    
    hasMore = response.has_more;
    if (hasMore) {
      startingAfter = response.data[response.data.length - 1].id;
    }
  }
  
  console.log(`[Reconciliation] Found ${events.length} Stripe events`);
  return events;
}

/**
 * Check if a Stripe event has been processed in our database
 */
async function isEventProcessed(stripeEvent) {
  switch (stripeEvent.type) {
    case 'checkout.session.completed':
      const session = stripeEvent.data.object;
      const paymentIntentId = session.payment_intent;
      
      if (!paymentIntentId) {
        console.warn(`[Reconciliation] No payment_intent in session ${session.id}`);
        return true; // Skip this event
      }
      
      const result = await pool.query(
        'SELECT id FROM "CreditTransaction" WHERE stripe_payment_intent_id = $1 AND type = $2',
        [paymentIntentId, 'purchase']
      );
      
      return result.rowCount > 0;
      
    case 'charge.refunded':
      const refundCharge = stripeEvent.data.object;
      const refundPaymentIntentId = refundCharge.payment_intent;
      
      const refundResult = await pool.query(
        'SELECT id FROM "CreditTransaction" WHERE stripe_payment_intent_id = $1 AND type = $2',
        [refundPaymentIntentId, 'refund']
      );
      
      return refundResult.rowCount > 0;
      
    default:
      return true; // Skip unhandled events
  }
}

/**
 * Process a missed Stripe event (same logic as webhook)
 */
async function processMissedEvent(stripeEvent) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log(`[Reconciliation] Processing missed event: ${stripeEvent.id} (${stripeEvent.type})`);
    
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await processMissedCheckout(stripeEvent, client);
        break;
        
      case 'charge.refunded':
        await processMissedRefund(stripeEvent, client);
        break;
        
      case 'charge.dispute.created':
        await processMissedDispute(stripeEvent, client);
        break;
        
      default:
        console.log(`[Reconciliation] Unhandled event type: ${stripeEvent.type}`);
    }
    
    await client.query('COMMIT');
    console.log(`[Reconciliation] ✅ Successfully processed ${stripeEvent.id}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[Reconciliation] ❌ Failed to process ${stripeEvent.id}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Process missed checkout session
 */
async function processMissedCheckout(stripeEvent, client) {
  const session = stripeEvent.data.object;
  const { userId, credits } = session.metadata;
  const paymentIntentId = session.payment_intent;
  const amountPaid = session.amount_total / 100;
  
  if (!userId || !credits) {
    throw new Error(`Missing metadata in checkout session: ${JSON.stringify(session.metadata)}`);
  }
  
  // Double-check it's not already processed
  const existing = await client.query(
    'SELECT 1 FROM "CreditTransaction" WHERE stripe_payment_intent_id = $1',
    [paymentIntentId]
  );
  
  if (existing.rowCount > 0) {
    console.log(`[Reconciliation] Event ${stripeEvent.id} already processed, skipping`);
    return;
  }
  
  // Check if user still exists
  const userExists = await client.query(
    'SELECT 1 FROM "User" WHERE id = $1',
    [userId]
  );
  
  if (userExists.rowCount === 0) {
    console.warn(`[Reconciliation] User ${userId} no longer exists, skipping credit addition`);
    return;
  }
  
  // Add credits using the same service
  const newBalance = await creditsService.addCredits(
    userId,
    parseInt(credits),
    `Stripe purchase (reconciled) - $${amountPaid} for ${credits} credits`,
    paymentIntentId,
    client
  );
  
  console.log(`[Reconciliation] Added ${credits} credits to user ${userId}. New balance: ${newBalance}`);
}

/**
 * Process missed refund
 */
async function processMissedRefund(stripeEvent, client) {
  const charge = stripeEvent.data.object;
  const paymentIntentId = charge.payment_intent;
  const refundAmount = charge.amount_refunded / 100;
  
  // Find the original payment
  const payment = await client.query(
    'SELECT user_id, amount FROM "CreditTransaction" WHERE stripe_payment_intent_id = $1 AND type = $2',
    [paymentIntentId, 'purchase']
  );
  
  if (payment.rowCount === 0) {
    console.warn(`[Reconciliation] No original payment found for refund: ${paymentIntentId}`);
    return;
  }
  
  const { user_id, amount: credits_added } = payment.rows[0];
  
  // Calculate credits to deduct (proportional to refund)
  const totalPaid = charge.amount / 100;
  const refundRatio = refundAmount / totalPaid;
  const creditsToDeduct = Math.floor(credits_added * refundRatio);
  
  if (creditsToDeduct > 0) {
    await creditsService.deductCredits(
      user_id,
      creditsToDeduct,
      `Stripe refund (reconciled) - $${refundAmount} refunded`,
      paymentIntentId,
      client
    );
    
    console.log(`[Reconciliation] Deducted ${creditsToDeduct} credits from user ${user_id} for refund`);
  }
}

/**
 * Process missed dispute
 */
async function processMissedDispute(stripeEvent, client) {
  const dispute = stripeEvent.data.object;
  const chargeId = dispute.charge;
  
  // Get charge details
  const charge = await stripe.charges.retrieve(chargeId);
  const paymentIntentId = charge.payment_intent;
  
  // Find the original payment
  const payment = await client.query(
    'SELECT user_id, amount FROM "CreditTransaction" WHERE stripe_payment_intent_id = $1 AND type = $2',
    [paymentIntentId, 'purchase']
  );
  
  if (payment.rowCount === 0) {
    console.warn(`[Reconciliation] No original payment found for dispute: ${paymentIntentId}`);
    return;
  }
  
  const { user_id, amount: credits_added } = payment.rows[0];
  const disputeAmount = dispute.amount / 100;
  
  console.warn(`[Reconciliation] Dispute detected for user ${user_id}: $${disputeAmount} (${credits_added} credits)`);
  
  // TODO: Implement business logic for disputes (freeze account, notify admin, etc.)
  // For now, just log the dispute
}

/**
 * Main reconciliation function
 */
async function runReconciliation() {
  try {
    console.log(`[Reconciliation] Starting reconciliation check (${isDryRun ? 'DRY RUN' : 'LIVE MODE'})`);
    console.log(`[Reconciliation] Looking back ${LOOKBACK_HOURS} hours`);
    
    // Get recent Stripe events
    const stripeEvents = await getRecentStripeEvents(LOOKBACK_HOURS);
    
    if (stripeEvents.length === 0) {
      console.log('[Reconciliation] No events to check');
      return;
    }
    
    // Check each event
    let processedCount = 0;
    let missedCount = 0;
    const missedEvents = [];
    
    for (const stripeEvent of stripeEvents) {
      const isProcessed = await isEventProcessed(stripeEvent);
      
      if (isProcessed) {
        processedCount++;
      } else {
        missedCount++;
        missedEvents.push(stripeEvent);
        console.warn(`[Reconciliation] ⚠️  Missed event: ${stripeEvent.id} (${stripeEvent.type})`);
      }
    }
    
    console.log(`[Reconciliation] Summary: ${processedCount} processed, ${missedCount} missed`);
    
    if (missedEvents.length === 0) {
      console.log('[Reconciliation] ✅ All events are properly processed!');
      return;
    }
    
    if (isDryRun) {
      console.log(`[Reconciliation] DRY RUN: Would process ${missedEvents.length} missed events`);
      missedEvents.forEach(event => {
        console.log(`  - ${event.id} (${event.type}) at ${new Date(event.created * 1000).toISOString()}`);
      });
      return;
    }
    
    // Process missed events
    console.log(`[Reconciliation] Processing ${missedEvents.length} missed events...`);
    
    for (const missedEvent of missedEvents) {
      try {
        await processMissedEvent(missedEvent);
      } catch (error) {
        console.error(`[Reconciliation] Failed to process ${missedEvent.id}:`, error);
        // Continue with other events
      }
    }
    
    console.log('[Reconciliation] ✅ Reconciliation completed');
    
  } catch (error) {
    console.error('[Reconciliation] ❌ Fatal error during reconciliation:', error);
    process.exit(1);
  }
}

/**
 * Environment validation
 */
function validateEnvironment() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is required');
  }
  
  const isTestMode = process.env.STRIPE_SECRET_KEY.startsWith('sk_test_');
  const liveMode = process.env.STRIPE_LIVE_MODE === 'true';
  
  if (liveMode && isTestMode) {
    throw new Error('STRIPE_LIVE_MODE=true but using test key (sk_test_)');
  }
  
  if (!liveMode && !isTestMode) {
    throw new Error('STRIPE_LIVE_MODE=false but using live key (sk_live_)');
  }
  
  console.log(`[Reconciliation] Mode: ${isTestMode ? 'TEST' : 'LIVE'}`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateEnvironment();
  runReconciliation().catch(error => {
    console.error('[Reconciliation] Script failed:', error);
    process.exit(1);
  });
}

export { runReconciliation }; 