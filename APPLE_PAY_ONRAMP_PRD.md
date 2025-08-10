# PRD: Apple Pay On-Ramp Integration for Amazon Purchase Flow

## Overview

Implement Coinbase CDP on-ramp functionality for the Apple Pay button in the Amazon purchase modal to enable users to purchase USDC directly to the CDP wallet address using Apple Pay, completing the purchase flow seamlessly.

---

## 1. Current State Analysis

### 1.1 Existing Implementation

- ✅ Purchase modal with Apple Pay button (currently non-functional)
- ✅ Crypto payment flow with USDC transfer to CDP wallet
- ✅ Real-time pricing from Crossmint API
- ✅ Wallet integration and payment verification
- ✅ CDP wallet address: `0xADc3Ff22E54383C727Ed72c9Fa5BEF578d18d734`

### 1.2 Required Enhancement

- 🔄 Make Apple Pay button functional
- 🔄 Integrate Coinbase CDP on-ramp for fiat-to-USDC conversion
- 🔄 Direct USDC purchase to CDP wallet address
- 🔄 Payment monitoring and completion flow

---

## 2. Technical Architecture

### 2.1 CDP On-Ramp Integration Stack

```typescript
Dependencies:
- @coinbase/onchainkit/fund
- CDP Project ID: "d86ea475-e67f-4728-b72e-f218596dbee9"
- Target Network: Base Mainnet
- Target Currency: USDC
- Destination: "0xADc3Ff22E54383C727Ed72c9Fa5BEF578d18d734"
```

### 2.2 Payment Flow Architecture

```
User Clicks Apple Pay → Generate On-Ramp URL → Redirect to Coinbase Pay →
Apple Pay Payment → USDC Purchase → Transfer to CDP Wallet →
Monitor Transaction → Complete Amazon Purchase
```

### 2.3 Event Flow

```javascript
1. Apple Pay Initiation
2. On-ramp URL Generation
3. Payment Redirection
4. Payment Completion
5. Transaction Monitoring
6. Purchase Execution
```

---

## 3. Implementation Steps

### 3.1 Phase 1: CDP On-Ramp Service Implementation

**File**: `src/services/CDPOnRampService.ts`

```typescript
import { getOnrampBuyUrl } from "@coinbase/onchainkit/fund";

interface OnRampConfig {
  projectId: string;
  destinationAddress: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  redirectUrl: string;
}

class CDPOnRampService {
  private static readonly CDP_PROJECT_ID =
    "d86ea475-e67f-4728-b72e-f218596dbee9";
  private static readonly CDP_WALLET_ADDRESS =
    "0xADc3Ff22E54383C727Ed72c9Fa5BEF578d18d734";

  static generateApplePayOnRampUrl(
    amount: string,
    productAsin: string,
  ): string {
    const redirectUrl = `${window.location.origin}/amazon-purchase-return?asin=${productAsin}&amount=${amount}`;

    return getOnrampBuyUrl({
      projectId: this.CDP_PROJECT_ID,
      addresses: {
        [this.CDP_WALLET_ADDRESS]: ["base"],
      },
      assets: ["USDC"],
      presetFiatAmount: parseFloat(amount),
      fiatCurrency: "USD",
      paymentMethods: ["APPLE_PAY"],
      redirectUrl: redirectUrl,
      partnerUserId: `amazon-purchase-${Date.now()}`,
    });
  }
}
```

### 3.2 Phase 2: Apple Pay Button Enhancement

**File**: `src/components/modals/PurchaseModal.tsx`

Update the Apple Pay button implementation:

```typescript
// Add state for Apple Pay flow
const [applePayLoading, setApplePayLoading] = useState(false);
const [applePayRedirectUrl, setApplePayRedirectUrl] = useState<string | null>(null);

// Apple Pay handler
const handleApplePayment = async () => {
  if (!cryptoPricing?.usdc?.amount) {
    console.error('No pricing available for Apple Pay');
    return;
  }

  try {
    setApplePayLoading(true);

    // Generate on-ramp URL
    const onRampUrl = CDPOnRampService.generateApplePayOnRampUrl(
      cryptoPricing.usdc.breakdown.total,
      product.asin
    );

    console.log('🍎 Redirecting to Apple Pay on-ramp:', onRampUrl);

    // Emit Apple Pay initiation event
    if ((window as any).mediaSocket) {
      (window as any).mediaSocket.emit("apple-pay-initiated", {
        amount: cryptoPricing.usdc.breakdown.total,
        currency: "USD",
        targetCurrency: "USDC",
        destinationAddress: CDPOnRampService.CDP_WALLET_ADDRESS,
        sessionId: Date.now().toString(),
        timestamp: Date.now(),
      });
    }

    // Redirect to Coinbase Pay
    window.location.href = onRampUrl;

  } catch (error) {
    console.error('❌ Apple Pay initialization failed:', error);

    // Emit failure event
    if ((window as any).mediaSocket) {
      (window as any).mediaSocket.emit("apple-pay-failed", {
        error: error instanceof Error ? error.message : "Apple Pay initialization failed",
        sessionId: Date.now().toString(),
        timestamp: Date.now(),
      });
    }
  } finally {
    setApplePayLoading(false);
  }
};

// Update Apple Pay button
<Button
  className="font-primary w-full bg-white py-3 text-black hover:bg-gray-100"
  disabled={priceLoading || applePayLoading || !cryptoPricing}
  onClick={handleApplePayment}
>
  {applePayLoading
    ? "🔄 Initializing Apple Pay..."
    : "🍎 Pay with Apple Pay"
  }
</Button>
```

### 3.3 Phase 3: Return Page Implementation

**File**: `src/pages/amazon-purchase-return/index.tsx`

```typescript
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CDPTransactionMonitor } from '@/services/CDPTransactionMonitor';

const AmazonPurchaseReturn = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
  const [message, setMessage] = useState('Processing your Apple Pay transaction...');

  const asin = searchParams.get('asin');
  const amount = searchParams.get('amount');
  const onrampTransactionId = searchParams.get('onramp_transaction_id');

  useEffect(() => {
    const monitorAndExecute = async () => {
      if (!onrampTransactionId || !asin || !amount) {
        setStatus('failed');
        setMessage('Missing transaction details');
        return;
      }

      try {
        // Monitor CDP wallet for USDC receipt
        const result = await CDPTransactionMonitor.waitForUSDCReceipt(
          amount,
          onrampTransactionId,
          30000 // 30 second timeout
        );

        if (result.success) {
          // Execute Amazon purchase
          await executeAmazonPurchase(asin, amount, result.txHash);
          setStatus('success');
          setMessage('Purchase completed successfully!');

          // Redirect after success
          setTimeout(() => navigate('/'), 3000);
        } else {
          setStatus('failed');
          setMessage('Transaction monitoring failed');
        }
      } catch (error) {
        setStatus('failed');
        setMessage('Purchase execution failed');
      }
    };

    monitorAndExecute();
  }, [onrampTransactionId, asin, amount]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      {/* Status display component */}
    </div>
  );
};
```

### 3.4 Phase 4: Transaction Monitoring Service

**File**: `src/services/CDPTransactionMonitor.ts`

```typescript
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

export class CDPTransactionMonitor {
  private static readonly USDC_CONTRACT =
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  private static readonly CDP_WALLET =
    "0xADc3Ff22E54383C727Ed72c9Fa5BEF578d18d734";

  private static client = createPublicClient({
    chain: base,
    transport: http(),
  });

  static async waitForUSDCReceipt(
    expectedAmount: string,
    onrampTxId: string,
    timeoutMs: number = 300000, // 5 minutes
  ): Promise<{ success: boolean; txHash?: string; amount?: string }> {
    const startTime = Date.now();
    const expectedAmountWei = BigInt(
      Math.floor(parseFloat(expectedAmount) * 1e6),
    ); // USDC has 6 decimals

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Check recent USDC transfers to CDP wallet
        const logs = await this.client.getLogs({
          address: this.USDC_CONTRACT,
          fromBlock: "latest",
          toBlock: "latest",
          topics: [
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // Transfer event
            null, // from (any address)
            `0x000000000000000000000000${this.CDP_WALLET.slice(2)}`, // to CDP wallet
          ],
        });

        for (const log of logs) {
          const amount = BigInt(log.data);
          if (amount >= expectedAmountWei) {
            return {
              success: true,
              txHash: log.transactionHash,
              amount: (Number(amount) / 1e6).toString(),
            };
          }
        }

        // Wait 5 seconds before next check
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (error) {
        console.error("Error monitoring transactions:", error);
      }
    }

    return { success: false };
  }
}
```

### 3.5 Phase 5: Backend Integration

**File**: `server/routes/cdpOnRamp.js`

```javascript
import { fetchOnrampTransactionStatus } from "@coinbase/onchainkit/fund";
import express from "express";

const router = express.Router();

// Check on-ramp transaction status
router.get("/transaction-status/:transactionId", async (req, res) => {
  try {
    const { transactionId } = req.params;

    const status = await fetchOnrampTransactionStatus({
      partnerUserId: `amazon-purchase-${transactionId}`,
      pageSize: "10",
      apiKey: process.env.CDP_API_KEY,
    });

    res.json(status);
  } catch (error) {
    console.error("Error fetching transaction status:", error);
    res.status(500).json({ error: "Failed to fetch transaction status" });
  }
});

// Handle on-ramp completion webhook
router.post("/webhook", async (req, res) => {
  try {
    const { event, data } = req.body;

    if (event === "onramp.transaction.completed") {
      // Process successful on-ramp
      const { transaction_id, partner_user_id, purchase_amount } = data;

      // Emit socket event for frontend
      if (global.io) {
        global.io.emit("onramp-completed", {
          transactionId: transaction_id,
          partnerUserId: partner_user_id,
          amount: purchase_amount.value,
          currency: purchase_amount.currency,
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
```

---

## 4. Configuration Requirements

### 4.1 Environment Variables

```bash
# CDP Configuration
CDP_PROJECT_ID=d86ea475-e67f-4728-b72e-f218596dbee9
CDP_API_KEY=your_cdp_api_key
CDP_API_SECRET=your_cdp_api_secret
CDP_WALLET_ADDRESS=0xADc3Ff22E54383C727Ed72c9Fa5BEF578d18d734

# Frontend URLs
FRONTEND_URL=http://localhost:3004
ONRAMP_REDIRECT_URL=http://localhost:3004/amazon-purchase-return
```

### 4.2 OnchainKit Provider Setup

**File**: `src/provider/OnchainKitProvider.tsx`

```typescript
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from 'viem/chains';

export const AppOnchainKitProvider = ({ children }) => {
  return (
    <OnchainKitProvider
      apiKey={process.env.VITE_CDP_API_KEY}
      chain={base}
      config={{
        appearance: {
          name: 'AI Shark',
          logo: '/watermark-logo.png',
        },
      }}
    >
      {children}
    </OnchainKitProvider>
  );
};
```

---

## 5. User Experience Flow

### 5.1 Happy Path

1. **Product Selection**: User selects product in purchase modal
2. **Payment Choice**: User clicks "🍎 Pay with Apple Pay" button
3. **URL Generation**: System generates Coinbase on-ramp URL with correct parameters
4. **Redirect**: User redirected to Coinbase Pay platform
5. **Apple Pay**: User completes payment through Apple Pay on Coinbase
6. **USDC Purchase**: Coinbase converts fiat to USDC and sends to CDP wallet
7. **Return**: User redirected back to app with transaction details
8. **Monitoring**: App monitors CDP wallet for USDC receipt
9. **Verification**: USDC amount and transaction verified
10. **Purchase**: Amazon purchase executed with confirmed payment
11. **Completion**: Success message and order confirmation

### 5.2 Error Handling

- **Network Issues**: Retry mechanism with exponential backoff
- **Payment Failures**: Clear error messages and retry options
- **Timeout Scenarios**: Graceful degradation with manual verification
- **Amount Mismatches**: Validation and user notification

---

## 6. Payment Parameters

### 6.1 On-Ramp URL Parameters

```typescript
{
  projectId: 'a353ad87-5af2-4bc7-af5b-884e6aabf088',
  addresses: {
    '0xADc3Ff22E54383C727Ed72c9Fa5BEF578d18d734': ['base']
  },
  assets: ['USDC'],
  presetFiatAmount: parseFloat(totalAmount), // From Crossmint pricing
  fiatCurrency: 'USD',
  paymentMethods: ['APPLE_PAY'],
  redirectUrl: `${FRONTEND_URL}/amazon-purchase-return?asin=${asin}&amount=${amount}`,
  partnerUserId: `amazon-purchase-${timestamp}`,
}
```

### 6.2 Amount Calculations

```typescript
// Use Crossmint pricing for consistency
const totalAmount = cryptoPricing.usdc.breakdown.total; // e.g., "23.93"
const basePrice = cryptoPricing.usdc.breakdown.basePrice; // e.g., "21.98"
const tax = cryptoPricing.usdc.breakdown.tax; // e.g., "1.95"
```

---

## 7. Testing Strategy

### 7.1 Development Testing

1. **Sandbox Environment**: Use CDP testnet for initial testing
2. **Mock Transactions**: Simulate successful and failed scenarios
3. **URL Generation**: Verify correct parameter encoding
4. **Redirect Flow**: Test complete user journey

### 7.2 Integration Testing

1. **Real Apple Pay**: Test with small amounts on mainnet
2. **Transaction Monitoring**: Verify USDC receipt detection
3. **Purchase Execution**: Confirm Amazon API integration
4. **Error Scenarios**: Test failure modes and recovery

### 7.3 User Acceptance Testing

1. **Mobile Safari**: Primary Apple Pay environment
2. **Desktop Safari**: Alternative Apple Pay flow
3. **Cross-browser**: Ensure graceful degradation
4. **Performance**: Monitor load times and response

---

## 8. Security Considerations

### 8.1 Transaction Security

- **Amount Validation**: Verify received USDC matches expected amount
- **Address Verification**: Ensure transfers go to correct CDP wallet
- **Time Windows**: Implement reasonable timeout periods
- **Replay Protection**: Use unique partner user IDs

### 8.2 Data Security

- **No Private Keys**: Frontend only generates URLs, no key handling
- **Secure Redirects**: Validate return URLs and parameters
- **Error Logging**: Log without exposing sensitive data
- **Rate Limiting**: Prevent abuse of on-ramp generation

---

## 9. Monitoring and Analytics

### 9.1 Key Metrics

- **Conversion Rate**: Apple Pay button clicks to completed purchases
- **Drop-off Points**: Where users abandon the flow
- **Transaction Times**: Average time from click to completion
- **Error Rates**: Frequency and types of failures

### 9.2 Tracking Events

```typescript
// Analytics events to implement
"apple_pay_initiated";
"onramp_redirect";
"payment_completed";
"usdc_received";
"purchase_executed";
"purchase_completed";
"apple_pay_failed";
"timeout_occurred";
```

---

## 10. Future Enhancements

### 10.1 Phase 2 Features

- **Google Pay Integration**: Add additional payment methods
- **Currency Options**: Support for EUR, GBP, etc.
- **Amount Customization**: Allow users to buy more USDC than needed
- **Saved Preferences**: Remember user payment method choices

### 10.2 Advanced Features

- **Wallet Integration**: Option to send USDC to user's personal wallet
- **Refund Handling**: Process refunds through CDP off-ramp
- **Batch Purchases**: Support multiple item purchases
- **Subscription Support**: Recurring payment integration

---

## 11. Implementation Timeline

### Week 1: Foundation

- [ ] CDP OnRamp service implementation
- [ ] Environment configuration
- [ ] Basic URL generation testing

### Week 2: Frontend Integration

- [ ] Apple Pay button enhancement
- [ ] Payment flow integration
- [ ] Return page implementation

### Week 3: Backend & Monitoring

- [ ] Transaction monitoring service
- [ ] Webhook handling
- [ ] Error handling implementation

### Week 4: Testing & Polish

- [ ] End-to-end testing
- [ ] Error scenario testing
- [ ] UI/UX refinements
- [ ] Performance optimization

---

## 12. Success Criteria

### 12.1 Functional Requirements

- ✅ Apple Pay button generates valid on-ramp URLs
- ✅ Users can complete fiat-to-USDC purchases
- ✅ USDC is deposited to correct CDP wallet address
- ✅ Transaction monitoring detects payments correctly
- ✅ Amazon purchases execute after payment confirmation

### 12.2 Performance Requirements

- **URL Generation**: < 500ms response time
- **Payment Detection**: < 30 seconds after completion
- **Purchase Execution**: < 10 seconds after USDC receipt
- **Error Recovery**: Clear messaging within 5 seconds

### 12.3 User Experience Requirements

- **Seamless Flow**: Minimal clicks and redirects
- **Clear Status**: Always show current step and progress
- **Error Clarity**: Actionable error messages
- **Mobile Optimized**: Excellent Apple Pay experience on iOS

---

This PRD provides a comprehensive implementation plan for integrating Coinbase CDP on-ramp functionality with the Apple Pay button, enabling users to purchase USDC directly to the CDP wallet address and complete Amazon purchases seamlessly.
