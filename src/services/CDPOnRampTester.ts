/**
 * Test utility for CDP OnRamp Service
 * Use this for development testing and validation
 */

import { CDPOnRampService } from './CDPOnRampService';
import type { OnRampUrlParams } from './CDPOnRampService';

export class CDPOnRampTester {
  /**
   * Test URL generation with sample data
   */
  static testUrlGeneration(): string | null {
    console.log('🧪 Testing CDP OnRamp Service...');
    
    // Display current configuration
    console.log('📋 Current Configuration:', CDPOnRampService.getConfig());
    
    // Test parameters
    const testParams: OnRampUrlParams = {
      amount: '23.93',
      productAsin: 'amazon:B0CC916NW7',
      sessionId: 'test-session-' + Date.now()
    };
    
    // Validate parameters
    const validation = CDPOnRampService.validateParams(testParams);
    console.log('✅ Parameter Validation:', validation);
    
    if (!validation.isValid) {
      console.error('❌ Validation failed:', validation.error);
      return null;
    }
    
    try {
      // Generate URL
      const url = CDPOnRampService.generateApplePayOnRampUrl(testParams);
      console.log('🔗 Generated URL:', url);
      
      // Parse URL to verify parameters
      const urlObj = new URL(url);
      console.log('🔍 URL Analysis:');
      console.log('  Base URL:', urlObj.origin + urlObj.pathname);
      console.log('  Parameters:');
      urlObj.searchParams.forEach((value, key) => {
        console.log(`    ${key}: ${value}`);
      });
      
      return url;
    } catch (error) {
      console.error('❌ URL Generation Failed:', error);
      return null;
    }
  }
  
  /**
   * Test with various amounts
   */
  static testDifferentAmounts(): void {
    console.log('🧪 Testing different amounts...');
    
    const amounts = ['10.00', '25.50', '100.00', '999.99'];
    
    amounts.forEach(amount => {
      console.log(`\n💰 Testing amount: $${amount}`);
      try {
        CDPOnRampService.generateApplePayOnRampUrl({
          amount,
          productAsin: 'amazon:TEST123',
          sessionId: `test-${amount}`
        });
        console.log(`✅ Success for $${amount}`);
      } catch (error) {
        console.log(`❌ Failed for $${amount}:`, error);
      }
    });
  }
  
  /**
   * Test error scenarios
   */
  static testErrorScenarios(): void {
    console.log('🧪 Testing error scenarios...');
    
    const errorCases = [
      { amount: '0', productAsin: 'amazon:TEST', description: 'Zero amount' },
      { amount: '-10', productAsin: 'amazon:TEST', description: 'Negative amount' },
      { amount: '15000', productAsin: 'amazon:TEST', description: 'Amount too large' },
      { amount: '50', productAsin: 'invalid-asin', description: 'Invalid ASIN format' },
      { amount: '', productAsin: 'amazon:TEST', description: 'Empty amount' },
    ];
    
    errorCases.forEach(testCase => {
      console.log(`\n🚨 Testing: ${testCase.description}`);
      const validation = CDPOnRampService.validateParams({
        amount: testCase.amount,
        productAsin: testCase.productAsin,
        sessionId: 'test-error'
      });
      
      if (validation.isValid) {
        console.log('❌ Expected error but validation passed');
      } else {
        console.log('✅ Correctly caught error:', validation.error);
      }
    });
  }
  
  /**
   * Run all tests
   */
  static runAllTests(): void {
    console.log('🚀 Running all CDP OnRamp Service tests...\n');
    
    this.testUrlGeneration();
    console.log('\n' + '='.repeat(50) + '\n');
    
    this.testDifferentAmounts();
    console.log('\n' + '='.repeat(50) + '\n');
    
    this.testErrorScenarios();
    console.log('\n✅ All tests completed!');
  }
}

// Make it available in browser console for testing
if (typeof window !== 'undefined') {
  (window as any).CDPOnRampTester = CDPOnRampTester;
  (window as any).CDPOnRampService = CDPOnRampService;
}
