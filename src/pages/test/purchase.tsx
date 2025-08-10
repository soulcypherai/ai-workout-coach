// Test page for Purchase Modal - Quick testing without going through chat flow
import { useState } from "react";

import { dispatch } from "@/store";
import { setPurchaseModal } from "@/store/slices/modal";

import { Button } from "@/components/ui/button";

const SAMPLE_PRODUCTS = [
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

export default function PurchaseTest() {
  const [testResults, setTestResults] = useState<string[]>([]);

  const addLog = (message: string) => {
    console.log(message);
    setTestResults((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  const testProductsModal = () => {
    addLog("🧪 Testing products modal...");
    dispatch(
      setPurchaseModal([true, "products", { products: SAMPLE_PRODUCTS }]),
    );
    addLog("✅ Products modal should now be open");
  };

  const testSingleProductModal = () => {
    addLog("🧪 Testing single product modal...");
    dispatch(
      setPurchaseModal([
        true,
        "single-product",
        { selectedProduct: SAMPLE_PRODUCTS[0] },
      ]),
    );
    addLog("✅ Single product modal should now be open with Yoga Mat");
  };

  const closeModal = () => {
    addLog("🧪 Closing modal...");
    dispatch(setPurchaseModal([false]));
    addLog("✅ Modal should now be closed");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-bold">Purchase Modal Test Page</h1>

        <div className="mb-8 rounded-lg bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold">Test Controls</h2>
          <div className="flex flex-wrap gap-4">
            <Button
              onClick={testProductsModal}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Open Products Modal
            </Button>
            <Button
              onClick={testSingleProductModal}
              className="bg-green-600 hover:bg-green-700"
            >
              Open Single Product Modal
            </Button>
            <Button onClick={closeModal} variant="outline">
              Close Modal
            </Button>
          </div>
        </div>

        <div className="rounded-lg bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold">Test Results</h2>
          <div className="max-h-60 overflow-y-auto rounded bg-gray-50 p-4">
            {testResults.length === 0 ? (
              <p className="text-gray-500">
                Click a test button to see results...
              </p>
            ) : (
              testResults.map((result, index) => (
                <div key={index} className="mb-1 font-mono text-sm">
                  {result}
                </div>
              ))
            )}
          </div>
          <Button
            onClick={() => setTestResults([])}
            variant="outline"
            size="sm"
            className="mt-4"
          >
            Clear Logs
          </Button>
        </div>

        <div className="mt-8 rounded-lg bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold">
            Phase 3 Features to Test
          </h2>
          <ul className="space-y-2 text-sm">
            <li>
              ✅ <strong>Real Wallet Integration:</strong> Uses wagmi +
              RainbowKit
            </li>
            <li>
              ✅ <strong>Base Mainnet Default:</strong> Configured as supported
              chain
            </li>
            <li>
              ✅ <strong>Wallet Status Display:</strong> Shows connection +
              address + chain
            </li>
            <li>
              ✅ <strong>Connect Button:</strong> Opens RainbowKit modal
            </li>
            <li>
              ✅ <strong>Chain Validation:</strong> Detects wrong network
            </li>
            <li>
              ✅ <strong>Payment Button States:</strong> Adapts based on wallet
              status
            </li>
            <li>
              🔄 <strong>Chain Switching:</strong> Prompts user to switch to
              Base
            </li>
            <li>
              🔄 <strong>Transaction Execution:</strong> Ready for Phase 4
            </li>
          </ul>
        </div>

        <div className="mt-8 rounded-lg bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold">
            Phase 2 Features Completed
          </h2>
          <ul className="space-y-2 text-sm">
            <li>
              ✅ <strong>Modal Opens:</strong> Products grid displays correctly
            </li>
            <li>
              ✅ <strong>Product Selection:</strong> Click "Buy Now" to view
              single product
            </li>
            <li>
              ✅ <strong>Real-time Pricing:</strong> Fetches from Crossmint API
              + fallback
            </li>
            <li>
              ✅ <strong>Error Handling:</strong> Fallback pricing when API
              fails
            </li>
            <li>
              ✅ <strong>Loading States:</strong> Spinner shows while fetching
              prices
            </li>
            <li>
              ✅ <strong>Price Breakdown:</strong> Shows base, tax, and total
              amounts
            </li>
          </ul>
        </div>

        <div className="mt-8 rounded-lg bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold">Next Steps (Phase 4)</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>• Implement USDC token transfer to CDP wallet</li>
            <li>• Add transaction monitoring and confirmations</li>
            <li>• Integrate with backend purchase execution</li>
            <li>• Add purchase confirmation screens</li>
            <li>• Complete end-to-end payment flow</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
