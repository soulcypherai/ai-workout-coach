// API Route for Executing Amazon Purchases after Crypto Payment
import express from "express";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

import { executePurchase } from "../tools/amazon-purchase.js";

const router = express.Router();

// Public client for transaction verification
const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const USDC_CONTRACT_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CDP_WALLET_ADDRESS = "0xADc3Ff22E54383C727Ed72c9Fa5BEF578d18d734";

/**
 * Execute Amazon purchase after successful crypto payment
 * POST /api/amazon/execute-purchase
 */
router.post("/execute-purchase", async (req, res) => {
  try {
    const { product, payment } = req.body;

    // Validate request
    if (!product?.asin || !payment?.txHash || !payment?.amount) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: product.asin, payment.txHash, payment.amount",
      });
    }

    console.log("🔄 Executing Amazon purchase:", {
      product: product.name,
      asin: product.asin,
      paymentTxHash: payment.txHash,
      paymentAmount: payment.amount,
      paymentCurrency: payment.currency,
      walletAddress: payment.walletAddress,
    });

    // Verify payment on blockchain
    console.log("🔍 Verifying payment transaction...");
    const isValidPayment = await verifyUSDCPayment(
      payment.txHash,
      payment.amount,
      payment.walletAddress,
    );

    if (!isValidPayment.isValid) {
      console.error("❌ Payment verification failed:", isValidPayment.error);
      return res.status(400).json({
        success: false,
        error: `Payment verification failed: ${isValidPayment.error}`,
        txHash: payment.txHash,
      });
    }

    console.log("✅ Payment verified successfully");

    // Execute the purchase using existing executePurchase function
    const purchaseResult = await executePurchase(product.asin, null);

    if (purchaseResult.success) {
      console.log("✅ Amazon purchase executed successfully:", purchaseResult);

      res.json({
        success: true,
        orderId: purchaseResult.orderId,
        txHash: payment.txHash,
        product: product.name,
        amount: payment.amount,
        currency: payment.currency,
        timestamp: new Date().toISOString(),
        message: "Purchase executed successfully",
      });
    } else {
      console.error("❌ Amazon purchase execution failed:", purchaseResult);

      res.status(500).json({
        success: false,
        error: purchaseResult.error || "Purchase execution failed",
        txHash: payment.txHash,
        details: purchaseResult,
      });
    }
  } catch (error) {
    console.error("❌ Purchase execution error:", error);

    res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

/**
 * Get purchase status by transaction hash
 * GET /api/amazon/purchase-status/:txHash
 */
router.get("/purchase-status/:txHash", async (req, res) => {
  try {
    const { txHash } = req.params;

    if (!txHash) {
      return res.status(400).json({
        success: false,
        error: "Transaction hash required",
      });
    }

    // TODO: Implement purchase status lookup
    // This would query your database for purchase records by txHash

    res.json({
      success: true,
      txHash,
      status: "pending", // pending, completed, failed
      message: "Status lookup not yet implemented",
    });
  } catch (error) {
    console.error("❌ Purchase status lookup error:", error);

    res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
});

/**
 * Verify USDC payment transaction
 * @param {string} txHash - Transaction hash
 * @param {string} expectedAmount - Expected USDC amount
 * @param {string} fromAddress - Sender wallet address
 * @returns {Promise<{isValid: boolean, error?: string}>}
 */
async function verifyUSDCPayment(txHash, expectedAmount, fromAddress) {
  try {
    // Get transaction receipt
    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash,
    });

    if (!receipt) {
      return { isValid: false, error: "Transaction not found" };
    }

    if (receipt.status !== "success") {
      return { isValid: false, error: "Transaction failed" };
    }

    // Verify minimum confirmations (2 blocks)
    const currentBlock = await publicClient.getBlockNumber();
    const confirmations = Number(currentBlock - receipt.blockNumber);

    if (confirmations < 2) {
      return { isValid: false, error: "Insufficient confirmations" };
    }

    // Parse USDC transfer from logs
    let transferFound = false;
    let transferAmount = "0";
    let transferTo = "";
    let transferFrom = "";

    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === USDC_CONTRACT_ADDRESS.toLowerCase() &&
        log.topics[0] ===
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
      ) {
        transferFrom = `0x${log.topics[1]?.slice(26)}`;
        transferTo = `0x${log.topics[2]?.slice(26)}`;

        if (log.data) {
          const amount = BigInt(log.data);
          transferAmount = (Number(amount) / 1e6).toString();
        }
        transferFound = true;
        break;
      }
    }

    if (!transferFound) {
      return {
        isValid: false,
        error: "USDC transfer not found in transaction",
      };
    }

    // Verify recipient is CDP wallet
    if (transferTo.toLowerCase() !== CDP_WALLET_ADDRESS.toLowerCase()) {
      return { isValid: false, error: "Incorrect recipient address" };
    }

    // Verify sender matches
    if (transferFrom.toLowerCase() !== fromAddress.toLowerCase()) {
      return { isValid: false, error: "Sender address mismatch" };
    }

    // Verify amount (allow small precision differences)
    const expectedAmountNum = parseFloat(expectedAmount);
    const actualAmountNum = parseFloat(transferAmount);
    const difference = Math.abs(expectedAmountNum - actualAmountNum);

    if (difference > 0.01) {
      // Allow 1 cent difference
      return {
        isValid: false,
        error: `Amount mismatch: expected ${expectedAmount}, got ${transferAmount}`,
      };
    }

    return { isValid: true };
  } catch (error) {
    console.error("Payment verification error:", error);
    return { isValid: false, error: error.message };
  }
}

export default router;
