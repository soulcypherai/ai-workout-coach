import "dotenv/config";
import { Router } from "express";
import Stripe from "stripe";

import pool from "../db/index.js";
import { businessAlerts, systemAlerts } from "../lib/alerting.js";
import { verifyJWTMiddleware } from "../middleware/auth.js";
import { creditsService } from "../services/creditsService.js";

const router = Router();

// Initialize Stripe with environment validation
const isTestMode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_");
const liveMode = process.env.STRIPE_LIVE_MODE === "true";

// Environment separation validation
if (liveMode && isTestMode) {
  throw new Error("STRIPE_LIVE_MODE=true but using test key (sk_test_)");
}
if (!liveMode && !isTestMode) {
  throw new Error("STRIPE_LIVE_MODE=false but using live key (sk_live_)");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
});

console.log(`[Payments] Running in ${isTestMode ? "TEST" : "LIVE"} mode`);

// Webhook signature verification for Stripe
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// const CREDIT_PACKAGES = [
//   { id: 'starter', name: 'Starter Pack', credits: 100, price: 4.99, stripe_price_id: process.env.STRIPE_PRICE_STARTER || 'price_starter' },
//   { id: 'popular', name: 'Popular Pack', credits: 250, price: 9.99, stripe_price_id: process.env.STRIPE_PRICE_POPULAR || 'price_popular' },
//   { id: 'premium', name: 'Premium Pack', credits: 500, price: 19.99, stripe_price_id: process.env.STRIPE_PRICE_PREMIUM || 'price_premium' },
//   { id: 'ultimate', name: 'Ultimate Pack', credits: 1000, price: 34.99, stripe_price_id: process.env.STRIPE_PRICE_ULTIMATE || 'price_ultimate' }
// ];

/**
 * Create Stripe Checkout Session
 */
router.post(
  "/create-checkout-session",
  verifyJWTMiddleware,
  async (req, res, next) => {
    const { credits, priceUsd } = req.body;
    const userId = req.user.userId;

    // Detect if this is a Mini App request (no Authorization header but has cookies)
    const isMiniApp = !req.headers.authorization && req.cookies?.minikit_token;

    if (!credits || !priceUsd || credits <= 0 || priceUsd <= 0) {
      return res
        .status(400)
        .json({ error: "Valid credits and price are required" });
    }

    // Get user info for display
    const userResult = await pool.query(
      'SELECT wallet_address FROM "User" WHERE id = $1',
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Create Stripe checkout session
    const sessionConfig = {
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${credits} Credits`,
              description: `Purchase ${credits} credits for AI avatar conversations`,
              images: ["https://your-domain.com/credit-icon.png"], // Optional: Add credit icon
            },
            unit_amount: Math.round(priceUsd * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL || "http://localhost:3004"}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || "http://localhost:3004"}/purchase/cancelled`,
      metadata: {
        userId: userId,
        credits: credits.toString(),
        walletAddress: userResult.rows[0].wallet_address,
      },
    };

    // Only include customer_email if user has an email (for Supabase users)
    if (req.user.email) {
      sessionConfig.customer_email = req.user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Log the checkout session creation
    console.log(
      `[Payments] Created checkout session ${session.id} for user ${userId}: ${credits} credits for $${priceUsd}`,
    );

    res.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  },
);

/**
 * Get payment session status
 */
router.get(
  "/session-status/:sessionId",
  verifyJWTMiddleware,
  async (req, res, next) => {
    const { sessionId } = req.params;

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    res.json({
      status: session.status,
      payment_status: session.payment_status,
      customer_email: session.customer_email,
      credits: session.metadata?.credits || 0,
    });
  },
);

/**
 * Stripe Webhook Handler - Hybrid Approach
 * Process immediately for fast UX, with robust error handling
 */
router.post("/webhook", async (req, res, next) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      STRIPE_WEBHOOK_SECRET,
    );
    console.log(
      `[Payments] Webhook received: ${event.type}, event ID: ${event.id}`,
    );

    // Debug logs for delivery troubleshooting
    console.debug("[Payments] Webhook body len", req.body?.length);
    console.debug("[Payments] Stripe-Sig", sig?.slice(0, 12), "...");
  } catch (err) {
    console.error(
      "[Payments] Webhook signature verification failed:",
      err.message,
    );
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Process event immediately with robust error handling
  try {
    await processStripeEventImmediate(event);
    console.log(`[Payments] Successfully processed event ${event.id}`);
    res.json({ received: true });
  } catch (error) {
    console.error("[Payments] Error processing webhook event:", error);

    // Send alert for payment processing failure
    businessAlerts.paymentFailure(
      event.data?.object?.customer || "unknown",
      event.data?.object?.amount ? event.data.object.amount / 100 : 0,
      error,
    );

    // Still return 200 to prevent Stripe retries if it's a business logic error
    // Only return 5xx for infrastructure failures
    if (
      error.message.includes("network") ||
      error.message.includes("timeout")
    ) {
      res.status(500).json({ error: "Temporary processing failure" });
    } else {
      console.error(
        "[Payments] Business logic error - acknowledging webhook:",
        error,
      );
      res.json({ received: true, error: error.message });
    }
  }
});

/**
 * Process Stripe events immediately with idempotency
 */
async function processStripeEventImmediate(event) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event, client);
        break;

      case "payment_intent.succeeded":
        console.log(
          `[Payments] Payment intent succeeded: ${event.data.object.id}`,
        );
        break;

      case "payment_intent.payment_failed":
        console.log(
          `[Payments] Payment intent failed: ${event.data.object.id}`,
        );
        break;

      case "charge.refunded":
        await handleChargeRefunded(event, client);
        break;

      case "charge.dispute.created":
        await handleDisputeCreated(event, client);
        break;

      default:
        console.log(`[Payments] Unhandled event type: ${event.type}`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Handle checkout session completed with idempotency
 */
async function handleCheckoutSessionCompleted(event, client) {
  const session = event.data.object;
  const { userId, credits } = session.metadata;
  const paymentIntentId = session.payment_intent;
  const amountPaid = session.amount_total / 100;

  if (!userId || !credits) {
    throw new Error(
      `Missing metadata in checkout session: ${JSON.stringify(session.metadata)}`,
    );
  }

  // Idempotency check using existing CreditTransaction table
  const existing = await client.query(
    'SELECT 1 FROM "CreditTransaction" WHERE stripe_payment_intent_id = $1',
    [paymentIntentId],
  );

  if (existing.rowCount > 0) {
    console.log(
      `[Payments] Duplicate payment detected, skipping: ${paymentIntentId}`,
    );
    return;
  }

  // Add credits to user account (this handles the transaction internally)
  const newBalance = await creditsService.addCredits(
    userId,
    parseInt(credits),
    `Stripe purchase - $${amountPaid} for ${credits} credits`,
    paymentIntentId,
    client, // Pass transaction client
  );

  console.log(
    `[Payments] Added ${credits} credits to user ${userId}. New balance: ${newBalance}`,
  );
}

/**
 * Handle charge refunded
 */
async function handleChargeRefunded(event, client) {
  const charge = event.data.object;
  const paymentIntentId = charge.payment_intent;
  const refundAmount = charge.amount_refunded / 100;

  // Find the original payment from CreditTransaction
  const payment = await client.query(
    'SELECT user_id, amount FROM "CreditTransaction" WHERE stripe_payment_intent_id = $1 AND type = $2',
    [paymentIntentId, "purchase"],
  );

  if (payment.rowCount === 0) {
    console.warn(
      `[Payments] No processed payment found for refund: ${paymentIntentId}`,
    );
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
      `Stripe refund - $${refundAmount} refunded`,
      paymentIntentId,
      client,
    );

    console.log(
      `[Payments] Deducted ${creditsToDeduct} credits from user ${user_id} for refund`,
    );
  }
}

/**
 * Handle dispute created
 */
async function handleDisputeCreated(event, client) {
  const dispute = event.data.object;
  const chargeId = dispute.charge;

  // Get charge details
  const charge = await stripe.charges.retrieve(chargeId);
  const paymentIntentId = charge.payment_intent;

  // Find the original payment from CreditTransaction
  const payment = await client.query(
    'SELECT user_id, amount FROM "CreditTransaction" WHERE stripe_payment_intent_id = $1 AND type = $2',
    [paymentIntentId, "purchase"],
  );

  if (payment.rowCount === 0) {
    console.warn(
      `[Payments] No processed payment found for dispute: ${paymentIntentId}`,
    );
    return;
  }

  const { user_id, amount: credits_added } = payment.rows[0];
  const disputeAmount = dispute.amount / 100;

  // For now, just log the dispute - you may want to freeze credits or take other action
  console.warn(
    `[Payments] Dispute created for user ${user_id}: $${disputeAmount} (${credits_added} credits)`,
  );

  // TODO: Implement business logic for disputes (freeze account, notify admin, etc.)
}

/**
 * Get available credit packages (from database settings)
 */
router.get("/packages", async (req, res, next) => {
  // Get pricing settings from database
  const settingsQuery = `
    SELECT setting_key, setting_value, setting_type
    FROM "SystemSettings"
    WHERE setting_key IN ('credits_usd_price', 'credits_min_purchase', 'credits_max_purchase', 'credits_bonus_packages')
    ORDER BY setting_key
  `;

  const result = await pool.query(settingsQuery);

  // Parse settings
  let creditPrice = 0.1;
  let minPurchase = 10;
  let maxPurchase = 1000;
  let bonusPackages = [];

  result.rows.forEach((row) => {
    let value = row.setting_value;

    if (row.setting_type === "number") {
      value = parseFloat(value);
    } else if (row.setting_type === "json") {
      value = JSON.parse(value);
    }

    switch (row.setting_key) {
      case "credits_usd_price":
        creditPrice = value;
        break;
      case "credits_min_purchase":
        minPurchase = value;
        break;
      case "credits_max_purchase":
        maxPurchase = value;
        break;
      case "credits_bonus_packages":
        bonusPackages = value;
        break;
    }
  });

  // Generate standard packages
  const standardPackages = [
    { credits: 100, price: 100 * creditPrice, isPopular: false },
    { credits: 500, price: 500 * creditPrice, isPopular: true },
    { credits: 1000, price: 1000 * creditPrice, isPopular: false },
    { credits: 2000, price: 2000 * creditPrice, isPopular: false },
  ];

  res.json({
    creditPrice,
    minPurchase,
    maxPurchase,
    standardPackages,
    bonusPackages,
  });
});

export default router;
