import React, { useState } from 'react';
import { CDPOnRampService } from '../services/CDPOnRampService';

const CDPTest: React.FC = () => {
  const [amount, setAmount] = useState<string>('10');
  const [asin, setAsin] = useState<string>('B08N5WRWNW');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleGenerateUrl = () => {
    setIsLoading(true);
    setError(null);
    setGeneratedUrl(null);

    try {
      const url = CDPOnRampService.generateApplePayOnRampUrl({
        amount: amount,
        productAsin: asin,
        sessionId: `test-${Date.now()}`
      });

      setGeneratedUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestPurchase = () => {
    if (generatedUrl) {
      window.open(generatedUrl, '_blank');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white shadow-lg rounded-lg">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">CDP On-Ramp Test</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">Test Parameters</h2>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Amount (USDC)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="10"
              min="1"
              step="0.01"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Product ASIN
            </label>
            <input
              type="text"
              value={asin}
              onChange={(e) => setAsin(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="B08N5WRWNW"
            />
          </div>

          <button
            onClick={handleGenerateUrl}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {isLoading ? 'Generating...' : 'Generate CDP URL'}
          </button>
        </div>

        {/* Results Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">Results</h2>
          
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <h3 className="text-sm font-medium text-red-800 mb-2">Error:</h3>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {generatedUrl && (
            <div className="space-y-3">
              <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                <h3 className="text-sm font-medium text-green-800 mb-2">Generated URL:</h3>
                <p className="text-sm text-green-600 break-all font-mono">
                  {generatedUrl}
                </p>
              </div>
              
              <button
                onClick={handleTestPurchase}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
              >
                🍎 Test Apple Pay Purchase
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Environment Info */}
      <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-md">
        <h3 className="text-lg font-medium text-gray-800 mb-3">Environment Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">CDP Project ID:</span>{' '}
            <span className="font-mono">{import.meta.env.VITE_CDP_PROJECT_ID || 'Not set'}</span>
          </div>
          <div>
            <span className="font-medium">CDP API Key:</span>{' '}
            <span className="font-mono">
              {import.meta.env.VITE_CDP_API_KEY ? '✓ Set' : '✗ Not set'}
            </span>
          </div>
          <div>
            <span className="font-medium">Server URL:</span>{' '}
            <span className="font-mono">{import.meta.env.VITE_SERVER_URL || 'localhost:3004'}</span>
          </div>
          <div>
            <span className="font-medium">Target Wallet:</span>{' '}
            <span className="font-mono">0xADc3...d734</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CDPTest;
