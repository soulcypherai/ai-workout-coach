// Crossmint Quote API endpoint
import express from "express";

import { CrossmintQuoteService } from "../crossmint-quote-service.js";
import { logger } from "../lib/cloudwatch-logger.js";

const router = express.Router();

// Initialize quote service
const quoteService = new CrossmintQuoteService();

/**
 * POST /api/crossmint/quote
 * Get pricing quote for Amazon product
 */
router.post("/quote", async (req, res) => {
  try {
    const {
      asin,
      paymentMethod = "base-sepolia",
      currency = "usdc",
      payerAddress,
    } = req.body;

    // Validate required parameters
    if (!asin) {
      return res.status(400).json({
        success: false,
        error: "ASIN is required",
      });
    }

    if (!payerAddress) {
      return res.status(400).json({
        success: false,
        error: "Payer address is required",
      });
    }

    logger.info("Crossmint quote request", {
      asin,
      paymentMethod,
      currency,
      payerAddress: payerAddress.slice(0, 6) + "...",
      component: "crossmint-api",
    });

    // Get quote from Crossmint
    const quote = await quoteService.getProductQuote(
      asin,
      paymentMethod,
      currency,
      payerAddress,
    );

    if (quote.success) {
      // Extract pricing information from the quote response
      const totalAmount =
        quote.totalRequired?.amount || quote.breakdown?.totalPrice?.amount;
      const currency =
        quote.totalRequired?.currency || quote.breakdown?.totalPrice?.currency;
      const baseAmount = quote.breakdown?.unit?.amount;
      const taxAmount = quote.breakdown?.salesTax?.amount;

      res.json({
        success: true,
        totalAmount: totalAmount || "0",
        baseAmount: baseAmount || "0",
        taxAmount: taxAmount || "0",
        currency: currency || currency.toUpperCase(),
        orderId: quote.orderId,
        expiry: quote.expiresAt,
        // Include full quote info for debugging
        fullQuote: quote,
      });
    } else {
      res.status(400).json({
        success: false,
        error: quote.error || "Failed to get quote",
        fullQuote: quote,
      });
    }
  } catch (error) {
    logger.error("Crossmint quote API error", {
      error: error.message,
      stack: error.stack,
      component: "crossmint-api",
    });

    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

export default router;
