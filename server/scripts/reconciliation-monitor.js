#!/usr/bin/env node

/**
 * Reconciliation Health Monitor
 * 
 * Quick health check for reconciliation system
 * Run with: node scripts/reconciliation-monitor.js
 */

import dotenv from 'dotenv';
import Stripe from 'stripe';
import pool from '../db/index.js';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

async function checkReconciliationHealth() {
  console.log('🔍 Reconciliation Health Check\n');
  
  let issues = [];
  
  try {
    // 1. Check for recent unprocessed events
    console.log('1. Checking for unprocessed Stripe events...');
    
    const recentEvents = await stripe.events.list({
      limit: 50,
      created: { gte: Math.floor(Date.now() / 1000) - (24 * 60 * 60) }, // Last 24 hours
      types: ['checkout.session.completed']
    });
    
    let unprocessed = 0;
    for (const event of recentEvents.data) {
      const session = event.data.object;
      const paymentIntentId = session.payment_intent;
      
      if (paymentIntentId) {
        const existing = await pool.query(
          'SELECT 1 FROM "CreditTransaction" WHERE stripe_payment_intent_id = $1',
          [paymentIntentId]
        );
        
        if (existing.rowCount === 0) {
          unprocessed++;
        }
      }
    }
    
    if (unprocessed > 0) {
      issues.push(`⚠️  Found ${unprocessed} unprocessed payment events`);
    } else {
      console.log(`✅ All ${recentEvents.data.length} recent events processed`);
    }
    
    // 2. Check for transaction integrity
    console.log('\n2. Checking transaction integrity...');
    
    const orphanTransactions = await pool.query(`
      SELECT COUNT(*) FROM "CreditTransaction" ct
      LEFT JOIN "User" u ON ct.user_id = u.id
      WHERE u.id IS NULL AND ct.created_at > NOW() - INTERVAL '7 days'
    `);
    
    if (parseInt(orphanTransactions.rows[0].count) > 0) {
      issues.push(`⚠️  Found ${orphanTransactions.rows[0].count} transactions for deleted users`);
    } else {
      console.log('✅ No orphaned transactions found');
    }
    
    // 3. Check for duplicate payment intents
    console.log('\n3. Checking for duplicate payment intents...');
    
    const duplicates = await pool.query(`
      SELECT stripe_payment_intent_id, COUNT(*) as count
      FROM "CreditTransaction"
      WHERE stripe_payment_intent_id IS NOT NULL
      AND stripe_payment_intent_id != ''
      AND created_at > NOW() - INTERVAL '7 days'
      GROUP BY stripe_payment_intent_id
      HAVING COUNT(*) > 1
    `);
    
    if (duplicates.rowCount > 0) {
      issues.push(`🚨 Found ${duplicates.rowCount} duplicate payment intents!`);
      duplicates.rows.forEach(row => {
        console.log(`   - ${row.stripe_payment_intent_id}: ${row.count} transactions`);
      });
    } else {
      console.log('✅ No duplicate payment intents found');
    }
    
    // 4. Check reconciliation script status
    console.log('\n4. Testing reconciliation script...');
    
    try {
      const { runReconciliation } = await import('./stripe-reconciliation.js');
      await runReconciliation(true, 1); // Dry run, 1 hour lookback
      console.log('✅ Reconciliation script working');
    } catch (error) {
      issues.push(`🚨 Reconciliation script error: ${error.message}`);
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Health Check Summary:');
    
    if (issues.length === 0) {
      console.log('🎉 All checks passed! Reconciliation system is healthy.');
    } else {
      console.log(`⚠️  Found ${issues.length} issues:`);
      issues.forEach(issue => console.log(`   ${issue}`));
      
      if (issues.some(i => i.includes('🚨'))) {
        console.log('\n🚨 Critical issues detected - investigate immediately!');
        process.exit(1);
      } else {
        console.log('\n💡 Run reconciliation to fix unprocessed events: npm run reconcile:stripe');
      }
    }
    
  } catch (error) {
    console.error('💥 Health check failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  checkReconciliationHealth().catch(error => {
    console.error('Monitor error:', error);
    process.exit(1);
  });
}

export { checkReconciliationHealth }; 