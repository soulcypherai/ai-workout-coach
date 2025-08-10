# Agent-Ready PRD: Amazon Purchase Integration with Crossmint & GOAT SDK

## Title & One-liner

- **Feature:** Amazon Product Purchase via Crossmint & GOAT SDK Integration  
- **Why / business outcome:** Enable AI agents to execute real Amazon purchases using crypto during voice calls, enhancing user engagement and creating new revenue streams through commerce integration.

---

## 1) Goals & Non-Goals

**Goals (ranked, measurable):**

- **G1:** AI agents can purchase **3 hardcoded Amazon products** using **CDP wallets**.
- **G2:** **Purchase UI** displays in real time during voice calls with visual product cards.
- **G3:** LLM **verbally describes** products and purchase process during calls.
- **G4:** Backend tools integrate with existing **`llmResponder`** pipeline.
- **G5 (added):** **Explicit user confirmation** (voice or click) is required before executing a purchase.

**Non-Goals:**

- NG1: Dynamic product catalog integration (hardcoded products only).  
- NG2: Multiple wallet support (CDP wallets only).  
- NG3: Order tracking or fulfillment management.  
- NG4: User address input UI (hardcoded shipping info).  
- NG5: Tax, discount codes, or multi-item carts.

---

## 2) Users & Use Cases

- **Primary users:** End users during AI agent voice calls.  
- **Top use cases:**
  - User asks about trending products → AI agent shows product cards overlay.  
  - User requests to buy a product → AI agent executes purchase using crypto after **explicit confirmation**.  
  - AI agent proactively suggests products during relevant conversation topics (when feature flag is on).

---

## 3) Constraints & Assumptions

- **Stack:** Node.js/Express server, React/TypeScript frontend, Socket.io, Livekit, CDP SDK, GOAT SDK, Crossmint.
- **Assumptions:** Users have sufficient USDC balance; shipping to a single hardcoded US address; **Base-Sepolia** network for payments.
- **Compliance & limitations:** No scraping; products are hardcoded with their Amazon PDP URLs supplied by admins; purchase is executed via supported payment/check-out rails (Crossmint Headless Checkout).

---

## 4) Feature Breakdown

- **Product Info Tool:** Backend tool returning 3 hardcoded Amazon products.
- **Purchase Tool:** Backend tool executing Crossmint purchases via CDP wallets.
- **Socket Integration:** Real-time product display and purchase completion events during calls.
- **UI Overlay:** Product cards overlay element (reusing exercise UI pattern).
- **LLM Integration:** Tools added to `llmResponder` pipeline with confirmation step enforced.

---

## 5) Data Model

| Entity   | Field         | Type   | Required | Enum/Format                   | Default | Notes                     |
|----------|---------------|--------|----------|-------------------------------|---------|---------------------------|
| Product  | asin          | string | Y        | `amazon:B[0-9A-Z]{9}`         | -       | Amazon product identifier |
| Product  | name          | string | Y        | max 100 chars                 | -       | Product display name      |
| Product  | price         | number | Y        | USD decimal                   | -       | Price in dollars          |
| Product  | url           | string | Y        | `https://amazon.com/...`      | -       | Amazon product page       |
| Product  | imageUrl      | string | Y        | `https://m.media-amazon.com`  | -       | Product image             |
| Purchase | orderId       | string | Y        | Crossmint order ID            | -       | Crossmint transaction ID  |
| Purchase | productAsin   | string | Y        | `amazon:B[0-9A-Z]{9}`         | -       | Purchased product ASIN    |
| Purchase | status        | string | Y        | `pending\|completed\|failed`  | pending | Purchase status           |
| Purchase | callSessionId | string | Y        | UUID                          | -       | Associated call session   |
| Purchase | txHash        | string | N        | `0x...`                       | -       | On-chain hash (optional)  |

**Derived / computed fields:** None  
**Indexes & keys:** `UNIQUE(callSessionId, productAsin)` for idempotency; index on `callSessionId`.  
**Migrations:** New `purchase_logs` table for audit trail.

---

## 6) API Contracts

**Base path:** `/api/v1`

| Method | Path                 | Purpose            | Auth     | Request (shape)                  | Response (shape)                         | Errors                 |
|-------:|----------------------|--------------------|----------|----------------------------------|------------------------------------------|------------------------|
| GET    | `/products/trending` | Get trending items | None     | -                                | `{ products: Product[] }`                | `500`                  |
| POST   | `/purchase/execute`  | Execute purchase   | Internal | `{ asin, callSessionId }`        | `{ orderId, status, txHash? }`           | `400,409,422,500,504`  |
| POST   | `/purchase/confirm`  | Confirm purchase   | Internal | `{ asin, callSessionId, ok }`    | `{ confirmed: boolean }`                 | `400,409`              |

**Error codes**

| Code | Meaning                     | When                                                           |
|------|-----------------------------|----------------------------------------------------------------|
| 400  | Bad request                 | Invalid ASIN/UUID; missing fields                              |
| 409  | Duplicate                   | Existing purchase for `(callSessionId, asin)`                  |
| 422  | Insufficient funds          | Wallet balance not enough                                      |
| 500  | Provider/internal error     | Crossmint/GOAT/CDP errors                                      |
| 504  | Timeout                     | Payment not confirmed within `PURCHASE_TIMEOUT_MS`             |

**Example**

```http
GET /api/v1/products/trending
200 OK
{
  "products": [
    {
      "asin": "amazon:B07H9PZDQW",
      "name": "Gaiam Essentials Thick Yoga Mat Fitness",
      "price": 22.33,
      "url": "https://www.amazon.com/Gaiam-Essentials-Fitness-Exercise-Easy-Cinch/dp/B07H9PZDQW",
      "imageUrl": "https://m.media-amazon.com/images/I/81KUe46J8sL._AC_SL1500_.jpg"
    },
    ...
  ]
}
```

```http
POST /api/v1/purchase/execute
Content-Type: application/json
{ "asin": "amazon:B07H9PZDQW", "callSessionId": "session-123" }

200 OK
{ "orderId": "cm-order-456", "status": "completed", "txHash": "0x789..." }
```

---

## 7) User Flows (Happy Paths)

**Flow A — Product Discovery**  
1) User asks “What are some trending products?” during voice call →  
2) AI agent calls `getTrendingProducts()` tool →  
3) Backend returns 3 hardcoded products →  
4) Socket emits `products-display` to frontend →  
5) UI shows product cards overlay →  
6) AI agent verbally describes products.

**Flow B — Product Purchase**  
1) User says “I want to buy the yoga mat” →  
2) LLM calls `getTrendingProducts()` to map phrase → ASIN →  
3) LLM calls **`/purchase/confirm`** (ok=false) to show confirmation →  
4) User confirms (voice “yes” or clicks confirm) → **`/purchase/confirm`** (ok=true) →  
5) LLM calls `executePurchase(asin, callSessionId)` → Crossmint order created & paid with CDP wallet →  
6) Socket emits `purchase-completed` →  
7) LLM confirms verbally.

**Business rules:** Single hardcoded shipping address; **USDC** payments only; **Base-Sepolia** network.

---

## 8) Edge Cases & Safeguards

- **Rate limits:** 1 purchase per call session; 5 product queries per minute.
- **Retries/backoff:** 3 retries with exponential backoff for blockchain/Crossmint calls.
- **Idempotency keys:** `(callSessionId, asin)` unique.
- **Expiry/cleanup:** Purchase logs retained 30 days; daily cron cleanup.
- **Abuse guardrails:** Max 1 concurrent purchase per session; reject while in-flight.
- **Confirmation required:** No purchase without `/purchase/confirm` success.
- **Admin override:** Feature flag can disable all purchase functionality.
- **Privacy:** Do **not** log `email` or full shipping address in plaintext application logs (store in DB only).

---

## 9) Feature Flags & Config

| Flag / Config               | Default       | Scope         | Notes                                                   |
|----------------------------|---------------|---------------|---------------------------------------------------------|
| `FEAT_AMAZON_PURCHASE_ENABLED` | `false`    | Server + FE   | Gates endpoints, sockets, and LLM tool exposure         |
| `PURCHASE_TIMEOUT_MS`      | `30000`       | Server        | Payment completion timeout                               |
| `MAX_PURCHASES_PER_SESSION`| `1`           | Server        | Enforced on `executePurchase`                            |
| `CDP_WALLET_NETWORK`       | `base-sepolia`| Server        | Wallet network                                          |
| `RPC_PROVIDER_URL`         | _(required)_  | Server        | For viem client                                         |

---

## 10) Security & Access

- **AuthN:** Purchase endpoints are **internal-only** (server→server).  
- **AuthZ:** Feature flag gated.  
- **Secrets:** `CROSSMINT_API_KEY`, `CDP_API_KEY`/`CDP_PRIVATE_KEY` in env only.  
- **Validation:** ASIN regex and UUID enforced (Zod).  
- **Audit logs:** Store `{timestamp, callSessionId, asin, orderId, status, txHash?}`. Avoid logging PII (email/address) in app logs.

---

## 11) Telemetry & Analytics

| Event                        | Trigger                  | Properties                                   | PII? | Destination |
|-----------------------------|--------------------------|----------------------------------------------|------|-------------|
| `product_query_requested`   | `getTrendingProducts()`  | `callSessionId, timestamp`                    | No   | DB          |
| `product_query_displayed`   | FE renders overlay       | `callSessionId, productCount`                 | No   | DB          |
| `purchase_confirm_shown`    | Before purchase          | `asin, callSessionId`                         | No   | DB          |
| `purchase_confirmed`        | User confirmed           | `asin, callSessionId`                         | No   | DB          |
| `purchase_initiated`        | `executePurchase()`      | `asin, callSessionId`                         | No   | DB          |
| `purchase_completed`        | Success                  | `orderId, asin, txHash?, duration_ms`         | No   | DB          |
| `purchase_failed`           | Failure                  | `asin, error_code, duration_ms`               | No   | DB          |

**KPIs:** success rate, average transaction time, confirmation → purchase conversion, tool call frequency.

---

## 12) Operations & Health

- **Runbooks:**  
  - If status `pending` exceeds `PURCHASE_TIMEOUT_MS` → mark `failed` and notify LLM.  
  - Wallet failures → rotate CDP key; verify RPC health.  
  - Socket outage → FE falls back to LLM voice-only narration; retries socket join.
- **Storage limits & cleanup:** Delete purchase logs older than 30 days (daily cron).

---

## 13) Acceptance Criteria (Given/When/Then)

| ID   | Scenario             | Given                                  | When                                    | Then                                                        | Test Type |
|------|----------------------|----------------------------------------|-----------------------------------------|-------------------------------------------------------------|-----------|
| AC-1 | Product Query        | Feature flag enabled                   | LLM calls `getTrendingProducts()`       | Returns **exactly 3** products                              | Unit      |
| AC-2 | UI Display           | Products received via socket           | Frontend receives `products-display`    | Overlay renders 3 product cards                             | E2E       |
| AC-3 | Purchase Success     | Valid ASIN + confirmed                 | Call `executePurchase()`                 | Crossmint order created → `orderId` returned                | E2E       |
| AC-4 | Purchase Duplicate   | Same `(session, asin)` already exists  | `executePurchase()` called again        | `409` duplicate; no new order                               | Unit      |
| AC-5 | Feature Flag Off     | `FEAT_AMAZON_PURCHASE_ENABLED=false`   | Any tool called                         | Returns disabled/empty; overlay hidden                      | Unit      |
| AC-6 | LLM Integration      | Tools registered in `llmResponder`     | Agent processes user query              | Tools available and callable                                | Integration |
| AC-7 | Insufficient Funds   | Wallet USDC balance insufficient       | `executePurchase()`                     | Returns `422` with `INSUFFICIENT_FUNDS`                     | Unit      |
| AC-8 | Confirmation Required | Flag enabled                           | `executePurchase()` without confirm     | Returns `400` `CONFIRMATION_REQUIRED`                       | Unit      |
| AC-9 | Timeout Handling     | Provider latency                       | `executePurchase()` exceeds timeout     | Returns `504` and logs failure                              | Unit      |

---

## 14) Deliverables & CI Gates

**Deliverables (must be in the PR):**

- [ ] Backend tools: `getTrendingProducts()`, `executePurchase()` → `server/tools/amazon-purchase.ts`
- [ ] **Confirmation endpoint**: `POST /purchase/confirm` → `server/routes/purchase.ts`
- [ ] CDP wallet integration replacing private key authentication
- [ ] Socket events: `products-display`, `purchase-completed`
- [ ] Frontend product cards UI overlay component → `src/pages/call/components/ProductCards.tsx`
- [ ] LLM tool registration → `server/pipeline/llmResponder.ts`
- [ ] Purchase audit logging + migration → `server/db/schema.sql`
- [ ] Feature flag configuration → `server/utils/feature-flags.ts`
- [ ] Environment variable docs → `.env.example` & `README.md`

**CI Gates:** unit ≥90% for tools; E2E flow green; lint/typecheck; SQL migration applies cleanly; no plaintext PII in logs (regex check).

---

## 15) Rollout Plan

- **Stage 0:** Dark launch (**flag off**) in production. Observe logs and error rates. Enable by env-scoped toggle.

---

## 16) Dependencies

- **Internal:** `server/pipeline/llmResponder.ts`, socket infrastructure, database.
- **External:** CDP SDK, GOAT SDK (Vercel AI adapter + viem wallet), Crossmint Headless Checkout, Base(-Sepolia) RPC.
- **Environment:** `CROSSMINT_API_KEY`, `CDP_PRIVATE_KEY`/`CDP_API_KEY`, `RPC_PROVIDER_URL`, `FEAT_AMAZON_PURCHASE_ENABLED`.

---

## 17) Open Questions

- Q1: Should we add purchase confirmation step or make it single-click? → **Answer:** Add confirmation (voice or click).
- Q2: What happens if user wallet has insufficient USDC balance? → **Answer:** Return failed; inform user.
- Q3: Should we display estimated delivery times in product cards? → **Answer:** **No**.

---

## 18) Agent Handoff: Task Plan (file paths & signatures)

1) **Backend Tools** — `server/tools/amazon-purchase.ts`  
```ts
export type Product = { asin:string; name:string; price:number; url:string; imageUrl:string };
export type PurchaseResult = { orderId:string; status:"pending"|"completed"|"failed"; txHash?:`0x${string}` };

export async function getTrendingProducts(callSessionId?: string): Promise<Product[]>;
export async function executePurchase(asin: string, callSessionId: string): Promise<PurchaseResult>;
```

2) **Confirmation Endpoint** — `server/routes/purchase.ts`  
```ts
// POST /api/v1/purchase/confirm
// body: { asin:string, callSessionId:string, ok:boolean }
```

3) **LLM Integration** — `server/pipeline/llmResponder.ts`  
- Register tools `getTrendingProducts`, `executePurchase`.  
- Add guardrail: tool executor verifies confirmation via DB/cache before executing.

4) **Socket Events** — `server/sockets/media.ts`  
- Emit `products-display` with `Product[]`.  
- Emit `purchase-completed` with `{ orderId, asin, status, txHash?, callSessionId }`.

5) **Frontend UI** — `src/pages/call/components/ProductCards.tsx`  
- Overlay component `<ProductCards />` with image, name, price, CTA.  
- Listeners: `products-display`, `purchase-completed`.  
- Confirm modal supporting **voice “yes/no”** or button click.

6) **Database Schema** — `server/db/schema.sql`  
```sql
CREATE TABLE IF NOT EXISTS purchase_logs (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_asin TEXT NOT NULL,
  call_session_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','completed','failed')),
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_purchase_session_asin
  ON purchase_logs (call_session_id, product_asin);
```

7) **Feature Flag** — `server/utils/feature-flags.ts`  
```ts
export const flags = { FEAT_AMAZON_PURCHASE_ENABLED: process.env.FEAT_AMAZON_PURCHASE_ENABLED === "true" };
```

8) **Hardcoded Data** — `server/data/sample-products.ts`  
```ts
export const SAMPLE_PRODUCTS = [
  { asin:"amazon:B07H9PZDQW", name:"Gaiam Essentials Thick Yoga Mat Fitness", price:22.33, url:"https://www.amazon.com/Gaiam-Essentials-Fitness-Exercise-Easy-Cinch/dp/B07H9PZDQW", imageUrl:"https://m.media-amazon.com/images/I/81KUe46J8sL._AC_SL1500_.jpg" },
  { asin:"amazon:B0FB7D5PHW", name:"STANLEY ProTour Flip Straw Tumbler", price:35.00, url:"https://www.amazon.com/dp/B0FB7D5PHW", imageUrl:"https://m.media-amazon.com/images/I/71x.jpg" },
  { asin:"amazon:B01LR5S6HK", name:"Amazon Neoprene Dumbbell Hand Weights", price:21.99, url:"https://www.amazon.com/dp/B01LR5S6HK", imageUrl:"https://m.media-amazon.com/images/I/61x.jpg" }
];
export const SHIPPING = {
};
```

9) **Tests** — Unit: `server/tests/amazon-purchase.test.ts` | E2E: `tests/e2e/purchase-flow.test.ts`

10) **Environment Variables** — `.env.example`  
```
FEAT_AMAZON_PURCHASE_ENABLED=false
CROSSMINT_API_KEY=your_key_here
CDP_API_KEY=your_key_here
CDP_PRIVATE_KEY=0x...
RPC_PROVIDER_URL=https://sepolia.base.org
CDP_WALLET_NETWORK=base-sepolia
```

11) **Commands**  
```bash
npm i @coinbase/cdp-sdk @goat-sdk/adapter-vercel-ai @goat-sdk/plugin-crossmint-headless-checkout @goat-sdk/wallet-viem viem
npm i express socket.io uuid zod dotenv
npm i -D typescript ts-node vitest @types/node @types/express @types/socket.io eslint

npm run dev
npm test
npx vitest --run
npx tsc -p tsconfig.json
npx eslint .
```

---

## 19) Pseudocode (Execute Purchase)

```ts
if (!flags.FEAT_AMAZON_PURCHASE_ENABLED) return disabled();

// (1) Confirmed?
if (!await confirmations.isConfirmed(callSessionId, asin)) throw error(400, "CONFIRMATION_REQUIRED");

// (2) Idempotency
const existing = await db.findBySessionAndAsin(callSessionId, asin);
if (existing) return existing;

// (3) Lookup product
const product = SAMPLE_PRODUCTS.find(p => p.asin === asin);
if (!product) throw error(400, "INVALID_ASIN");

// (4) Init wallet & provider (CDP + viem)
const wallet = await createCdpWallet({ network: process.env.CDP_WALLET_NETWORK });
const viemClient = makeViemClient(wallet, process.env.RPC_PROVIDER_URL);

// (5) Create Crossmint order via GOAT plugin
const order = await crossmint.createOrder({
  amount: product.price, currency: "USDC",
  memo: product.name,
  metadata: { asin: product.asin, url: product.url },
  shipping: SHIPPING
});

// (6) Pay order (USDC on Base-Sepolia)
const { txHash } = await crossmint.payOrder({ orderId: order.id, wallet: viemClient });

// (7) Persist + emit
await db.insert({ orderId: order.id, productAsin: asin, callSessionId, status:"completed", txHash });
io.to(sessionRoom(callSessionId)).emit("purchase-completed", { orderId: order.id, asin, status:"completed", txHash, callSessionId });

return { orderId: order.id, status: "completed", txHash };
```

---

## 20) Accessibility & UX

- Overlay: keyboard focus trapping, escape to close, readable text on 4.5:1 contrast, alt text on images.  
- Confirmation: supports both **voice (“yes/no”)** and buttons; timeout auto-cancel after 20s.  
- Error surfacing: clear messages to user without exposing sensitive error details.

---

## 21) Risks & Mitigations

| Risk                              | Mitigation                                                     |
|-----------------------------------|----------------------------------------------------------------|
| Provider downtime/latency         | Retry with backoff; timeout; user-facing failure message       |
| Insufficient funds                | Pre-check USDC balance; short-circuit with `422`               |
| Duplicate purchases               | Unique `(callSessionId, asin)` index                           |
| PII leakage in logs               | Mask/omit email/address from logs                              |
| Feature abuse                     | In-flight locks + per-session limits                           |

---

## 22) Hardcoded Configuration Values

**Shipping Information:**

**Blockchain Configuration:**

- Network: **base-sepolia**  
- Platform: **EVM**  
- Payment Token: **USDC**

**Sample Products (from `/amazon-agentic-purchases/sample-products`):**

1. Gaiam Essentials Thick Yoga Mat Fitness — **$22.33** — `amazon:B07H9PZDQW`  
2. STANLEY ProTour Flip Straw Tumbler — **$35.00** — `amazon:B0FB7D5PHW`  
3. Amazon Neoprene Dumbbell Hand Weights — **$21.99** — `amazon:B01LR5S6HK`

---

## 23) Final Checklist (for code agent)

- [ ] Implement files & functions (see §18) with feature flag guards.  
- [ ] Add Zod schemas, rate limiting, and idempotency.  
- [ ] Wire sockets and FE overlay; add confirmation flow.  
- [ ] Create DB migration & unique index; add telemetry events.  
- [ ] Register tools in `llmResponder`; add unit + E2E tests.  
- [ ] Verify Node 18+, env vars, and RPC endpoint reachability.

