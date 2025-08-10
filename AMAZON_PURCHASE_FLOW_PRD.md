# PRD: Enhanced Amazon Purchase Flow with Modal & Crypto Payments

## Overview

Redesign the Amazon purchase experience to use a dedicated modal interface with real-time pricing, wallet integration, and streamlined crypto payments while maintaining LLM guidance throughout the process.

---

## 1. LLM Tool Enhancement

### 1.1 Update `get_trending_products` Tool

**Current**: Simple product discovery
**New**: Comprehensive purchase flow initiator

```javascript
{
  type: "function",
  function: {
    name: "get_trending_products",
    description: "MANDATORY: Call this function when users ask about trending products, popular items, what they can buy, shopping, or any product-related queries. This function opens the comprehensive purchase modal that handles product discovery, real-time pricing, and complete payment flow including crypto and Apple Pay options. The modal manages the entire purchase experience, so ALWAYS call this function for any shopping-related requests rather than attempting verbal purchases.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
}
```

### 1.2 Remove Direct Purchase Tool

- Remove `execute_purchase` from LLM tools
- All purchases now flow through the modal system
- LLM provides contextual guidance but doesn't execute purchases directly

---

## 2. Purchase Modal System

### 2.1 Initial Product Display

**Trigger**: `get_trending_products` function call
**UI**: Modal opens showing all trending products
**Features**:

- Product grid with images, names, prices
- "Buy Now" button on each product
- Modal overlay with backdrop dismiss

### 2.2 Single Product Purchase View

**Trigger**: User clicks "Buy Now" on any product
**UI**: Modal transitions to single product focus
**Layout**:

```
┌─────────────────────────────────────┐
│ [X] Close                           │
│                                     │
│ 🔗 Wallet Status: [Connected/Not]  │
│    Address: 0x1234... (if connected)│
│                                     │
│ [Product Image]   [Product Details] │
│                   Name: Yoga Mat    │
│                   Price: Loading... │
│                                     │
│ ⏳ Fetching latest prices...       │
│                                     │
│ [🍎 Pay with Apple Pay]           │
│ [₿ Pay with Crypto]               │
└─────────────────────────────────────┘
```

---

## 3. Real-Time Price Fetching

### 3.1 Price Integration

**Service**: Use `CrossmintQuoteService` functionality
**Implementation**:

- Import quote service logic into frontend
- Call Crossmint API directly from client
- Display loading state during price fetch

### 3.2 Price Display

**Format**:

```javascript
{
  productPrice: "$22.33",
  cryptoPricing: {
    usdc: {
      amount: "23.93",
      currency: "USDC",
      breakdown: {
        basePrice: "21.98",
        tax: "1.95",
        total: "23.93"
      }
    },
    eth: {
      amount: "0.00565",
      currency: "ETH",
      breakdown: {
        basePrice: "0.00519",
        tax: "0.00046",
        total: "0.00565"
      }
    }
  },
  quoteExpiry: "2025-08-09T22:13:51.399Z"
}
```

### 3.3 API Integration

**Endpoint**: Crossmint Staging API
**Method**: Create quote orders for pricing
**Error Handling**: Fallback to hardcoded prices if API fails
**Caching**: 30-minute quote validity

---

## 4. Payment Method Selection

### 4.1 Initial State

**UI**: Two payment buttons visible

- 🍎 Pay with Apple Pay
- ₿ Pay with Crypto

### 4.2 Crypto Payment Selection

**Trigger**: User clicks "Pay with Crypto"
**UI Changes**:

- Apple Pay button disappears with animation
- Crypto button expands to full width
- Button text changes based on wallet status

**States**:

```javascript
// Wallet not connected
"🔗 Connect Wallet to Pay with Crypto";

// Wallet connected
"₿ Pay 23.93 USDC with Crypto";
```

---

## 5. Wallet Status & Integration

### 5.1 Wallet Status Display

**Location**: Top of modal, always visible
**States**:

```javascript
// Not connected
"🔗 Wallet: Not Connected"

// Connected
"🔗 Wallet: Connected
 Address: 0x1234...5678"
```

### 5.2 Wallet Integration

**Library**: Use existing wallet libraries from credit purchase system
**Chain**: Base Mainnet (default)
**Supported Wallets**: MetaMask, WalletConnect, Coinbase Wallet

### 5.3 Connection Flow

**Trigger**: Click "Connect Wallet" button
**Process**:

1. Open wallet connection modal
2. User selects wallet provider
3. Approve connection
4. Update modal UI to show connected state
5. Update payment button text

---

## 6. Crypto Payment Flow

### 6.1 Payment Execution

**Target Wallet**: `0xADc3Ff22E54383C727Ed72c9Fa5BEF578d18d734` (CDP Wallet)
**Currency**: USDC on Base Mainnet
**Amount**: Exact amount from Crossmint quote

### 6.2 Payment Steps

```
1. User clicks "Pay with Crypto"
2. Modal shows transaction details
3. User approves transaction in wallet
4. Frontend monitors transaction status
5. On confirmation, call backend execute_purchase
6. Display purchase confirmation
```

### 6.3 Transaction Monitoring

**Method**: Watch for transaction confirmation
**Timeout**: 5 minutes
**Error Handling**:

- Failed transactions
- Insufficient funds
- User rejection
- Network errors

---

## 7. LLM Integration & Status Updates

### 7.1 LLM Context Awareness

**Events to Track**:

- Modal opened (`products-display`)
- Product selected for purchase
- Payment method selected
- Wallet connection status changes
- Transaction status updates
- Purchase completion

### 7.2 LLM Responses by Stage

```javascript
// Modal opened
"Here are the trending products! Click on any item you'd like to purchase.";

// Product selected
"Great choice on the [product]! The modal will show you the latest prices and payment options.";

// Crypto selected, wallet not connected
"To pay with crypto, you'll need to connect your wallet first. Click the connect button when you're ready!";

// Wallet connected
"Perfect! Your wallet is connected. You can now complete the purchase with crypto.";

// Transaction pending
"Your transaction is processing on the blockchain. This usually takes a few moments...";

// Purchase complete
"Excellent! Your purchase is complete. You should receive confirmation shortly.";
```

### 7.3 Error Guidance

```javascript
// Insufficient funds
"It looks like you don't have enough USDC in your wallet. You'll need at least [amount] USDC to complete this purchase.";

// Transaction failed
"The transaction didn't go through. You can try again or contact support if the issue persists.";

// Price expired
"The price quote has expired. Let me refresh the latest pricing for you.";
```

---

## 8. Backend Integration

### 8.1 Purchase Execution

**Function**: Keep existing `executePurchase` functionality
**Trigger**: After successful crypto transfer
**Parameters**:

```javascript
{
  asin: "amazon:B07H9PZDQW",
  callSessionId: "uuid",
  transactionHash: "0x...", // From frontend
  paymentAmount: "23.93",
  paymentCurrency: "USDC"
}
```

### 8.2 Socket Events

```javascript
// Frontend to Backend
"product-selected" → { asin, sessionId }
"payment-initiated" → { asin, paymentMethod, sessionId }
"crypto-transfer-complete" → { asin, txHash, amount, sessionId }

// Backend to Frontend
"price-quote-ready" → { asin, pricing, expiry }
"purchase-processing" → { asin, status }
"purchase-complete" → { asin, orderId, status }
"purchase-failed" → { asin, error, retryable }
```

---

## 9. Implementation Phases

### Phase 1: Core Modal System

- [x] Update LLM tool description
- [x] Create purchase modal component
- [x] Implement product selection flow
- [x] Basic price display (static)

### Phase 2: Real-time Pricing

- [x] Integrate Crossmint quote service
- [x] Implement price fetching API
- [x] Add loading states and error handling
- [x] Quote expiry management

### Phase 3: Wallet Integration

- [x] Add wallet status display
- [x] Implement wallet connection flow
- [x] Update payment button states
- [x] Handle wallet disconnect scenarios

### Phase 4: Crypto Payments

- [x] Implement USDC transfer flow
- [x] Add transaction monitoring
- [x] Integrate with backend purchase execution
- [x] Add confirmation screens

### Phase 5: LLM Enhancement

- [x] Update LLM prompts for new flow
- [x] Add contextual status responses
- [x] Implement error guidance
- [x] Test complete user journey

---

## 10. Technical Requirements

### 10.1 Frontend Dependencies

- Existing wallet connection libraries
- Web3 providers (MetaMask, WalletConnect)
- Base network configuration
- USDC token contract integration

### 10.2 Backend Dependencies

- Existing `executePurchase` function
- Crossmint API integration
- Socket.io event handling
- Transaction validation

### 10.3 API Requirements

- Crossmint quote API access
- Base network RPC endpoints
- USDC contract interaction
- Transaction monitoring services

---

## 11. Success Metrics

### 11.1 User Experience

- Modal load time < 2 seconds
- Price fetch time < 3 seconds
- Transaction completion rate > 85%
- User abandonment rate < 20%

### 11.2 Technical Performance

- API response time < 1 second
- Wallet connection success rate > 95%
- Transaction monitoring accuracy 100%
- Error rate < 5%

---

## 12. Future Enhancements (Post-MVP)

### 12.1 Apple Pay Integration

- Implement Apple Pay button functionality
- Add fiat-to-crypto conversion
- Handle Apple Pay transaction flow

### 12.2 Enhanced Features

- Multiple cryptocurrency support
- Saved payment methods
- Purchase history
- Refund capabilities

---

This PRD provides a comprehensive roadmap for implementing the enhanced Amazon purchase flow with modal-based UI, real-time pricing, and streamlined crypto payments while maintaining LLM guidance throughout the user journey.
