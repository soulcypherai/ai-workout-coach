import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { IPFSService } from "@/services/IPFSService";
import {
  DeployCurrency,
  ValidMetadataURI,
  createCoinCall,
  validateMetadataURIContent,
} from "@zoralabs/coins-sdk";
import { base } from "viem/chains";
import {
  useAccount,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import type { ChatMessage } from "@/types/slices";

export interface CoinData {
  name: string;
  symbol: string;
  description: string;
  imageFile: File | null;
  musicFile: File | null;
}

export interface CoinCreationState {
  isCreatingCoin: boolean;
  isUploadingMetadata: boolean;
  isWaitingForConfirmation: boolean;
  isDownloadingMusic: boolean;
  downloadProgress: number;
  error: string;
  successMessage: string;
  deployedCoinAddress: string;
  currentTransactionHash: string;
  contractCallParams: any;
}

export const useCoinCreation = (musicGenerationId?: string) => {
  const { address, isConnected } = useAccount();
  const { token, isMiniApp } = useAuth();

  const [coinData, setCoinData] = useState<CoinData>({
    name: "",
    symbol: "",
    description: "",
    imageFile: null,
    musicFile: null,
  });

  const [state, setState] = useState<CoinCreationState>({
    isCreatingCoin: false,
    isUploadingMetadata: false,
    isWaitingForConfirmation: false,
    isDownloadingMusic: false,
    downloadProgress: 0,
    error: "",
    successMessage: "",
    deployedCoinAddress: "",
    currentTransactionHash: "",
    contractCallParams: null,
  });

  const SERVER_URL = import.meta.env.VITE_SERVER_URL;

  // Wagmi hooks
  const {
    writeContractAsync,
    isPending: isWriting,
    data: txHash,
  } = useWriteContract();

  const { data: simulationData } = useSimulateContract({
    ...state.contractCallParams,
    query: {
      enabled: !!state.contractCallParams,
    },
  });

  const { data: receipt, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

  // Clear contract parameters when wallet connection changes
  useEffect(() => {
    if (!isConnected || !address) {
      updateState({ contractCallParams: null });
    }
  }, [isConnected, address]);

  // Update state helper
  const updateState = (updates: Partial<CoinCreationState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  // Clear state helper
  const clearState = () => {
    setState({
      isCreatingCoin: false,
      isUploadingMetadata: false,
      isWaitingForConfirmation: false,
      isDownloadingMusic: false,
      downloadProgress: 0,
      error: "",
      successMessage: "",
      deployedCoinAddress: "",
      currentTransactionHash: "",
      contractCallParams: null,
    });
  };

  // Download music file
  const downloadMusicFile = async (musicData: ChatMessage | null) => {
    if (!musicData?.musicData?.audioUrl) {
      updateState({
        error:
          "No music data available. Please try creating a coin from a music message.",
      });
      return null;
    }

    updateState({ isDownloadingMusic: true, downloadProgress: 0, error: "" });

    try {
      const response = await fetch(musicData.musicData.audioUrl, {
        mode: "cors",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch music file: ${response.status}`);
      }

      // Simulate download progress
      const reader = response.body?.getReader();
      const contentLength = response.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength) : 0;
      let receivedLength = 0;

      if (reader) {
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          chunks.push(value);
          receivedLength += value.length;

          if (total > 0) {
            const progress = (receivedLength / total) * 100;
            updateState({ downloadProgress: progress });
          }
        }

        const musicBlob = new Blob(chunks as BlobPart[], {
          type: "audio/mpeg",
        });

        const musicFile = new File(
          [musicBlob],
          `${musicData.musicData?.title || "music"}.mp3`,
          { type: "audio/mpeg" },
        );

        setCoinData((prev) => ({
          ...prev,
          musicFile,
          name: musicData.musicData?.title || prev.name,
        }));

        return musicFile;
      }

      return null;
    } catch (error) {
      console.error("Failed to download music file:", error);
      updateState({
        error: "Failed to download music file. Please try again.",
      });
      return null;
    } finally {
      updateState({ isDownloadingMusic: false, downloadProgress: 0 });
    }
  };

  // Generate symbol from name
  const generateSymbolFromName = (name: string): string => {
    return name
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase())
      .join("")
      .slice(0, 6);
  };

  // Create metadata URI
  const createMetadataURI = async (): Promise<ValidMetadataURI> => {
    if (!coinData.imageFile) {
      throw new Error("Image file is required");
    }

    updateState({ isUploadingMetadata: true, error: "" });

    try {
      // Upload image to IPFS
      const imageURI = await IPFSService.uploadImage(coinData.imageFile);
      console.log("🖼️ Image uploaded to IPFS:", imageURI);

      // Create metadata object
      const metadata = {
        name: coinData.name,
        symbol: coinData.symbol,
        description: coinData.description,
        image: imageURI,
        attributes: [
          {
            trait_type: "Type",
            value: "Music Coin",
          },
          {
            trait_type: "Artist",
            value: coinData.name,
          },
        ],
      };

      // Upload metadata to IPFS
      const metadataURI = await IPFSService.uploadMetadata(metadata);
      console.log("📄 Metadata uploaded to IPFS:", metadataURI);

      // Validate metadata URI
      await validateMetadataURIContent(metadataURI as ValidMetadataURI);

      return metadataURI as ValidMetadataURI;
    } catch (error) {
      console.error("Error creating metadata URI:", error);
      throw new Error("Failed to create metadata URI");
    } finally {
      updateState({ isUploadingMetadata: false });
    }
  };

  // Prepare coin creation
  const prepareCoinCreation = async () => {
    console.log("🔍 Debug - prepareCoinCreation called:", {
      isConnected,
      address,
      hasAddress: !!address,
    });

    if (!isConnected) {
      updateState({ error: "Please connect your wallet first" });
      return false;
    }

    if (!address) {
      updateState({
        error: "Wallet address not available. Please reconnect your wallet.",
      });
      return false;
    }

    if (!coinData.imageFile || !coinData.musicFile) {
      updateState({ error: "Please select both image and music files" });
      return false;
    }

    if (!coinData.name || !coinData.symbol || !coinData.description) {
      updateState({ error: "Please fill in all required fields" });
      return false;
    }

    updateState({ isCreatingCoin: true, error: "", successMessage: "" });

    try {
      // Create metadata URI
      const metadataURI = await createMetadataURI();

      // Log metadata creation
      console.log("📝 Metadata Created:", {
        name: coinData.name,
        symbol: coinData.symbol,
        description: coinData.description,
        metadataURI: metadataURI,
        imageFile: coinData.imageFile?.name,
        musicFile: coinData.musicFile?.name,
        timestamp: new Date().toISOString(),
      });

      // Prepare coin creation parameters
      const coinParams = {
        name: coinData.name,
        symbol: coinData.symbol,
        uri: metadataURI,
        payoutRecipient: address as `0x${string}`,
        chainId: base.id,
        currency: DeployCurrency.ETH,
      };

      // Create the coin using Zora SDK with wagmi
      const contractCallParams = await createCoinCall(coinParams);
      updateState({ contractCallParams });

      updateState({
        successMessage:
          "Coin creation parameters prepared! Click 'Create Coin' to proceed.",
        isCreatingCoin: false,
      });

      return true;
    } catch (error) {
      console.error("Error creating coin:", error);
      updateState({
        error: error instanceof Error ? error.message : "Failed to create coin",
        isCreatingCoin: false,
      });
      return false;
    }
  };

  // Create coin
  const createCoin = async () => {
    console.log("🔍 Debug - createCoin called:", {
      hasContractCallParams: !!state.contractCallParams,
      hasSimulationData: !!simulationData,
      isConnected,
      address,
    });

    if (!state.contractCallParams) {
      updateState({
        error:
          "Contract parameters not ready. Please try preparing the coin again.",
      });
      return false;
    }

    if (!simulationData) {
      updateState({
        error:
          "Transaction simulation failed. Please check your wallet connection and try again.",
      });
      return false;
    }

    try {
      // Send transaction and get hash
      const hash = await writeContractAsync(state.contractCallParams);
      updateState({
        currentTransactionHash: hash,
        isWaitingForConfirmation: true,
        successMessage: "Transaction submitted! Waiting for confirmation...",
      });

      console.log("🔗 Transaction Hash:", hash);
      console.log(
        "🔍 View on Explorer:",
        `https://sepolia.basescan.org/tx/${hash}`,
      );

      // Log coin creation details
      console.log("🎯 Coin Creation Details:", {
        name: coinData.name,
        symbol: coinData.symbol,
        description: coinData.description,
        creator: address,
        network: "Base Sepolia Testnet",
        contractParams: state.contractCallParams,
        simulationData: simulationData,
        timestamp: new Date().toISOString(),
      });

      return true;
    } catch (error) {
      console.error("Error writing contract:", error);
      updateState({ error: "Failed to submit transaction. Please try again." });
      return false;
    }
  };

  // Handle transaction confirmation
  const handleTransactionConfirmation = async () => {
    if (isConfirmed && receipt) {
      console.log("✅ Transaction confirmed:", receipt);

      // Try to extract deployed contract address from receipt
      const deployedAddress =
        receipt.contractAddress ||
        receipt.logs?.[0]?.address ||
        "Address not available";

      updateState({
        deployedCoinAddress: deployedAddress,
        successMessage: `Coin created successfully! Contract: ${deployedAddress}`,
        isWaitingForConfirmation: false,
      });

      console.log("🎉 Coin deployed at:", deployedAddress);

      // Call backend to update music generation with coin info
      if (musicGenerationId) {
        try {
          const metadata = {
            title: coinData.name,
            cover: coinData.imageFile
              ? await IPFSService.uploadImage(coinData.imageFile)
              : null,
          };

          // Prepare headers based on platform
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };

          // Only add Authorization header for web platform
          if (!isMiniApp && token) {
            headers.Authorization = `Bearer ${token}`;
          }

          const fetchOptions: RequestInit = {
            method: "PUT",
            headers,
            body: JSON.stringify({
              coinAddress: deployedAddress,
              metadata,
            }),
          };

          // Add credentials for Mini App
          if (isMiniApp) {
            fetchOptions.credentials = "include";
          }

          const response = await fetch(
            `${SERVER_URL}/api/music-generations/${musicGenerationId}/coin`,
            fetchOptions,
          );

          if (response.ok) {
            console.log("🎯 Music generation updated with coin information");
          } else {
            console.error("Failed to update music generation with coin info");
          }
        } catch (error) {
          console.error("Error updating music generation:", error);
        }
      }
    }
  };

  return {
    // State
    coinData,
    setCoinData,
    state,

    // Actions
    prepareCoinCreation,
    createCoin,
    clearState,
    updateState,
    downloadMusicFile,
    generateSymbolFromName,

    // Wagmi state
    isConnected,
    isWriting,
    isConfirmed,
    receipt,

    // Handlers
    handleTransactionConfirmation,
  };
};
