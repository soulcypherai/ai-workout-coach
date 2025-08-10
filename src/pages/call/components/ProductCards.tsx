import { useState } from "react";

import { avatarChatService } from "@/services/AvatarChatService";
import { ShoppingCart, X } from "lucide-react";

interface Product {
  asin: string;
  name: string;
  price: number;
  url: string;
  imageUrl: string;
}

interface ProductCardsProps {
  products: Product[];
  onPurchase: (asin: string, productName: string) => void;
  onClose: () => void;
  className?: string;
}

const ProductCards = ({
  products,
  onPurchase,
  onClose,
  className,
}: ProductCardsProps) => {
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const handlePurchase = async (asin: string, productName: string) => {
    setPurchasing(asin);
    try {
      await onPurchase(asin, productName);

      // Trigger avatar response for purchase
      avatarChatService.sendTextMessage(
        `I just initiated a purchase for "${productName}". Can you acknowledge this purchase and maybe tell me something interesting about this product or give me tips on how to use it?`,
      );
    } finally {
      setPurchasing(null);
      // Close modal after purchase attempt
      onClose();
    }
  };

  const handleDecline = () => {
    // Trigger avatar response for declining
    avatarChatService.sendTextMessage(
      "I decided not to purchase any of the trending products right now.",
    );
    onClose();
  };

  if (!products || products.length === 0) {
    return null;
  }

  return (
    <div className={`absolute top-4 right-4 z-40 ${className || ""}`}>
      <div className="max-h-[calc(100vh-8rem)] w-80 max-w-sm overflow-y-auto rounded-2xl border border-gray-700/50 bg-gray-900/95 shadow-2xl backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700/50 p-4">
          <h2 className="text-lg font-bold text-white">🛍️ Trending</h2>
          <button
            onClick={handleDecline}
            className="text-gray-400 transition-colors hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Products Grid */}
        <div className="space-y-3 p-4">
          {products.slice(0, 3).map((product) => (
            <div
              key={product.asin}
              className="rounded-lg border border-gray-700/50 bg-gray-800/50 p-3"
            >
              {/* Product Image */}
              <div className="mx-auto mb-2 aspect-square max-w-20 overflow-hidden rounded-lg bg-gray-700">
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "/placeholder-image.jpg";
                  }}
                />
              </div>

              {/* Product Info */}
              <div className="space-y-2">
                <h3 className="line-clamp-2 text-center text-xs leading-tight font-medium text-white">
                  {product.name}
                </h3>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-green-400">
                    ${product.price}
                  </span>
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:underline"
                  >
                    Amazon
                  </a>
                </div>

                {/* Purchase Button */}
                <button
                  onClick={() => handlePurchase(product.asin, product.name)}
                  disabled={purchasing === product.asin}
                  className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
                >
                  {purchasing === product.asin ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-3 w-3" />
                      Buy with Crypto
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="bg-gray-850/50 border-t border-gray-700/50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">Pay with crypto</p>
            <button
              onClick={() => {
                // Trigger avatar response for "maybe later"
                avatarChatService.sendTextMessage(
                  "I'm not ready to buy anything right now, maybe later.",
                );
                onClose();
              }}
              className="text-xs text-gray-400 transition-colors hover:text-white"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductCards;
