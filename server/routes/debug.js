// Debug route to test Crossmint API directly
import express from "express";

import { CrossmintQuoteService } from "../crossmint-quote-service.js";
import { logger } from "../lib/cloudwatch-logger.js";

const router = express.Router();

// Initialize quote service
const quoteService = new CrossmintQuoteService();

/**
 * GET /api/debug/crossmint-test
 * Test Crossmint API connection and response format
 */
router.get("/crossmint-test", async (req, res) => {
  try {
    console.log("🧪 Testing Crossmint API directly...");

    // Test with a sample product
    const testASIN = "amazon:B07H9PZDQW"; // Yoga Mat
    const testPayerAddress = "0x1234567890123456789012345678901234567890";

    const usdcQuote = await quoteService.getProductQuote(
      testASIN,
      "base-sepolia",
      "usdc",
      testPayerAddress,
    );

    const ethQuote = await quoteService.getProductQuote(
      testASIN,
      "base-sepolia",
      "eth",
      testPayerAddress,
    );

    res.json({
      testASIN,
      usdcQuote,
      ethQuote,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Crossmint test failed:", error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
});

export default router;
