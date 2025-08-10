import { useEffect, useState } from "react";

import { CDPOnRampService } from "@/services/CDPOnRampService";
import { crossmintPricingService } from "@/services/CrossmintPricingService";
import { TransactionVerificationService } from "@/services/TransactionVerificationService";
import {
  CDP_WALLET_ADDRESS,
  useUSDCTransfer,
} from "@/services/USDCTransferService";
import { dispatch, useSelector } from "@/store";
import { setPurchaseModal } from "@/store/slices/modal";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { AlertCircle, CheckCircle, Clock, ExternalLink, X } from "lucide-react";
import { base } from "viem/chains";
import { useAccount, useChainId } from "wagmi";

import { Button } from "@/components/ui/button";

interface Product {
  name: string;
  price: string;
  url: string;
  asin: string;
  image: string;
}

const SAMPLE_PRODUCTS: Product[] = [
  {
    name: "Resistance Bands with Handles",
    price: "$19.99",
    url: "https://www.amazon.com/Exercise-Resistance-Handles-Workouts-Included/dp/B0CC916NW7",
    asin: "amazon:B0CC916NW7",
    image: "https://m.media-amazon.com/images/I/71lsCRKShkL._AC_SL1500_.jpg",
  },
  {
    name: "STANLEY ProTour Flip Straw Tumbler",
    price: "$35.00",
    url: "https://www.amazon.com/Quencher-Leakproof-Compatible-Insulated-Stainless/dp/B0FB7D5PHW",
    asin: "amazon:B0FB7D5PHW",
    image: "https://m.media-amazon.com/images/I/51fyKEXIv5L._AC_SL1500_.jpg",
  },
  {
    name: "Amazon Neoprene Dumbbell Hand Weights",
    price: "$21.99",
    url: "https://www.amazon.com/AmazonBasics-Pound-Neoprene-Dumbbells-Weights/dp/B01LR5S6HK",
    asin: "amazon:B01LR5S6HK",
    image: "https://m.media-amazon.com/images/I/81Y26toqdTL._AC_SL1500_.jpg",
  },
];

// Simple product image with direct src and fallback
const ProductImage = ({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) => {
  const [imgSrc, setImgSrc] = useState(src);
  const [loading, setLoading] = useState(true);

  // Fallback placeholder
  const placeholderSrc =
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDMwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiM0MDQwNDAiLz48dGV4dCB4PSIxNTAiIHk9IjE1MCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+UHJvZHVjdCBJbWFnZTwvdGV4dD48L3N2Zz4=";

  useEffect(() => {
    console.log("🖼️ ProductImage component mounted with src:", src);

    // Try original first
    const img = new Image();
    img.onload = () => {
      console.log("✅ Original image loaded:", src);
      setImgSrc(src);
      setLoading(false);
    };
    img.onerror = () => {
      console.log("❌ Original failed, trying proxy:", src);
      // Try proxy
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(src)}`;
      const proxyImg = new Image();
      proxyImg.onload = () => {
        console.log("✅ Proxy image loaded:", proxyUrl);
        setImgSrc(proxyUrl);
        setLoading(false);
      };
      proxyImg.onerror = () => {
        console.log("❌ Proxy failed, using placeholder");
        setImgSrc(placeholderSrc);
        setLoading(false);
      };
      proxyImg.src = proxyUrl;
    };
    img.src = src;
  }, [src]);

  return (
    <div className={`relative ${className || ""}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
        </div>
      )}
      <img
        src={imgSrc}
        alt={alt}
        className="h-full w-full object-contain"
        style={{ display: loading ? "none" : "block" }}
      />
    </div>
  );
};

export const PurchaseModal = () => {
  const {
    isOpen,
    mode,
    data: modalData,
  } = useSelector((state) => state.modal.purchaseModal);

  const handleClose = () => {
    dispatch(setPurchaseModal([false]));
  };

  const handleProductSelect = (product: Product) => {
    dispatch(
      setPurchaseModal([true, "single-product", { selectedProduct: product }]),
    );

    // Emit product selection event for LLM context
    if ((window as any).mediaSocket) {
      (window as any).mediaSocket.emit("product-selected", {
        product,
        sessionId: Date.now().toString(),
        timestamp: Date.now(),
      });
    }
  };

  const handleBackToProducts = () => {
    dispatch(
      setPurchaseModal([true, "products", { products: SAMPLE_PRODUCTS }]),
    );
  };

  useEffect(() => {
    if (isOpen && mode === "products" && !modalData?.products) {
      // Initialize with sample products if no products provided
      console.log("🔄 Initializing modal with sample products");
      dispatch(
        setPurchaseModal([true, "products", { products: SAMPLE_PRODUCTS }]),
      );
    }
  }, [isOpen, mode, modalData]);

  if (!isOpen) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
      {/* Backdrop - only covers right side */}
      <div
        className="pointer-events-auto absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal - positioned as side panel on the right, full width on mobile */}
      <div className="bg-foreground pointer-events-auto absolute top-0 right-0 bottom-0 w-full overflow-hidden border-0 border-white/20 shadow-2xl md:top-4 md:right-4 md:bottom-4 md:w-full md:max-w-md md:rounded-xl md:border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h2 className="text-primary font-primary text-lg font-bold">
            {mode === "products" ? "Trending Products" : "Purchase Product"}
          </h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 transition-colors hover:bg-white/10"
          >
            <X className="text-secondary h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div
          className="overflow-y-auto p-4"
          style={{ height: "calc(100vh - 80px)" }}
        >
          {mode === "products" ? (
            <ProductGrid
              products={modalData?.products || SAMPLE_PRODUCTS}
              onProductSelect={handleProductSelect}
              isLoading={false}
            />
          ) : (
            <SingleProductView
              product={modalData?.selectedProduct}
              onBack={handleBackToProducts}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const ProductGrid = ({
  products,
  onProductSelect,
  isLoading,
}: {
  products: Product[];
  onProductSelect: (product: Product) => void;
  isLoading: boolean;
}) => {
  return (
    <div className="grid grid-cols-1 gap-4">
      {products.map((product, index) => (
        <div
          key={product.asin || index}
          className="bg-bg-foreground hover:border-accent/30 overflow-hidden rounded-lg border border-white/10 shadow-sm transition-all duration-200 hover:shadow-md"
        >
          <div className="aspect-square overflow-hidden bg-black/50">
            <ProductImage
              src={product.image}
              alt={product.name}
              className="h-full w-full"
            />
          </div>
          <div className="p-3">
            <h3
              className="text-primary font-primary mb-2 overflow-hidden text-sm font-semibold"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                textOverflow: "ellipsis",
              }}
            >
              {product.name}
            </h3>
            <p className="text-accent font-primary mb-3 text-lg font-bold">
              {product.price}
            </p>
            <Button
              onClick={() => onProductSelect(product)}
              disabled={isLoading}
              className="bg-accent hover:bg-accent/90 font-primary w-full font-medium text-black"
            >
              Buy Now
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

const SingleProductView = ({
  product,
  onBack,
}: {
  product: Product;
  onBack: () => void;
}) => {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const chainId = useChainId();
  const [priceLoading, setPriceLoading] = useState(true);
  const [cryptoPricing, setCryptoPricing] = useState<any>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<
    "idle" | "verifying" | "executing" | "completed" | "failed"
  >("idle");
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [verificationDetails, setVerificationDetails] = useState<any>(null);
  const [applePayProcessing, setApplePayProcessing] = useState(false);

  // USDC Transfer functionality
  const {
    transferUSDC,
    hasSufficientBalance,
    getFormattedBalance,
    getPaymentStatus,
    txHash,
    isWritePending,
    isWaitingForConfirmation,
    isConfirmed,
  } = useUSDCTransfer();

  // Check if connected to the correct chain (Base mainnet)
  const isCorrectChain = chainId === base.id;

  // Monitor transaction status and emit socket events
  useEffect(() => {
    if (txHash && isWaitingForConfirmation) {
      // Emit transaction pending event
      if ((window as any).mediaSocket) {
        (window as any).mediaSocket.emit("transaction-pending", {
          txHash,
          amount: cryptoPricing?.usdc?.amount,
          currency: "USDC",
          sessionId: Date.now().toString(),
          timestamp: Date.now(),
        });
      }
    }

    if (txHash && isConfirmed) {
      // Emit transaction confirmed event
      if ((window as any).mediaSocket) {
        (window as any).mediaSocket.emit("transaction-confirmed", {
          txHash,
          amount: cryptoPricing?.usdc?.amount,
          currency: "USDC",
          sessionId: Date.now().toString(),
          timestamp: Date.now(),
        });
      }
    }
  }, [txHash, isWaitingForConfirmation, isConfirmed, cryptoPricing]);

  // Get current payment status
  const paymentStatus = getPaymentStatus();

  // Handle crypto payment
  const handleCryptoPayment = async () => {
    if (!isConnected || !isCorrectChain || !cryptoPricing?.usdc?.amount) {
      return;
    }

    try {
      console.log("🔄 Initiating USDC payment:", {
        amount: cryptoPricing.usdc.amount,
        recipient: CDP_WALLET_ADDRESS,
        product: product.name,
      });

      // Emit crypto payment initiation event
      if ((window as any).mediaSocket) {
        (window as any).mediaSocket.emit("crypto-payment-initiated", {
          amount: cryptoPricing.usdc.amount,
          currency: "USDC",
          sessionId: Date.now().toString(),
          timestamp: Date.now(),
        });
      }

      await transferUSDC(cryptoPricing.usdc.amount);
    } catch (error) {
      console.error("❌ Payment failed:", error);

      // Emit payment failure event
      if ((window as any).mediaSocket) {
        (window as any).mediaSocket.emit("purchase-failed", {
          error:
            error instanceof Error
              ? error.message
              : "Payment initiation failed",
          errorType: "payment-initiation-failed",
          sessionId: Date.now().toString(),
          timestamp: Date.now(),
        });
      }
    }
  };

  // Handle Apple Pay with CDP OnRamp
  const handleApplePayPurchase = async () => {
    if (!product || applePayProcessing) return;

    try {
      setApplePayProcessing(true);
      
      console.log("🍎 Initiating Apple Pay purchase via CDP OnRamp:", {
        product: product.name,
        asin: product.asin,
        price: product.price,
      });

      // Emit Apple Pay initiation event
      if ((window as any).mediaSocket) {
        (window as any).mediaSocket.emit("apple-pay-initiated", {
          product: product.name,
          asin: product.asin,
          price: product.price,
          sessionId: Date.now().toString(),
          timestamp: Date.now(),
        });
      }

      // Extract ASIN from product (remove 'amazon:' prefix if present)
      const asin = product.asin.replace(/^amazon:/, '');
      
      // Extract numeric price from string (e.g., "$19.99" -> "19.99")
      const priceAmount = product.price.replace(/[$,]/g, '');

      // Generate CDP OnRamp URL for Apple Pay
      const cdpUrl = CDPOnRampService.generateApplePayOnRampUrl({
        amount: priceAmount,
        productAsin: asin,
        sessionId: `purchase-${Date.now()}`
      });

      console.log("✅ Generated CDP OnRamp URL:", cdpUrl);

      // Redirect to Coinbase Pay for Apple Pay checkout
      window.open(cdpUrl, '_blank', 'noopener,noreferrer');

      // Emit successful URL generation event
      if ((window as any).mediaSocket) {
        (window as any).mediaSocket.emit("apple-pay-url-generated", {
          product: product.name,
          asin: asin,
          cdpUrl: cdpUrl,
          sessionId: Date.now().toString(),
          timestamp: Date.now(),
        });
      }

    } catch (error) {
      console.error("❌ Apple Pay CDP OnRamp failed:", error);

      // Emit Apple Pay failure event
      if ((window as any).mediaSocket) {
        (window as any).mediaSocket.emit("apple-pay-failed", {
          error: error instanceof Error ? error.message : "Apple Pay setup failed",
          errorType: "apple-pay-cdp-failed",
          sessionId: Date.now().toString(),
          timestamp: Date.now(),
        });
      }

      // Show user-friendly error
      setPriceError("Apple Pay is temporarily unavailable. Please try the crypto payment option.");
    } finally {
      setApplePayProcessing(false);
    }
  };

  // Handle backend purchase execution after successful payment
  useEffect(() => {
    if (isConfirmed && txHash && purchaseStatus === "idle") {
      console.log(
        "✅ Payment confirmed! Starting verification and purchase execution:",
        {
          txHash,
          product: product.name,
          amount: cryptoPricing?.usdc?.amount,
        },
      );

      setPurchaseStatus("verifying");

      const executePurchaseWithVerification = async () => {
        try {
          // Verify the transaction on blockchain
          console.log("🔍 Verifying transaction...");
          const verification =
            await TransactionVerificationService.verifyTransaction(txHash);

          if (!verification.isValid) {
            throw new Error(
              `Transaction verification failed: ${verification.error}`,
            );
          }

          console.log("✅ Transaction verified:", verification);
          setVerificationDetails(verification);

          // Validate payment details
          const validation =
            await TransactionVerificationService.validatePayment(
              txHash,
              cryptoPricing.usdc.amount,
              address,
            );

          if (!validation.isPaymentValid) {
            throw new Error(`Payment validation failed: ${validation.error}`);
          }

          console.log("✅ Payment validated, executing purchase...");
          setPurchaseStatus("executing");

          // Execute the purchase on backend
          const response = await fetch("/api/amazon/execute-purchase", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              product: {
                asin: product.asin,
                name: product.name,
                price: product.price,
              },
              payment: {
                txHash,
                amount: cryptoPricing.usdc.amount,
                currency: "USDC",
                walletAddress: address,
              },
            }),
          });

          if (response.ok) {
            const result = await response.json();
            console.log("✅ Purchase executed successfully:", result);

            setPurchaseStatus("completed");

            // Show success message and close modal after delay
            setTimeout(() => {
              alert(
                `🎉 Purchase successful!\n\nOrder ID: ${result.orderId || "N/A"}\nTransaction: ${txHash.slice(0, 10)}...`,
              );
              dispatch(setPurchaseModal([false]));
            }, 1000);
          } else {
            const errorData = await response.json();
            throw new Error(
              `Backend purchase failed: ${errorData.error || response.statusText}`,
            );
          }
        } catch (error) {
          console.error("❌ Purchase execution failed:", error);
          setPurchaseStatus("failed");
          setPurchaseError(
            error instanceof Error ? error.message : "Unknown error",
          );
        }
      };

      executePurchaseWithVerification();
    }
  }, [isConfirmed, txHash, product, cryptoPricing, address, purchaseStatus]);

  useEffect(() => {
    // Fetch real-time pricing
    const fetchPricing = async () => {
      setPriceLoading(true);
      setPriceError(null);

      try {
        console.log("🔄 Fetching real-time pricing for:", product.name);

        const pricingResult = await crossmintPricingService.getProductPricing(
          product,
          address || undefined,
        );

        if (pricingResult.success && pricingResult.cryptoPricing) {
          setCryptoPricing(pricingResult.cryptoPricing);

          if (pricingResult.error) {
            setPriceError(pricingResult.error);
          }

          console.log(
            "✅ Pricing fetched successfully:",
            pricingResult.cryptoPricing,
          );
          console.log("USDC Amount:", pricingResult.cryptoPricing.usdc?.amount);
          console.log("ETH Amount:", pricingResult.cryptoPricing.eth?.amount);
        } else {
          console.error("❌ Pricing result not successful:", pricingResult);
          throw new Error(pricingResult.error || "Failed to fetch pricing");
        }
      } catch (error) {
        console.error("❌ Failed to fetch pricing:", error);
        setPriceError("Failed to load current prices");

        // Set fallback pricing
        setCryptoPricing({
          usdc: {
            amount: "23.93",
            currency: "USDC",
            breakdown: {
              basePrice: "21.98",
              tax: "1.95",
              total: "23.93",
            },
          },
          eth: {
            amount: "0.00565",
            currency: "ETH",
            breakdown: {
              basePrice: "0.00519",
              tax: "0.00046",
              total: "0.00565",
            },
          },
        });
      } finally {
        setPriceLoading(false);
      }
    };

    fetchPricing();
  }, [product, address]);

  if (!product) {
    return (
      <div className="py-8 text-center">
        <p className="text-secondary">No product selected</p>
        <Button
          onClick={onBack}
          className="bg-accent hover:bg-accent/90 mt-4 text-black"
        >
          Back to Products
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-full">
      {/* Back button */}
      <Button
        onClick={onBack}
        variant="outline"
        className="text-primary font-primary mb-4 border-white/20 hover:bg-white/10"
      >
        ← Back to Products
      </Button>

      {/* Wallet Status */}
      <div className="bg-bg-foreground mb-4 rounded-lg border border-white/10 p-3">
        <div className="flex items-center gap-2">
          <span className="text-secondary font-primary text-sm font-medium">
            🔗 Wallet:
          </span>
          {isConnected ? (
            <div>
              <span className="text-accent font-medium">Connected</span>
              <div className="text-secondary text-xs">
                Address: {address?.slice(0, 6)}...{address?.slice(-4)}
              </div>
              <div className="text-secondary text-xs">
                Chain: {isCorrectChain ? "✅ Base Mainnet" : "⚠️ Wrong Network"}
              </div>
            </div>
          ) : (
            <span className="font-medium text-red-400">Not Connected</span>
          )}
        </div>
      </div>

      {/* Product Display - Stack vertically for narrow panel */}
      <div className="mb-6 space-y-4">
        <div className="aspect-square overflow-hidden rounded-lg bg-black/50">
          <ProductImage
            src={product.image}
            alt={product.name}
            className="h-full w-full"
          />
        </div>
        <div>
          <h3 className="text-primary font-primary mb-3 text-lg font-bold">
            {product.name}
          </h3>
          <div className="space-y-3">
            <div>
              <span className="text-secondary text-sm">Amazon Price:</span>
              <p className="text-accent font-primary text-xl font-bold">
                {product.price}
              </p>
            </div>

            {priceLoading ? (
              <div className="bg-accent/10 border-accent/20 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <div className="border-accent h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"></div>
                  <span className="text-accent font-primary">
                    Fetching latest prices from Crossmint...
                  </span>
                </div>
              </div>
            ) : cryptoPricing ? (
              <div className="bg-accent/10 border-accent/20 rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-primary font-primary font-medium">
                    Crypto Prices:
                  </p>
                  {priceError && (
                    <span
                      className="text-xs text-orange-400"
                      title={priceError}
                    >
                      ⚠️ Fallback pricing
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-secondary text-sm">USDC:</span>
                    <span className="text-accent font-medium">
                      {cryptoPricing.usdc.amount} USDC
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-secondary text-sm">ETH:</span>
                    <span className="text-accent font-medium">
                      {cryptoPricing.eth.amount} ETH
                    </span>
                  </div>
                  <div className="mt-3 border-t border-white/10 pt-2">
                    <div className="text-secondary text-xs">
                      <div>Base: ${cryptoPricing.usdc.breakdown.basePrice}</div>
                      <div>Tax: ${cryptoPricing.usdc.breakdown.tax}</div>
                      <div className="text-primary font-medium">
                        Total: ${cryptoPricing.usdc.breakdown.total}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-red-400">
                    ❌ Failed to load pricing
                  </span>
                  <button
                    onClick={() => window.location.reload()}
                    className="text-accent text-sm underline"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment Buttons */}
      <div className="space-y-3">
        <Button
          className="font-primary w-full bg-white py-3 text-black hover:bg-gray-100"
          disabled={applePayProcessing || !product}
          onClick={handleApplePayPurchase}
        >
          {applePayProcessing ? "🔄 Setting up Apple Pay..." : "🍎 Pay with Apple Pay"}
        </Button>

        <Button
          className="bg-accent hover:bg-accent/90 font-primary w-full py-3 font-medium text-black"
          disabled={
            priceLoading ||
            isWritePending ||
            isWaitingForConfirmation ||
            purchaseStatus === "verifying" ||
            purchaseStatus === "executing" ||
            purchaseStatus === "completed" ||
            (isConnected &&
              isCorrectChain &&
              cryptoPricing &&
              !hasSufficientBalance(cryptoPricing.usdc.amount))
          }
          onClick={() => {
            if (!isConnected) {
              openConnectModal?.();
            } else if (!isCorrectChain) {
              alert("Please switch to Base Mainnet in your wallet");
            } else if (
              cryptoPricing &&
              !hasSufficientBalance(cryptoPricing.usdc.amount)
            ) {
              // Emit insufficient funds event
              if ((window as any).mediaSocket) {
                (window as any).mediaSocket.emit("insufficient-funds", {
                  required: cryptoPricing.usdc.amount,
                  available: getFormattedBalance(),
                  currency: "USDC",
                  sessionId: Date.now().toString(),
                  timestamp: Date.now(),
                });
              }
            } else {
              handleCryptoPayment();
            }
          }}
        >
          {!isConnected
            ? "🔗 Connect Wallet to Pay with Crypto"
            : !isCorrectChain
              ? "🔄 Switch to Base Mainnet"
              : isWritePending
                ? "⏳ Preparing Transaction..."
                : isWaitingForConfirmation
                  ? "⏳ Confirming Payment..."
                  : purchaseStatus === "verifying"
                    ? "🔍 Verifying Payment..."
                    : purchaseStatus === "executing"
                      ? "🛒 Executing Purchase..."
                      : purchaseStatus === "completed"
                        ? "✅ Purchase Complete!"
                        : purchaseStatus === "failed"
                          ? "❌ Purchase Failed"
                          : cryptoPricing &&
                              !hasSufficientBalance(cryptoPricing.usdc.amount)
                            ? `❌ Insufficient USDC (Need ${cryptoPricing.usdc.amount}, Have ${getFormattedBalance()})`
                            : cryptoPricing
                              ? `₿ Pay ${cryptoPricing.usdc.amount} USDC`
                              : "₿ Pay with Crypto"}
        </Button>

        {/* Enhanced Payment Status Display */}
        {(paymentStatus.status !== "idle" || purchaseStatus !== "idle") && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              paymentStatus.status === "failed" || purchaseStatus === "failed"
                ? "border-red-500/20 bg-red-500/10 text-red-400"
                : purchaseStatus === "completed"
                  ? "bg-accent/10 text-accent border-accent/20"
                  : "bg-accent/10 text-accent border-accent/20"
            }`}
          >
            {/* Payment Status */}
            {paymentStatus.status === "preparing" && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 animate-spin" />
                <span>Preparing transaction...</span>
              </div>
            )}

            {paymentStatus.status === "pending" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 animate-spin" />
                  <span>Transaction pending confirmation...</span>
                </div>
                {paymentStatus.txHash && (
                  <div className="flex items-center gap-1 text-xs">
                    <ExternalLink className="h-3 w-3" />
                    <a
                      href={`https://basescan.org/tx/${paymentStatus.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:text-accent/80 underline"
                    >
                      View Transaction
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Verification Status */}
            {purchaseStatus === "verifying" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="text-accent h-4 w-4" />
                  <span className="text-accent">Payment confirmed!</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 animate-spin" />
                  <span>Verifying transaction details...</span>
                </div>
                {verificationDetails && (
                  <div className="text-secondary ml-6 space-y-1 text-xs">
                    <div>
                      Confirmations: {verificationDetails.confirmations}
                    </div>
                    <div>Amount: {verificationDetails.amount} USDC</div>
                  </div>
                )}
              </div>
            )}

            {/* Purchase Execution Status */}
            {purchaseStatus === "executing" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="text-accent h-4 w-4" />
                  <span className="text-accent">Payment verified!</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 animate-spin" />
                  <span>Executing Amazon purchase...</span>
                </div>
              </div>
            )}

            {/* Success Status */}
            {purchaseStatus === "completed" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="text-accent h-4 w-4" />
                  <span className="font-medium">
                    🎉 Purchase completed successfully!
                  </span>
                </div>
                <div className="text-secondary text-xs">
                  Check your email for order confirmation details.
                </div>
              </div>
            )}

            {/* Error Status */}
            {(paymentStatus.status === "failed" ||
              purchaseStatus === "failed") && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span className="font-medium text-red-400">
                    {paymentStatus.status === "failed"
                      ? "Payment failed"
                      : "Purchase failed"}
                  </span>
                </div>
                <div className="text-xs text-red-400">
                  {paymentStatus.error || purchaseError}
                </div>
                <button
                  onClick={() => {
                    setPurchaseStatus("idle");
                    setPurchaseError(null);
                  }}
                  className="text-accent hover:text-accent/80 mt-2 text-xs underline"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Transaction Link */}
            {paymentStatus.txHash && paymentStatus.status !== "pending" && (
              <div className="mt-2 flex items-center gap-1 border-t border-current/20 pt-2 text-xs">
                <ExternalLink className="h-3 w-3" />
                <a
                  href={`https://basescan.org/tx/${paymentStatus.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline hover:no-underline"
                >
                  View Transaction on BaseScan
                </a>
              </div>
            )}
          </div>
        )}

        {/* Wallet Balance Display */}
        {isConnected && isCorrectChain && (
          <div className="text-secondary font-primary text-center text-xs">
            USDC Balance: {getFormattedBalance()} USDC
          </div>
        )}
      </div>
    </div>
  );
};
