// Enhanced LLM Purchase Flow Integration
// Provides contextual guidance throughout the crypto purchase journey
import { logger } from "../lib/cloudwatch-logger.js";

/**
 * Purchase Flow Status Tracker
 * Maintains state of user's current position in purchase flow
 */
class PurchaseFlowTracker {
  constructor() {
    this.userSessions = new Map(); // sessionId -> flowState
  }

  updateUserFlowState(sessionId, state, data = {}) {
    const currentState = this.userSessions.get(sessionId) || {};
    const newState = {
      ...currentState,
      status: state,
      timestamp: Date.now(),
      data: { ...currentState.data, ...data },
    };

    this.userSessions.set(sessionId, newState);
    logger.info(`Purchase flow updated: ${sessionId} -> ${state}`, {
      component: "purchaseFlow",
      sessionId,
      state,
      data,
    });

    return newState;
  }

  getUserFlowState(sessionId) {
    return this.userSessions.get(sessionId) || { status: "idle" };
  }

  clearUserFlowState(sessionId) {
    this.userSessions.delete(sessionId);
  }
}

export const purchaseFlowTracker = new PurchaseFlowTracker();

/**
 * Enhanced LLM Context Generator
 * Provides context-aware prompts based on purchase flow state
 */
export class EnhancedLLMContext {
  /**
   * Generate contextual system prompt based on purchase flow state
   */
  static generateContextualPrompt(sessionId, basePersona) {
    const flowState = purchaseFlowTracker.getUserFlowState(sessionId);
    const statusContext = this.getStatusContext(flowState);

    return `${basePersona}

PURCHASE FLOW CONTEXT:
${statusContext}

IMPORTANT BEHAVIORAL GUIDELINES:
1. If user asks about shopping/products/trending items, ALWAYS call get_trending_products function
2. Provide contextual guidance based on current purchase flow status
3. Be encouraging and helpful throughout the purchase journey
4. Address any concerns or errors with clear, actionable guidance
5. Celebrate successful purchases and confirmed transactions

Current user status: ${flowState.status}
${flowState.data ? `Additional context: ${JSON.stringify(flowState.data)}` : ""}`;
  }

  /**
   * Get status-specific context for LLM prompts
   */
  static getStatusContext(flowState) {
    switch (flowState.status) {
      case "products-displayed":
        return `The user has opened the purchase modal and can see trending products. Guide them to select a product they'd like to purchase. Be encouraging about the available options.`;

      case "product-selected":
        return `User selected "${flowState.data?.productName || "a product"}" for purchase. The modal is now showing real-time pricing and payment options. Help them understand the payment process and pricing information.`;

      case "wallet-connecting":
        return `User is in the process of connecting their crypto wallet. Provide encouragement and explain what's happening. Let them know this enables crypto payments.`;

      case "wallet-connected":
        return `User's wallet is successfully connected (${flowState.data?.address || "address available"}). They can now proceed with crypto payment. Explain the next steps clearly.`;

      case "wallet-disconnected":
        return `User's wallet was disconnected. They'll need to reconnect to proceed with crypto payment. Offer to help them reconnect.`;

      case "crypto-payment-initiated":
        return `User clicked "Pay with Crypto" and the transaction is being prepared. Explain that they'll need to approve the transaction in their wallet.`;

      case "transaction-pending":
        return `Crypto payment transaction is pending on the blockchain. Transaction hash: ${flowState.data?.txHash || "processing"}. Let them know this is normal and usually takes a few minutes.`;

      case "transaction-confirming":
        return `Payment transaction is confirmed! Now verifying the transaction details before executing the Amazon purchase. Almost complete!`;

      case "purchase-executing":
        return `Payment verified successfully! Now executing the Amazon purchase. This final step should complete shortly.`;

      case "purchase-completed":
        return `🎉 Purchase completed successfully! Order ID: ${flowState.data?.orderId || "available in confirmation"}. Congratulate the user and let them know they'll receive order confirmation.`;

      case "purchase-failed":
        return `Purchase encountered an error: ${flowState.data?.error || "Unknown error"}. Provide helpful guidance and suggest next steps or retry options.`;

      case "insufficient-funds":
        return `User doesn't have enough USDC in their wallet. Need ${flowState.data?.required || "amount"} USDC but have ${flowState.data?.available || "amount"}. Guide them on how to get more USDC.`;

      case "price-expired":
        return `The price quote has expired. Let them know you're refreshing the latest pricing and they can try again.`;

      case "transaction-failed":
        return `The blockchain transaction failed: ${flowState.data?.error || "Unknown error"}. Offer to help them try again or troubleshoot the issue.`;

      default:
        return `User is ready to explore products and make purchases. When they ask about shopping, trending items, or what they can buy, call the get_trending_products function to open the purchase modal.`;
    }
  }

  /**
   * Generate contextual response suggestions based on flow state
   */
  static getContextualResponseSuggestions(flowState) {
    const suggestions = [];

    switch (flowState.status) {
      case "products-displayed":
        suggestions.push(
          "Here are the trending products! Click on any item you'd like to purchase.",
          "I can see the products are loaded. Which one catches your eye?",
          "Take your time browsing - click 'Buy Now' on anything that interests you!",
        );
        break;

      case "product-selected":
        suggestions.push(
          `Great choice on the ${flowState.data?.productName || "product"}! The modal will show you the latest prices and payment options.`,
          "Perfect selection! You'll see real-time pricing and can choose between Apple Pay or crypto payment.",
          "Excellent pick! The system is fetching the latest pricing for you now.",
        );
        break;

      case "wallet-connected":
        suggestions.push(
          "Perfect! Your wallet is connected. You can now complete the purchase with crypto.",
          `Wallet connected successfully! Address: ${flowState.data?.address?.slice(0, 6)}...${flowState.data?.address?.slice(-4)}. Ready to proceed!`,
          "Great! Your crypto wallet is ready. You can now pay with USDC on Base.",
        );
        break;

      case "transaction-pending":
        suggestions.push(
          "Your transaction is processing on the blockchain. This usually takes a few moments...",
          `Transaction submitted! You can track it here: ${flowState.data?.explorerUrl || "on BaseScan"}`,
          "Payment is being confirmed on Base network. Almost there!",
        );
        break;

      case "purchase-completed":
        suggestions.push(
          "🎉 Excellent! Your purchase is complete. You should receive confirmation shortly.",
          `Amazing! Order ${flowState.data?.orderId || "completed"} is all set. Check your email for details!`,
          "Success! Your crypto payment went through and the item is ordered. Well done!",
        );
        break;

      case "purchase-failed":
        suggestions.push(
          "The purchase didn't go through, but don't worry - we can try again or I can help troubleshoot.",
          "Something went wrong with the purchase execution. Your payment may need to be refunded. Let me help you resolve this.",
          "There was an issue completing the purchase. Please try again or contact support if it persists.",
        );
        break;
    }

    return suggestions;
  }
}

/**
 * Purchase Flow Event Handlers
 * Handle socket events and update LLM context accordingly
 */
export class PurchaseFlowEventHandler {
  static handleProductsDisplayed(socket, sessionId, data = {}) {
    purchaseFlowTracker.updateUserFlowState(
      sessionId,
      "products-displayed",
      data,
    );

    // Emit contextual guidance to LLM
    socket.emit("llm-context-update", {
      type: "products-displayed",
      guidance: "User can see trending products. Encourage selection.",
      sessionId,
    });
  }

  static handleProductSelected(socket, sessionId, data = {}) {
    purchaseFlowTracker.updateUserFlowState(
      sessionId,
      "product-selected",
      data,
    );

    const suggestions = EnhancedLLMContext.getContextualResponseSuggestions(
      purchaseFlowTracker.getUserFlowState(sessionId),
    );

    socket.emit("llm-context-update", {
      type: "product-selected",
      guidance: "Product selected, pricing being fetched.",
      suggestions,
      sessionId,
      data,
    });
  }

  static handleWalletConnected(socket, sessionId, data = {}) {
    purchaseFlowTracker.updateUserFlowState(
      sessionId,
      "wallet-connected",
      data,
    );

    socket.emit("llm-context-update", {
      type: "wallet-connected",
      guidance: "Wallet connected successfully. Ready for crypto payment.",
      sessionId,
      data,
    });
  }

  static handleWalletDisconnected(socket, sessionId, data = {}) {
    purchaseFlowTracker.updateUserFlowState(
      sessionId,
      "wallet-disconnected",
      data,
    );

    socket.emit("llm-context-update", {
      type: "wallet-disconnected",
      guidance: "Wallet disconnected. Need to reconnect for crypto payment.",
      sessionId,
      data,
    });
  }

  static handleCryptoPaymentInitiated(socket, sessionId, data = {}) {
    purchaseFlowTracker.updateUserFlowState(
      sessionId,
      "crypto-payment-initiated",
      data,
    );

    socket.emit("llm-context-update", {
      type: "crypto-payment-initiated",
      guidance: "Crypto payment initiated. Waiting for wallet approval.",
      sessionId,
      data,
    });
  }

  static handleTransactionConfirmed(socket, sessionId, data = {}) {
    purchaseFlowTracker.updateUserFlowState(
      sessionId,
      "transaction-confirming",
      data,
    );

    socket.emit("llm-context-update", {
      type: "transaction-confirming",
      guidance: "Transaction confirmed! Verifying payment details.",
      sessionId,
      data,
    });
  }

  static handleTransactionPending(socket, sessionId, data = {}) {
    purchaseFlowTracker.updateUserFlowState(
      sessionId,
      "transaction-pending",
      data,
    );

    socket.emit("llm-context-update", {
      type: "transaction-pending",
      guidance: "Transaction pending on blockchain.",
      sessionId,
      data,
    });
  }

  static handlePurchaseCompleted(socket, sessionId, data = {}) {
    purchaseFlowTracker.updateUserFlowState(
      sessionId,
      "purchase-completed",
      data,
    );

    socket.emit("llm-context-update", {
      type: "purchase-completed",
      guidance: "Purchase completed successfully!",
      sessionId,
      data,
    });

    // Clear flow state after successful completion
    setTimeout(() => {
      purchaseFlowTracker.clearUserFlowState(sessionId);
    }, 60000); // Clear after 1 minute
  }

  static handlePurchaseFailed(socket, sessionId, data = {}) {
    purchaseFlowTracker.updateUserFlowState(sessionId, "purchase-failed", data);

    socket.emit("llm-context-update", {
      type: "purchase-failed",
      guidance: "Purchase failed. Provide support and retry options.",
      sessionId,
      data,
    });
  }

  static handleInsufficientFunds(socket, sessionId, data = {}) {
    purchaseFlowTracker.updateUserFlowState(
      sessionId,
      "insufficient-funds",
      data,
    );

    socket.emit("llm-context-update", {
      type: "insufficient-funds",
      guidance: "User needs more USDC in wallet.",
      sessionId,
      data,
    });
  }
}

/**
 * Enhanced Error Guidance System
 */
export class PurchaseErrorGuidance {
  static getErrorGuidance(errorType, errorData = {}) {
    const guidance = {
      "insufficient-funds": {
        message: `You need ${errorData.required || "more"} USDC in your wallet, but you currently have ${errorData.available || "0"} USDC. You can get USDC by:
        
1. **Buy on Coinbase**: Purchase USDC and transfer to your wallet
2. **Use Base Bridge**: Bridge USDC from Ethereum mainnet
3. **Swap on Base**: Use Uniswap to swap other tokens for USDC
4. **Receive from friends**: Ask someone to send you USDC on Base

Would you like me to help you with any of these options?`,
        actions: ["retry-payment", "get-usdc-help", "choose-different-payment"],
      },

      "transaction-failed": {
        message: `Your transaction didn't go through. This can happen for several reasons:

1. **Gas fees too low**: Try increasing gas fees in your wallet
2. **Network congestion**: Wait a moment and try again
3. **Insufficient gas**: Make sure you have some ETH for gas fees
4. **User cancelled**: You may have rejected the transaction

Would you like to try the payment again?`,
        actions: ["retry-payment", "check-wallet", "contact-support"],
      },

      "wallet-connection-failed": {
        message: `Having trouble connecting your wallet? Try these steps:

1. **Refresh the page** and try again
2. **Check your wallet extension** is unlocked
3. **Switch to Base network** in your wallet
4. **Clear browser cache** if issues persist

Which wallet are you using? I can provide specific instructions.`,
        actions: ["retry-connection", "wallet-help", "try-different-wallet"],
      },

      "price-expired": {
        message: `The price quote expired, but no worries! Crypto prices change frequently, so we refresh quotes every 30 minutes for accuracy. 

I'm getting you the latest pricing now. The new price might be slightly different due to market changes.`,
        actions: ["refresh-pricing", "proceed-with-new-price"],
      },

      "purchase-execution-failed": {
        message: `Your crypto payment went through successfully, but there was an issue executing the Amazon purchase. Don't worry - your payment is safe and we'll resolve this.

Please contact our support team with this transaction hash: ${errorData.txHash || "Available in transaction history"}

We'll either complete your purchase or refund your payment.`,
        actions: ["contact-support", "retry-purchase", "request-refund"],
      },
    };

    return (
      guidance[errorType] || {
        message:
          "An unexpected error occurred. Please try again or contact support if the issue persists.",
        actions: ["retry", "contact-support"],
      }
    );
  }
}

export default {
  purchaseFlowTracker,
  EnhancedLLMContext,
  PurchaseFlowEventHandler,
  PurchaseErrorGuidance,
};
