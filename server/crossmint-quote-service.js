// Crossmint Quote API Integration - Get exact crypto amounts needed for Amazon purchases
import axios from "axios";
import dotenv from "dotenv";

import { SAMPLE_PRODUCTS, SHIPPING } from "./data/sample-products.js";

dotenv.config();

/**
 * Get a quote for Amazon purchase using Crossmint API directly
 * This allows us to determine the exact crypto amount needed before purchase
 */
export class CrossmintQuoteService {
  constructor() {
    this.baseURL = "https://www.crossmint.com/api";
    this.apiKey = process.env.CROSSMINT_API_KEY;

    if (!this.apiKey) {
      throw new Error("CROSSMINT_API_KEY not found in environment");
    }
  }

  /**
   * Create a quote-only order to get pricing information
   * @param {string} asin - Amazon product ASIN
   * @param {string} paymentMethod - Blockchain network (e.g., 'base', 'base-sepolia')
   * @param {string} currency - Payment currency ('usdc', 'eth')
   * @param {string} payerAddress - Wallet address that will pay
   * @returns {Promise<Object>} Quote information with amounts
   */
  async getProductQuote(
    asin,
    paymentMethod = "base",
    currency = "usdc",
    payerAddress,
  ) {
    try {
      console.log(`🔍 Getting quote for ${asin}...`);

      const orderPayload = {
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
          method: paymentMethod,
          currency: currency.toLowerCase(),
          payerAddress: payerAddress,
        },
        lineItems: {
          productLocator: asin,
        },
        locale: "en-US",
      };

      console.log("Creating order for quote...");
      const response = await axios.post(
        `${this.baseURL}/2022-06-09/orders`,
        orderPayload,
        {
          headers: {
            "X-API-KEY": this.apiKey,
            "Content-Type": "application/json",
          },
        },
      );

      const order = response.data.order;
      console.log(`✅ Quote created successfully!`);

      return this.extractQuoteInfo(order, asin);
    } catch (error) {
      console.error(
        `❌ Quote failed for ${asin}:`,
        error.response?.data || error.message,
      );

      // Return error info that might still contain useful pricing data
      return {
        asin,
        success: false,
        error: error.response?.data?.message || error.message,
        errorCode: error.response?.data?.code,
        // Sometimes errors contain limits or amounts
        errorParams: error.response?.data?.parameters,
      };
    }
  }

  /**
   * Extract pricing information from order response
   */
  extractQuoteInfo(order, asin) {
    const product = SAMPLE_PRODUCTS.find((p) => p.asin === asin);

    const quoteInfo = {
      asin,
      productName: product?.name || "Unknown Product",
      productPrice: product?.price || 0,
      success: true,
      orderId: order.orderId,
      status: order.quote?.status,
      quotedAt: order.quote?.quotedAt,
      expiresAt: order.quote?.expiresAt,
    };

    // Extract overall quote total
    if (order.quote?.totalPrice) {
      quoteInfo.totalRequired = {
        amount: order.quote.totalPrice.amount,
        currency: order.quote.totalPrice.currency,
        amountUSD: this.convertToUSD(order.quote.totalPrice),
      };
    }

    // Extract line item details
    if (order.lineItems && order.lineItems.length > 0) {
      const lineItem = order.lineItems[0];

      if (lineItem.quote) {
        quoteInfo.breakdown = {
          unit: lineItem.quote.charges?.unit,
          salesTax: lineItem.quote.charges?.salesTax,
          shipping: lineItem.quote.charges?.shipping,
          totalPrice: lineItem.quote.totalPrice,
        };
      }
    }

    // Extract payment preparation info
    if (order.payment?.preparation) {
      quoteInfo.payment = {
        chain: order.payment.preparation.chain,
        payerAddress: order.payment.preparation.payerAddress,
        serializedTransaction: order.payment.preparation.serializedTransaction
          ? "Available"
          : "Not ready",
        status: order.payment.status,
      };
    }

    return quoteInfo;
  }

  /**
   * Convert crypto amount to approximate USD (rough estimate)
   */
  convertToUSD(priceObj) {
    if (!priceObj) return null;

    // Rough conversion rates (in practice, you'd use a real-time API)
    const rates = {
      usdc: 1.0,
      eth: 2500, // Approximate ETH price
      matic: 0.5,
    };

    const rate = rates[priceObj.currency?.toLowerCase()] || 1;
    return (parseFloat(priceObj.amount) * rate).toFixed(2);
  }

  /**
   * Get quotes for all sample products
   */
  async getAllProductQuotes(
    paymentMethod = "base",
    currency = "usdc",
    payerAddress,
  ) {
    console.log("🛒 Getting quotes for all sample products...\n");

    const quotes = [];

    for (const product of SAMPLE_PRODUCTS) {
      console.log(`\n--- ${product.name} ---`);
      const quote = await this.getProductQuote(
        product.asin,
        paymentMethod,
        currency,
        payerAddress,
      );
      quotes.push(quote);

      // Wait a bit between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return quotes;
  }

  /**
   * Check if we have sufficient balance for a purchase
   */
  async checkSufficientBalance(walletBalance, requiredAmount, currency) {
    const balance = parseFloat(walletBalance);
    const required = parseFloat(requiredAmount);

    return {
      sufficient: balance >= required,
      balance: balance,
      required: required,
      difference: (balance - required).toFixed(6),
      currency: currency,
    };
  }
}

// Test function to demonstrate usage
export async function testQuoteService() {
  const quoteService = new CrossmintQuoteService();

  // Use a dummy wallet address for testing
  const testWalletAddress = "0x1234567890123456789012345678901234567890";

  console.log("🚀 Testing Crossmint Quote Service\n");
  console.log("=".repeat(60));

  try {
    // Test single product quote in USDC
    console.log("\n📋 Single Product Quote Test (USDC):");
    const singleQuoteUSDC = await quoteService.getProductQuote(
      "amazon:B07H9PZDQW", // Yoga mat
      "base",
      "usdc",
      testWalletAddress,
    );

    console.log("USDC Quote Result:", JSON.stringify(singleQuoteUSDC, null, 2));

    // Test single product quote in ETH
    console.log("\n📋 Single Product Quote Test (ETH):");
    const singleQuoteETH = await quoteService.getProductQuote(
      "amazon:B07H9PZDQW", // Yoga mat
      "base",
      "eth",
      testWalletAddress,
    );

    console.log("ETH Quote Result:", JSON.stringify(singleQuoteETH, null, 2));

    // Test all products in ETH
    console.log("\n📋 All Products Quote Test (ETH):");
    const allQuotesETH = await quoteService.getAllProductQuotes(
      "base",
      "eth",
      testWalletAddress,
    );

    // Summary comparison
    console.log("\n📊 SUMMARY - ETH PRICING:");
    console.log("=".repeat(40));
    allQuotesETH.forEach((quote) => {
      if (quote.success && quote.totalRequired) {
        console.log(`${quote.productName}:`);
        console.log(`  Product Price: $${quote.productPrice}`);
        console.log(
          `  Crypto Required: ${quote.totalRequired.amount} ${quote.totalRequired.currency.toUpperCase()}`,
        );
        console.log(`  Estimated USD: $${quote.totalRequired.amountUSD}`);
        console.log(`  Status: ${quote.status}`);
      } else {
        console.log(`${quote.asin}: ❌ ${quote.error}`);
      }
      console.log("");
    });

    // Test all products in USDC for comparison
    console.log("\n📋 All Products Quote Test (USDC):");
    const allQuotesUSDC = await quoteService.getAllProductQuotes(
      "base",
      "usdc",
      testWalletAddress,
    );

    // Summary comparison
    console.log("\n📊 SUMMARY - USDC vs ETH COMPARISON:");
    console.log("=".repeat(50));
    allQuotesUSDC.forEach((usdcQuote, index) => {
      const ethQuote = allQuotesETH[index];
      if (usdcQuote.success && ethQuote.success) {
        console.log(`${usdcQuote.productName}:`);
        console.log(
          `  USDC: ${usdcQuote.totalRequired.amount} USDC ($${usdcQuote.totalRequired.amountUSD})`,
        );
        console.log(
          `  ETH:  ${ethQuote.totalRequired.amount} ETH ($${ethQuote.totalRequired.amountUSD})`,
        );
      }
      console.log("");
    });
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testQuoteService();
}
