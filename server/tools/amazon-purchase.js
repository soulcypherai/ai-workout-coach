// Amazon Purchase Tools using Crossmint & GOAT SDK Integration
import { CdpClient } from "@coinbase/cdp-sdk";
import { getOnChainTools } from "@goat-sdk/adapter-vercel-ai";
import { crossmintHeadlessCheckout } from "@goat-sdk/plugin-crossmint-headless-checkout";
import { viem } from "@goat-sdk/wallet-viem";
import { createWalletClient, http } from "viem";
import { toAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { z } from "zod";

import {
  SAMPLE_PRODUCTS,
  SHIPPING,
  findProductByAsin,
  isValidAsin,
} from "../data/sample-products.js";
import pool from "../db/index.js";
import { logger } from "../lib/cloudwatch-logger.js";
import { flags } from "../utils/feature-flags.js";

// Zod schemas for validation
const ProductSchema = z.object({
  asin: z.string().regex(/^amazon:B[0-9A-Z]{9}$/, "Invalid ASIN format"),
  name: z.string().min(1).max(100),
  price: z.number().positive(),
  url: z.string().url(),
  imageUrl: z.string().url(),
});

const PurchaseResultSchema = z.object({
  orderId: z.string(),
  status: z.enum(["pending", "completed", "failed"]),
  txHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .optional(),
});

const ConfirmationSchema = z.object({
  asin: z.string().regex(/^amazon:B[0-9A-Z]{9}$/),
  callSessionId: z.string().uuid(),
  ok: z.boolean(),
});

// In-memory confirmation store (in production, use Redis or database)
const confirmations = new Map();

/**
 * Get trending products (hardcoded sample products)
 * @param {string} callSessionId - Optional call session ID for analytics
 * @returns {Promise<Array>} Array of product objects
 */
export async function getTrendingProducts(callSessionId = null) {
  try {
    logger.info("getTrendingProducts called", {
      callSessionId,
      featureEnabled: flags.FEAT_AMAZON_PURCHASE_ENABLED,
      component: "amazon-purchase",
    });

    if (!flags.FEAT_AMAZON_PURCHASE_ENABLED) {
      return [];
    }

    // Log analytics event
    if (callSessionId) {
      await logAnalyticsEvent("product_query_requested", {
        callSessionId,
        timestamp: new Date().toISOString(),
      });
    }

    // Validate products with schema
    const validatedProducts = SAMPLE_PRODUCTS.map((product) =>
      ProductSchema.parse(product),
    );

    // Map backend format to frontend format (imageUrl -> image)
    const frontendProducts = validatedProducts.map((product) => ({
      ...product,
      image: product.imageUrl, // Frontend expects 'image' field
      price: `$${product.price.toFixed(2)}`, // Frontend expects string format
    }));

    return frontendProducts;
  } catch (error) {
    logger.error("Error in getTrendingProducts", {
      error: error.message,
      callSessionId,
      component: "amazon-purchase",
    });
    throw new Error("Failed to fetch trending products");
  }
}

/**
 * Store or validate purchase confirmation
 * @param {string} asin - Product ASIN
 * @param {string} callSessionId - Call session UUID
 * @param {boolean} ok - Whether user confirmed
 * @returns {Promise<Object>} Confirmation result
 */
export async function confirmPurchase(asin, callSessionId, ok) {
  try {
    const validatedData = ConfirmationSchema.parse({ asin, callSessionId, ok });

    if (!flags.FEAT_AMAZON_PURCHASE_ENABLED) {
      return { confirmed: false, error: "Feature disabled" };
    }

    const confirmationKey = `${callSessionId}:${asin}`;

    if (ok) {
      // User confirmed - store confirmation with expiry (5 minutes)
      const expiry = Date.now() + 5 * 60 * 1000;
      confirmations.set(confirmationKey, { confirmed: true, expiry });

      await logAnalyticsEvent("purchase_confirmed", { asin, callSessionId });

      return { confirmed: true };
    } else {
      // User declined or showing confirmation
      confirmations.delete(confirmationKey);

      await logAnalyticsEvent("purchase_confirm_shown", {
        asin,
        callSessionId,
      });

      return { confirmed: false };
    }
  } catch (error) {
    logger.error("Error in confirmPurchase", {
      error: error.message,
      asin,
      callSessionId,
      component: "amazon-purchase",
    });
    throw new Error("Failed to process confirmation");
  }
}

/**
 * Check if purchase is confirmed
 * @param {string} callSessionId - Call session UUID
 * @param {string} asin - Product ASIN
 * @returns {boolean} Whether purchase is confirmed and not expired
 */
function isConfirmed(callSessionId, asin) {
  const confirmationKey = `${callSessionId}:${asin}`;
  const confirmation = confirmations.get(confirmationKey);

  if (!confirmation) return false;

  // Check if confirmation expired
  if (Date.now() > confirmation.expiry) {
    confirmations.delete(confirmationKey);
    return false;
  }

  return confirmation.confirmed;
}

/**
 * Execute Amazon product purchase via Crossmint using GOAT SDK
 * @param {string} asin - Product ASIN to purchase
 * @param {string} callSessionId - Call session UUID
 * @returns {Promise<Object>} Purchase result with orderId, status, txHash
 */
export async function executePurchase(asin, callSessionId) {
  const startTime = Date.now();

  try {
    logger.info("Executing real Crossmint purchase", {
      asin,
      callSessionId,
      featureEnabled: flags.FEAT_AMAZON_PURCHASE_ENABLED,
      component: "amazon-purchase",
    });

    if (!flags.FEAT_AMAZON_PURCHASE_ENABLED) {
      throw new Error("FEATURE_DISABLED");
    }

    // Validate ASIN format
    if (!isValidAsin(asin)) {
      throw new Error("INVALID_ASIN");
    }

    // Find product by ASIN
    const product = findProductByAsin(asin);
    if (!product) {
      throw new Error("PRODUCT_NOT_FOUND");
    }

    // Check session purchase limit
    const sessionCountQuery = `
      SELECT COUNT(*) as count FROM purchase_logs 
      WHERE call_session_id = $1 AND status = 'completed'
    `;
    const countResult = await pool.query(sessionCountQuery, [callSessionId]);
    const currentCount = parseInt(countResult.rows[0].count);

    if (currentCount >= flags.MAX_PURCHASES_PER_SESSION) {
      throw new Error("SESSION_PURCHASE_LIMIT_EXCEEDED");
    }

    await logAnalyticsEvent("purchase_initiated", { asin, callSessionId });

    // Create wallet client using Coinbase CDP server wallet
    if (!process.env.CROSSMINT_API_KEY) {
      throw new Error("CONFIGURATION_ERROR");
    }

    // Validate CDP environment variables
    if (
      !process.env.CPD_API_KEY_ID ||
      !process.env.CPD_API_KEY_SECRET ||
      !process.env.CDP_WALLET_SECRET
    ) {
      logger.error("Missing CDP configuration", {
        hasApiKeyId: !!process.env.CPD_API_KEY_ID,
        hasApiKeySecret: !!process.env.CPD_API_KEY_SECRET,
        hasWalletSecret: !!process.env.CDP_WALLET_SECRET,
        component: "amazon-purchase",
      });
      throw new Error("CONFIGURATION_ERROR");
    }

    // Initialize CDP client with correct configuration
    const cdp = new CdpClient({
      apiKeyId: process.env.CPD_API_KEY_ID,
      apiKeySecret: process.env.CPD_API_KEY_SECRET,
      walletSecret: process.env.CDP_WALLET_SECRET,
    });

    // Create or get a CDP account using server wallets
    let account;

    try {
      // Use getOrCreateAccount for server wallets with persistent naming
      const accountName = `crossmint-purchase`;
      account = await cdp.evm.getOrCreateAccount({ name: accountName });

      logger.info("Created/Retrieved CDP server wallet account", {
        address: account.address,
        accountName,
        component: "amazon-purchase",
      });

      // Request testnet funds if on testnet
      if (flags.CDP_WALLET_NETWORK === "base-sepolia") {
        try {
          logger.info("Requesting testnet ETH for new account...");
          const { transactionHash } = await cdp.evm.requestFaucet({
            address: account.address,
            network: "base-sepolia",
            token: "eth",
          });
          logger.info("Testnet ETH requested", { transactionHash });
        } catch (faucetError) {
          logger.warn("Failed to request testnet ETH", {
            error: faucetError.message,
            component: "amazon-purchase",
          });
          // Continue without faucet funds - might be sufficient for USDC transactions
        }
      }
    } catch (error) {
      logger.error("Failed to create CDP account", {
        error: error.message,
        component: "amazon-purchase",
      });
      throw new Error("WALLET_CREATION_ERROR");
    }

    const chain =
      flags.CDP_WALLET_NETWORK === "base-sepolia" ? baseSepolia : base;

    // Convert CDP account to viem account using toAccount
    const viemAccount = toAccount(account);

    logger.info("Account addresses", {
      cdpAddress: account.address,
      viemAddress: viemAccount.address,
      component: "amazon-purchase",
    });

    const walletClient = createWalletClient({
      account: viemAccount,
      transport: http(flags.RPC_PROVIDER_URL),
      chain: chain,
    });

    // Get GOAT tools with Crossmint plugin
    const tools = await getOnChainTools({
      wallet: viem(walletClient),
      plugins: [
        crossmintHeadlessCheckout({
          apiKey: process.env.CROSSMINT_API_KEY,
          environment: flags.CDP_WALLET_NETWORK.includes("sepolia")
            ? "staging"
            : "production",
        }),
      ],
    });

    logger.info("GOAT tools initialized", {
      toolsCount: Object.keys(tools).length,
      toolNames: Object.keys(tools),
      walletAddress: viemAccount.address,
      environment: flags.CDP_WALLET_NETWORK.includes("sepolia")
        ? "staging"
        : "production",
      component: "amazon-purchase",
    });

    // Use hardcoded shipping address from SHIPPING constant
    const shippingAddress = `${SHIPPING.name}, ${SHIPPING.address1}${SHIPPING.address2 ? ", " + SHIPPING.address2 : ""}, ${SHIPPING.city}, ${SHIPPING.state} ${SHIPPING.postalCode}, ${SHIPPING.country}`;

    // Execute real purchase using GOAT SDK tools
    let purchaseResult;

    try {
      // Find the crossmint purchase tool - tools is an object, not array
      const toolNames = Object.keys(tools);
      const buyToolName = toolNames.find(
        (name) => name.includes("buy"), // Look for buy_token specifically
      );

      if (!buyToolName || buyToolName !== "buy_token") {
        logger.warn("buy_token tool not found, using simulation", {
          availableTools: toolNames,
          component: "amazon-purchase",
        });
        throw new Error("NO_PURCHASE_TOOL");
      }

      const buyTool = tools[buyToolName];

      logger.info("Executing real purchase with Crossmint via GOAT SDK", {
        toolName: buyToolName,
        productLocator: asin,
        shippingAddress,
        recipientEmail: SHIPPING.email,
        component: "amazon-purchase",
      });

      // The GOAT SDK tools when using adapter-vercel-ai are structured for the AI SDK
      // We need to call the function property of the tool
      const purchaseParams = {
        lineItems: [
          {
            productLocator: asin,
          },
        ],
        recipient: {
          email: SHIPPING.email,
          physicalAddress: {
            name: SHIPPING.name,
            line1: SHIPPING.address1,
            line2: SHIPPING.address2,
            city: SHIPPING.city,
            state: SHIPPING.state,
            postalCode: SHIPPING.postalCode,
            country: SHIPPING.country,
          },
        },
        payment: {
          method: flags.CDP_WALLET_NETWORK,
          currency: "USDC",
          payerAddress: viemAccount.address,
        },
      };

      logger.info("Tool structure analysis", {
        toolType: typeof buyTool,
        hasFunction: !!buyTool.function,
        functionType: typeof buyTool.function,
        hasParameters: !!buyTool.parameters,
        parameters: buyTool.parameters,
        description: buyTool.description,
        toolKeys: Object.keys(buyTool || {}),
        component: "amazon-purchase",
      });

      // GOAT SDK tools with vercel-ai adapter have an execute property
      if (buyTool && typeof buyTool.execute === "function") {
        logger.info("Calling buyTool.execute with params", {
          params: purchaseParams,
          component: "amazon-purchase",
        });
        try {
          purchaseResult = await buyTool.execute(purchaseParams);
          logger.info("buyTool.execute succeeded", {
            result: purchaseResult,
            component: "amazon-purchase",
          });
        } catch (executeError) {
          logger.error("buyTool.execute failed", {
            error: executeError.message,
            stack: executeError.stack,
            component: "amazon-purchase",
          });
          throw executeError;
        }
      } else if (
        buyTool &&
        buyTool.function &&
        typeof buyTool.function === "function"
      ) {
        purchaseResult = await buyTool.function(purchaseParams);
      } else if (buyTool && typeof buyTool === "function") {
        purchaseResult = await buyTool(purchaseParams);
      } else {
        // For GOAT SDK with vercel-ai adapter, we might need to use a different approach
        // The tools are meant to be called by the AI, so let's try alternative methods
        logger.warn(
          "Standard tool calling methods failed, trying alternatives",
          {
            toolStructure: JSON.stringify(buyTool, null, 2).substring(0, 1000),
            component: "amazon-purchase",
          },
        );
        throw new Error("TOOL_STRUCTURE_UNSUPPORTED");
      }
    } catch (toolError) {
      logger.error("GOAT SDK purchase attempt failed", {
        error: toolError.message,
        stack: toolError.stack?.substring(0, 500),
        asin,
        component: "amazon-purchase",
      });

      // Map Crossmint/blockchain errors to user-friendly messages
      if (toolError.message.includes("Insufficient funds")) {
        throw new Error("INSUFFICIENT_FUNDS");
      } else if (
        toolError.message.includes("No serialized transaction found")
      ) {
        throw new Error("PRODUCT_UNAVAILABLE");
      } else if (toolError.message.includes("payment.method")) {
        throw new Error("PAYMENT_METHOD_ERROR");
      } else if (toolError.message.includes("payment.currency")) {
        throw new Error("CURRENCY_ERROR");
      } else {
        throw new Error("BLOCKCHAIN_ERROR");
      }
    }

    const orderId = purchaseResult.orderId || `cm-fallback-${Date.now()}`;
    const txHash = purchaseResult.txHash || null;
    const status = purchaseResult.status || "completed";

    logger.info("Purchase completed successfully", {
      orderId,
      status,
      txHash,
      asin,
      callSessionId,
      duration_ms: Date.now() - startTime,
      component: "amazon-purchase",
    });

    // Store purchase log
    const insertQuery = `
      INSERT INTO purchase_logs (
        order_id, product_asin, call_session_id, status, tx_hash, 
        user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING id
    `;

    // For testing, we'll create the purchase log without enforcing the foreign key
    // In production, the call session should exist
    try {
      await pool.query(insertQuery, [
        orderId,
        asin,
        callSessionId,
        status,
        txHash,
        null, // userId - null for testing
      ]);
    } catch (dbError) {
      logger.warn("Database insert failed, continuing without logging", {
        error: dbError.message,
        orderId,
        asin,
        component: "amazon-purchase",
      });
    }

    const duration = Date.now() - startTime;
    await logAnalyticsEvent("purchase_completed", {
      orderId,
      asin,
      callSessionId,
      duration,
    });

    return {
      orderId,
      status,
      txHash,
      productName: product.name,
      price: product.price,
      duration: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error("Purchase execution failed", {
      error: error.message,
      asin,
      callSessionId,
      duration,
      component: "amazon-purchase",
    });

    await logAnalyticsEvent("purchase_failed", {
      asin,
      callSessionId,
      error: error.message,
      duration,
    });

    // Map internal errors to user-friendly responses
    const errorMap = {
      FEATURE_DISABLED: { status: 503, code: "SERVICE_UNAVAILABLE" },
      INVALID_ASIN: { status: 400, code: "INVALID_PRODUCT_ID" },
      PRODUCT_NOT_FOUND: { status: 404, code: "PRODUCT_NOT_FOUND" },
      SESSION_PURCHASE_LIMIT_EXCEEDED: {
        status: 429,
        code: "PURCHASE_LIMIT_EXCEEDED",
      },
      CONFIGURATION_ERROR: { status: 500, code: "SERVICE_CONFIGURATION_ERROR" },
      WALLET_CREATION_ERROR: { status: 500, code: "WALLET_SERVICE_ERROR" },
      NO_PURCHASE_TOOL: { status: 500, code: "SERVICE_UNAVAILABLE" },
      INSUFFICIENT_FUNDS: { status: 402, code: "INSUFFICIENT_FUNDS" },
      PRODUCT_UNAVAILABLE: { status: 503, code: "PRODUCT_UNAVAILABLE" },
      PAYMENT_METHOD_ERROR: { status: 500, code: "PAYMENT_METHOD_ERROR" },
      CURRENCY_ERROR: { status: 500, code: "CURRENCY_ERROR" },
      BLOCKCHAIN_ERROR: { status: 500, code: "BLOCKCHAIN_ERROR" },
    };

    const mappedError = errorMap[error.message] || {
      status: 500,
      code: "INTERNAL_ERROR",
    };
    const apiError = new Error(error.message);
    apiError.status = mappedError.status;
    apiError.code = mappedError.code;

    throw apiError;
  }
}

/**
 * Log analytics events to database
 * @param {string} eventName - Name of the event
 * @param {Object} properties - Event properties
 */
async function logAnalyticsEvent(eventName, properties) {
  try {
    // In a real implementation, you might use a dedicated analytics service
    // For now, we'll just log to our application logs
    logger.info(`Analytics: ${eventName}`, {
      event: eventName,
      properties,
      timestamp: new Date().toISOString(),
      component: "amazon-purchase-analytics",
    });
  } catch (error) {
    logger.error("Failed to log analytics event", {
      error: error.message,
      eventName,
      component: "amazon-purchase-analytics",
    });
  }
}

// Export types for external use
export const schemas = {
  ProductSchema,
  PurchaseResultSchema,
  ConfirmationSchema,
};
