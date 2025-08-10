import { PaymentProcessorAbi } from "./paymentProcessorAbi";

export const PaymentProcessorContract = {
  // mainnet
  8453: {
    contractAddress: "0x7651f9f73d9f467fc68089d3a2Ca38d6d29aAcbF",
    tokenAddress: "0xb69938b92ba1ab2a4078ddb3d5c3472faa13c162",
    abi: PaymentProcessorAbi,
  },
  // testnet
  84532: {
    contractAddress: "0x0943755a0F051112A9eFf4c5Bc843eb6C8d76Fb8",
    tokenAddress: "0x1988a7591c5206c4a90d881f6c83e1d6fd57814d",
    abi: PaymentProcessorAbi,
  },
};
