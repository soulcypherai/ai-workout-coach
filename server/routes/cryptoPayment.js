import { ethers } from "ethers";
import { Router } from "express";

import { paymentProcessorAbi } from "../abis/paymentProcessorAbi.js";
import pool from "../db/index.js";
import { verifyJWTMiddleware } from "../middleware/auth.js";

const router = Router();

const contractDetails = {
  development: {
    chainId: 84532,
    startBlock: 28026077,
    contractAddress: "0x0943755a0F051112A9eFf4c5Bc843eb6C8d76Fb8",
    tokenAddress: "0x1988a7591c5206c4a90d881f6c83e1d6fd57814d",
    rpc: "https://base-sepolia.infura.io/v3/7c4e9e4322bc446195e561d9ea27d827",
  },
  production: {
    chainId: 8453,
    startBlock: 32676860,
    contractAddress: "0x7651f9f73d9f467fc68089d3a2Ca38d6d29aAcbF",
    tokenAddress: "0xb69938B92ba1ab2a4078DDb3d5c3472faa13C162",
    rpc: "https://base-mainnet.g.alchemy.com/v2/8tkQHSR-1iF2piwZbSB-RRSqTeuUX_-q",
  },
};

const sharkTokenAddress = "0xb69938b92ba1ab2a4078ddb3d5c3472faa13c162";

// Load validator's private key securely
const validatorPrivateKey = process.env.VALIDATOR_PRIVATE_KEY;
const validatorWallet = new ethers.Wallet(validatorPrivateKey);

const environment = process.env.NODE_ENV || "development";
const { chainId, startBlock, contractAddress, rpc } =
  contractDetails[environment];

const provider = new ethers.JsonRpcProvider(rpc);
const paymentProcessor = new ethers.Contract(
  contractAddress,
  paymentProcessorAbi,
  provider,
);

async function getTokenPriceUsd() {
  try {
    const response = await fetch(
      `https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${sharkTokenAddress}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch price: ${response.status}`);
    }

    const json = await response.json();
    const price = json?.data?.attributes?.token_prices?.[sharkTokenAddress];

    if (!price) {
      throw new Error("Price not found in response");
    }

    return parseFloat(price);
  } catch (error) {
    console.error("[getTokenPriceUsd] Error fetching token price:", error);
  }
}

/**
 * @route POST /api/get-quotation
 */
router.post("/get-quotation", verifyJWTMiddleware, async (req, res) => {
  try {
    const { priceUsd } = req.body;
    const userId = req.user.userId;

    if (!priceUsd) {
      return res.status(400).json({ error: "Missing priceUsd" });
    }

    // Fetch user
    const userResult = await pool.query('SELECT * FROM "User" WHERE id = $1', [
      userId,
    ]);
    const userRow = userResult.rows[0];

    if (!userRow) {
      return res.status(404).json({ error: "User not found" });
    }

    // Handle id_hash
    let idHash = userRow.id_hash;
    if (!idHash) {
      idHash = ethers.keccak256(ethers.toUtf8Bytes(userRow.id));
      await pool.query('UPDATE "User" SET id_hash = $1 WHERE id = $2', [
        idHash,
        userRow.id,
      ]);
    }

    // Load system settings
    const settingsResult = await pool.query(`
      SELECT setting_key, setting_value, setting_type
      FROM "SystemSettings"
      WHERE setting_key IN ('credits_usd_price', 'credits_min_purchase', 'credits_max_purchase')
    `);

    let creditPrice = 0.1;
    let minPurchase = 10;
    let maxPurchase = 1000;

    settingsResult.rows.forEach((row) => {
      const val =
        row.setting_type === "number"
          ? parseFloat(row.setting_value)
          : row.setting_value;

      if (row.setting_key === "credits_usd_price") creditPrice = val;
      if (row.setting_key === "credits_min_purchase") minPurchase = val;
      if (row.setting_key === "credits_max_purchase") maxPurchase = val;
    });

    const creditAmount = Math.floor(priceUsd / creditPrice).toString();
    const userHash = idHash;

    const nonce = (await paymentProcessor.userNonce(userHash)).toString();
    const expiry = (Math.floor(Date.now() / 1000) + 300).toString();
    const tokenPriceUsd = await getTokenPriceUsd();

    if (!tokenPriceUsd) {
      res.status(500).json({ error: "Failed to fetch token price" });
    }

    const tokenAmountRaw = priceUsd / tokenPriceUsd;
    const tokenAmount = ethers
      .parseUnits(tokenAmountRaw.toString(), 18)
      .toString();

    const encoded = new ethers.AbiCoder().encode(
      [
        "bytes32",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "address",
        "uint256",
      ],
      [
        userHash,
        creditAmount,
        tokenAmount,
        nonce,
        expiry,
        contractAddress,
        chainId.toString(),
      ],
    );

    const hash = ethers.keccak256(encoded);
    const signature = await validatorWallet.signMessage(ethers.getBytes(hash));

    res.json({
      user: userHash,
      creditAmount,
      tokenAmount,
      expiry,
      signature,
    });
  } catch (err) {
    console.error("[Payments] Failed to generate quotation:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- PaymentProcessed sync using DB state ---
async function getLastSyncedBlock(retries = 3) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const res = await pool.query(
        `SELECT setting_value FROM "SystemSettings" WHERE setting_key = 'last_synced_block'`,
      );
      const dbBlock = res.rows[0]?.setting_value;
      return dbBlock == 0 ? startBlock : parseInt(dbBlock);
    } catch (err) {
      attempt++;
      const errorMsg = `[PaymentSync] Failed to get last synced block (attempt ${attempt}): ${err.message || err}`;
      console.error(errorMsg);
      if (attempt >= retries) {
        throw new Error(errorMsg);
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

async function setLastSyncedBlock(blockNumber, retries = 3) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      await pool.query(
        `UPDATE "SystemSettings" SET setting_value = $1 WHERE setting_key = 'last_synced_block'`,
        [blockNumber.toString()],
      );
      return;
    } catch (err) {
      attempt++;
      const errorMsg = `[PaymentSync] Failed to update last synced block (attempt ${attempt}): ${err.message || err}`;
      console.error(errorMsg);
      if (attempt >= retries) {
        throw new Error(errorMsg);
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

async function handlePaymentEvent(userHash, creditAmount) {
  try {
    const result = await pool.query(
      'UPDATE "User" SET credits = credits + $1 WHERE id_hash = $2 RETURNING id',
      [creditAmount.toString(), userHash],
    );

    if (result.rowCount > 0) {
      console.log(
        `[PaymentSync] Updated user ${result.rows[0].id} with ${creditAmount} credits.`,
      );
    } else {
      console.warn(`[PaymentSync] No user found for hash ${userHash}`);
    }
  } catch (err) {
    console.error("[PaymentSync] DB update failed:", err);
  }
}

async function startPaymentProcessedSync() {
  const provider = new ethers.JsonRpcProvider(rpc);
  const contract = new ethers.Contract(
    contractAddress,
    paymentProcessorAbi,
    provider,
  );

  const latestBlock = await provider.getBlockNumber();
  let fromBlock;

  if (environment === "development") {
    fromBlock = latestBlock - 1;
  } else {
    fromBlock = await getLastSyncedBlock();
  }

  console.log(
    `[PaymentSync] Starting sync from block ${fromBlock} to ${latestBlock}`,
  );

  // Define real-time handler so it can be referenced during removal
  const onPaymentProcessed = async (
    userHash,
    creditAmount,
    _tokenAmount,
    event,
  ) => {
    try {
      await handlePaymentEvent(userHash, creditAmount);
      await setLastSyncedBlock(event.blockNumber + 1);
    } catch (err) {
      console.error("[PaymentSync] Real-time event error:", err);
    }
  };

  // Set up real-time listener first to avoid missing events
  contract.on("PaymentProcessed", onPaymentProcessed);

  // Fetch past events (after setting up real-time listener)
  try {
    const pastEvents = await contract.queryFilter(
      "PaymentProcessed",
      fromBlock,
      latestBlock,
    );

    for (const event of pastEvents) {
      await handlePaymentEvent(event.args.user, event.args.creditAmount);
    }

    await setLastSyncedBlock(latestBlock + 1);
  } catch (err) {
    console.error("[PaymentSync] Error syncing past events:", err);
  }

  const restart = () => {
    console.warn("[PaymentSync] Restarting sync...");
    contract.off("PaymentProcessed", onPaymentProcessed);
    setTimeout(() => startPaymentProcessedSync().catch(console.error), 3000);
  };

  provider.on("error", (err) => {
    console.error("[PaymentSync] Provider error:", err);
    restart();
  });

  console.log("[PaymentSync] Listening for new PaymentProcessed events...");
}

if (environment !== "development") {
  startPaymentProcessedSync().catch((err) =>
    console.error("[PaymentSync] Failed to start listener:", err),
  );
}

export default router;
