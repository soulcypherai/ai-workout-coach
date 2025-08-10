import { useEffect, useState } from "react";

import { useComposeCast } from "@coinbase/onchainkit/minikit";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { AlertCircle, CheckCircle, FileWarning, Loader2 } from "lucide-react";

import { useCoinCreation } from "@/hooks/useCoinCreation";

import type { ChatMessage } from "@/types/slices";

interface CollectibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  musicData?: ChatMessage | null;
}

const CollectibleModal = ({
  isOpen,
  onClose,
  musicData = null,
}: CollectibleModalProps) => {
  const { openConnectModal } = useConnectModal();
  const [showSuccessUI, setShowSuccessUI] = useState(false);
  const {
    coinData,
    setCoinData,
    state,
    prepareCoinCreation,
    createCoin,
    clearState,
    downloadMusicFile,
    generateSymbolFromName,
    isConnected,
    isWriting,
    isConfirmed,
    handleTransactionConfirmation,
  } = useCoinCreation(musicData?.musicData?.generationId);

  const { composeCast } = useComposeCast();
  const MINI_APP_URL = import.meta.env.VITE_MINIAPP_PUBLIC_URL;

  // Auto-download music when modal opens
  useEffect(() => {
    if (isOpen) {
      setShowSuccessUI(false);
      // Clear the coin creation state when modal opens
      clearState();
      // Reset coin data to ensure clean state
      setCoinData({
        name: "",
        symbol: "",
        description: "",
        imageFile: null,
        musicFile: null,
      });
      if (musicData?.musicData?.audioUrl && !coinData.musicFile) {
        downloadMusicFile(musicData);
      }
    }
  }, [isOpen, musicData]);

  // Generate symbol from name
  useEffect(() => {
    if (coinData.name && !coinData.symbol) {
      const symbol = generateSymbolFromName(coinData.name);
      setCoinData((prev) => ({ ...prev, symbol }));
    }
  }, [coinData.name]);

  // Handle transaction confirmation
  useEffect(() => {
    console.log("🔍 Transaction confirmation check:", {
      isConfirmed,
      deployedCoinAddress: state.deployedCoinAddress,
      showSuccessUI,
      isWaitingForConfirmation: state.isWaitingForConfirmation,
    });

    // Show success UI if transaction is confirmed and we have a deployed address
    if (isConfirmed && state.deployedCoinAddress && !showSuccessUI) {
      console.log("✅ Showing success UI");
      setShowSuccessUI(true);
    }
    handleTransactionConfirmation();
  }, [isConfirmed, state.deployedCoinAddress, showSuccessUI]);

  // Reset form when wallet connects while modal is open
  useEffect(() => {
    if (isConnected && isOpen) {
      // Clear any previous errors when wallet connects
      clearState();
    }
  }, [isConnected, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await prepareCoinCreation();
  };

  const handleCreateCoin = async () => {
    await createCoin();
  };

  const handleClose = () => {
    setCoinData({
      name: "",
      symbol: "",
      description: "",
      imageFile: null,
      musicFile: null,
    });
    clearState();
    setShowSuccessUI(false);
    onClose();
  };

  const handlePost = async () => {
    const musicUrl = `${MINI_APP_URL}/music/${musicData?.musicData?.generationId}`;
    composeCast({
      text: `🎶 Just tokenized my new beat!
Check it out on AI-SHARK.FUN and trade it now 🪙`,
      embeds: [musicUrl],
    });
    console.log("Sharing music URL:", musicUrl);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 left-0 flex h-full w-full items-center justify-center pb-21 backdrop-blur-sm">
      {!showSuccessUI ? (
        <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-black p-6">
          <div className="mb-4">
            <h3 className="mb-2 text-lg font-semibold text-white">
              Create a Zora Coin (Testnet)
            </h3>
            <p className="text-sm text-gray-400">
              Turn your music into a tradeable coin on Zora (Base Sepolia
              testnet)
            </p>
          </div>

          {/* Wallet Connection Status */}
          {!isConnected && (
            <div className="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-yellow-400" size={20} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-yellow-400">
                    Wallet Not Connected
                  </div>
                  <div className="text-xs text-yellow-300">
                    Please connect your wallet to create a coin
                  </div>
                </div>
                <button
                  onClick={() => {
                    openConnectModal?.();
                  }}
                  className="bg-accent hover:bg-accent/80 rounded-lg px-3 py-1 text-xs font-medium text-black transition-colors"
                >
                  Connect Wallet
                </button>
              </div>
            </div>
          )}

          {/* Music Download Status */}
          {state.isDownloadingMusic && (
            <div className="mb-4 rounded-lg border border-white/20 bg-white/10 p-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">
                    Downloading Music...
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-white/20">
                    <div
                      className="bg-accent h-full rounded-full transition-all duration-300"
                      style={{ width: `${state.downloadProgress}%` }}
                    ></div>
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {Math.round(state.downloadProgress)}%
                  </div>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 pb-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-white">
                Coin Name *
              </label>
              <input
                type="text"
                value={coinData.name}
                onChange={(e) =>
                  setCoinData((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                className="focus:border-accent w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/50 focus:outline-none"
                placeholder="Enter coin name"
                required
                disabled={state.isDownloadingMusic || state.isCreatingCoin}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-white">
                Symbol *
              </label>
              <input
                type="text"
                value={coinData.symbol}
                onChange={(e) =>
                  setCoinData((prev) => ({
                    ...prev,
                    symbol: e.target.value.toUpperCase(),
                  }))
                }
                className="focus:border-accent w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/50 focus:outline-none"
                placeholder="Enter symbol (e.g., MAC)"
                maxLength={6}
                required
                disabled={state.isDownloadingMusic || state.isCreatingCoin}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-white">
                Description *
              </label>
              <textarea
                value={coinData.description}
                onChange={(e) =>
                  setCoinData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className="focus:border-accent w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/50 focus:outline-none"
                placeholder="Describe your coin"
                rows={3}
                required
                disabled={state.isDownloadingMusic || state.isCreatingCoin}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-white">
                Cover Image *
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setCoinData((prev) => ({
                    ...prev,
                    imageFile: e.target.files?.[0] || null,
                  }))
                }
                className="file:bg-accent hover:file:bg-accent/80 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white file:mr-4 file:rounded-full file:border-0 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black"
                required
                disabled={state.isDownloadingMusic || state.isCreatingCoin}
              />
            </div>

            {/* Music File Status */}
            {coinData.musicFile && !state.isDownloadingMusic && (
              <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="text-green-400" size={20} />
                  <span className="text-sm text-green-400">
                    Music file ready: {coinData.musicFile.name}
                  </span>
                </div>
                {musicData?.musicData?.generationId && (
                  <div className="mt-1 text-xs text-green-300">
                    Generation ID: {musicData.musicData.generationId}
                  </div>
                )}
              </div>
            )}

            {/* Success Message */}
            {state.successMessage && (
              <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="text-green-400" size={20} />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-green-400">
                      {state.successMessage}
                    </div>
                    {state.deployedCoinAddress && (
                      <div className="mt-1 text-xs text-green-300">
                        Address: {state.deployedCoinAddress}
                      </div>
                    )}
                    {state.currentTransactionHash && (
                      <div className="mt-1 text-xs text-green-300">
                        <a
                          href={`https://sepolia.basescan.org/tx/${state.currentTransactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-green-200"
                        >
                          View Transaction:{" "}
                          {state.currentTransactionHash.slice(0, 10)}...
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Error States */}
            {state.error && !state.isDownloadingMusic && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="text-red-400" size={20} />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-red-400">
                      Error
                    </div>
                    <div className="text-xs text-red-300">{state.error}</div>
                  </div>
                  {state.error.includes("download") && (
                    <button
                      onClick={() => downloadMusicFile(musicData)}
                      className="rounded bg-red-500/20 px-2 py-1 text-xs text-red-300 transition-colors hover:bg-red-500/30"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* No Music Data State */}
            {!musicData?.musicData?.audioUrl &&
              !state.isDownloadingMusic &&
              !coinData.musicFile && (
                <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
                  <div className="flex items-center gap-2">
                    <FileWarning className="text-yellow-400" size={20} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-yellow-400">
                        No Music Data
                      </div>
                      <div className="text-xs text-yellow-300">
                        Please select a music message to create a coin.
                      </div>
                      {musicData?.musicData?.generationId && (
                        <div className="mt-1 text-xs text-yellow-300">
                          Generation ID: {musicData.musicData.generationId}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-lg border border-white/20 px-4 py-2 text-white transition-colors hover:bg-white/10"
                disabled={
                  state.isDownloadingMusic ||
                  state.isCreatingCoin ||
                  state.isUploadingMetadata ||
                  isWriting ||
                  state.isWaitingForConfirmation
                }
              >
                Cancel
              </button>

              {state.contractCallParams ? (
                <button
                  type="button"
                  onClick={handleCreateCoin}
                  disabled={isWriting || state.isWaitingForConfirmation}
                  className="bg-accent hover:bg-accent/80 flex-1 rounded-lg px-4 py-2 font-medium text-black transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isWriting ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating Coin...
                    </div>
                  ) : state.isWaitingForConfirmation ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Confirming...
                    </div>
                  ) : (
                    "Create Coin"
                  )}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={
                    state.isCreatingCoin ||
                    state.isDownloadingMusic ||
                    state.isUploadingMetadata ||
                    !isConnected ||
                    !coinData.musicFile ||
                    !coinData.imageFile ||
                    !coinData.name ||
                    !coinData.symbol ||
                    !coinData.description
                  }
                  className="bg-accent hover:bg-accent/80 flex-1 rounded-lg px-4 py-2 font-medium text-black transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {state.isCreatingCoin ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Preparing...
                    </div>
                  ) : state.isUploadingMetadata ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading Metadata...
                    </div>
                  ) : (
                    "Prepare Coin"
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      ) : (
        <div className="flex h-full w-full max-w-md items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <CheckCircle className="h-16 w-16 text-green-400" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-white">
              Coin Created Successfully!
            </h3>
            <p className="mb-6 text-gray-400">
              Your music has been turned into a tradeable coin on Zora.
            </p>

            {state.deployedCoinAddress && (
              <div className="mb-4 rounded-lg border border-green-500/20 bg-green-500/10 p-3">
                <div className="mb-1 text-sm font-medium text-green-400">
                  Contract Address:
                </div>
                <div className="text-xs break-all text-green-300">
                  {state.deployedCoinAddress}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSuccessUI(false);
                  handleClose();
                }}
                className="flex-1 cursor-pointer rounded-lg border border-white/20 px-4 py-2 text-white transition-colors hover:bg-white/10"
              >
                Back
              </button>
              <button
                onClick={() => {
                  handlePost();
                  setShowSuccessUI(false);
                  console.log("Post button clicked");
                }}
                className="bg-accent hover:bg-accent/80 flex-1 cursor-pointer rounded-lg px-4 py-2 font-medium text-black transition-colors"
              >
                Post
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectibleModal;
