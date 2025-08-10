#!/usr/bin/env node
/**
 * Test script for CDP wallet integration
 */
import { CdpClient } from "@coinbase/cdp-sdk";
import dotenv from "dotenv";
import { createWalletClient, http } from "viem";
import { toAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

dotenv.config();

async function testCdpWallet() {
  try {
    console.log("🔄 Testing CDP wallet integration...");

    // Check required environment variables
    const requiredEnvVars = [
      "CPD_API_KEY_ID",
      "CPD_API_KEY_SECRET",
      "CDP_WALLET_SECRET",
    ];
    const missingVars = requiredEnvVars.filter(
      (varName) => !process.env[varName],
    );

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}`,
      );
    }

    // Initialize CDP client with explicit configuration
    const cdp = new CdpClient({
      apiKeyId: process.env.CPD_API_KEY_ID,
      apiKeySecret: process.env.CPD_API_KEY_SECRET,
      walletSecret: process.env.CDP_WALLET_SECRET,
    });
    console.log("✅ CDP client initialized with environment variables");

    // Create account
    const account = await cdp.evm.getOrCreateAccount({ name: "test-wallet" });
    console.log(
      "✅ CDP server wallet account created/retrieved:",
      account.address,
    );

    // Convert to viem account
    const viemAccount = toAccount(account);
    console.log("✅ Converted to viem account:", viemAccount.address);

    // Create wallet client
    const walletClient = createWalletClient({
      account: viemAccount,
      transport: http(),
      chain: baseSepolia,
    });
    console.log("✅ Wallet client created");

    // Test basic wallet functionality
    const balance = await walletClient.getBalance({
      address: viemAccount.address,
    });
    console.log("✅ Account balance:", balance.toString(), "wei");

    console.log("\n🎉 All tests passed! CDP wallet integration is working.");

    return {
      success: true,
      accountAddress: account.address,
      viemAddress: viemAccount.address,
      balance: balance.toString(),
    };
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("Stack:", error.stack);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Run the test if this script is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  testCdpWallet()
    .then((result) => {
      if (result.success) {
        console.log("\n📊 Test Results:");
        console.log("- Account Address:", result.accountAddress);
        console.log("- Viem Address:", result.viemAddress);
        console.log("- Balance:", result.balance, "wei");
        process.exit(0);
      } else {
        console.error("\n💥 Test failed with error:", result.error);
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("💥 Unexpected error:", error);
      process.exit(1);
    });
}

export { testCdpWallet };
