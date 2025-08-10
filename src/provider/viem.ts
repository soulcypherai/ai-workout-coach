import { wagmiConfig } from "@/main";
import { createPublicClient, createWalletClient, custom } from "viem";

export const getPublicClient = () => {
  return createPublicClient({
    chain: wagmiConfig.chains[0],
    transport: custom(window.ethereum!),
  });
};

export const getWalletClient = async () => {
  return createWalletClient({
    chain: wagmiConfig.chains[0],
    transport: custom(window.ethereum!),
  });
};
