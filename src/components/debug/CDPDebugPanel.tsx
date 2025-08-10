/**
 * CDP OnRamp Debug Component
 * Add this to any page for testing CDP functionality
 */

import React, { useState } from 'react';
import { CDPOnRampService } from '@/services/CDPOnRampService';
import { CDPOnRampTester } from '@/services/CDPOnRampTester';

interface CDPDebugPanelProps {
  className?: string;
}

export const CDPDebugPanel: React.FC<CDPDebugPanelProps> = ({ className = '' }) => {
  const [testAmount, setTestAmount] = useState('23.93');
  const [testAsin, setTestAsin] = useState('amazon:B0CC916NW7');
  const [generatedUrl, setGeneratedUrl] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);

  const handleGenerateUrl = () => {
    try {
      const url = CDPOnRampService.generateApplePayOnRampUrl({
        amount: testAmount,
        productAsin: testAsin,
        sessionId: `debug-${Date.now()}`
      });
      setGeneratedUrl(url);
      console.log('Generated URL:', url);
    } catch (error) {
      console.error('URL Generation Error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleRunTests = () => {
    CDPOnRampTester.runAllTests();
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(generatedUrl);
    alert('URL copied to clipboard!');
  };

  if (!isOpen) {
    return (
      <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium"
        >
          🧪 CDP Debug
        </button>
      </div>
    );
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 bg-gray-900 text-white p-4 rounded-lg shadow-xl max-w-md ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold">CDP OnRamp Debug</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4">
        {/* Configuration Info */}
        <div className="bg-gray-800 p-3 rounded text-sm">
          <div className="font-semibold mb-2">Current Config:</div>
          <div>Project ID: {CDPOnRampService.getConfig().projectId}</div>
          <div>Wallet: {CDPOnRampService.getConfig().walletAddress}</div>
          <div>Network: {CDPOnRampService.getConfig().network}</div>
        </div>

        {/* Test Form */}
        <div className="space-y-2">
          <div>
            <label className="block text-sm font-medium mb-1">Amount ($)</label>
            <input
              type="text"
              value={testAmount}
              onChange={(e) => setTestAmount(e.target.value)}
              className="w-full px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm"
              placeholder="23.93"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Product ASIN</label>
            <input
              type="text"
              value={testAsin}
              onChange={(e) => setTestAsin(e.target.value)}
              className="w-full px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm"
              placeholder="amazon:B0CC916NW7"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={handleGenerateUrl}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded text-sm font-medium"
          >
            Generate URL
          </button>
          
          <button
            onClick={handleRunTests}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded text-sm font-medium"
          >
            Run All Tests
          </button>
        </div>

        {/* Generated URL */}
        {generatedUrl && (
          <div className="bg-gray-800 p-3 rounded">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Generated URL:</span>
              <button
                onClick={handleCopyUrl}
                className="text-blue-400 hover:text-blue-300 text-sm"
              >
                Copy
              </button>
            </div>
            <div className="text-xs break-all text-gray-300 max-h-20 overflow-y-auto">
              {generatedUrl}
            </div>
            <div className="mt-2">
              <a
                href={generatedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-yellow-600 hover:bg-yellow-700 text-white py-1 px-3 rounded text-sm"
              >
                Test URL →
              </a>
            </div>
          </div>
        )}

        {/* Console Note */}
        <div className="text-xs text-gray-400 border-t border-gray-700 pt-2">
          💡 Check browser console for detailed logs
        </div>
      </div>
    </div>
  );
};

export default CDPDebugPanel;
