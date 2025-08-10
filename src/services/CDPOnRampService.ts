/**
 * CDP OnRamp Service for Apple Pay Integration
 * Handles Coinbase on-ramp URL generation for fiat-to-USDC purchases
 */

import { getOnrampBuyUrl } from '@coinbase/onchainkit/fund';

interface OnRampConfig {
    projectId: string;
    destinationAddress: string;
    amount: string;
    currency: string;
    paymentMethod: string[];
    redirectUrl: string;
    partnerUserId: string;
}

interface OnRampUrlParams {
    amount: string;
    productAsin: string;
    sessionId?: string;
}

export class CDPOnRampService {
    // Use environment variables for configuration
    private static readonly CDP_PROJECT_ID = import.meta.env.VITE_CDP_PROJECT_ID;
    private static readonly CDP_WALLET_ADDRESS = '0xADc3Ff22E54383C727Ed72c9Fa5BEF578d18d734';
    private static readonly BASE_REDIRECT_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3004';

    /**
     * Generate Apple Pay on-ramp URL for Amazon purchases
     * @param params - Parameters for URL generation
     * @returns Complete Coinbase Pay URL with Apple Pay integration
     */
    static generateApplePayOnRampUrl(params: OnRampUrlParams): string {
        const { amount, productAsin, sessionId } = params;

        try {
            // Generate unique partner user ID for tracking
            const timestamp = Date.now();
            const partnerUserId = `amazon-purchase-${timestamp}`;

            // Construct return URL with necessary parameters
            const redirectUrl = `${this.BASE_REDIRECT_URL}/amazon-purchase-return?` +
                new URLSearchParams({
                    asin: productAsin,
                    amount: amount,
                    partnerId: partnerUserId,
                    sessionId: sessionId || timestamp.toString(),
                    timestamp: timestamp.toString()
                }).toString();

            console.log('🔄 Generating Apple Pay on-ramp URL:', {
                projectId: this.CDP_PROJECT_ID,
                destinationAddress: this.CDP_WALLET_ADDRESS,
                amount,
                redirectUrl,
                partnerUserId
            });

            // Generate on-ramp URL using OnchainKit
            const onRampUrl = getOnrampBuyUrl({
                projectId: this.CDP_PROJECT_ID,
                addresses: {
                    [this.CDP_WALLET_ADDRESS]: ['base'] // Base Mainnet
                },
                assets: ['USDC'], // Only USDC for our use case
                presetFiatAmount: parseFloat(amount),
                fiatCurrency: 'USD',
                redirectUrl: redirectUrl,
                partnerUserId: partnerUserId,
                // Note: paymentMethods parameter may not be directly supported
                // Apple Pay will be available as an option on Coinbase Pay
            });

            console.log('✅ Generated on-ramp URL:', onRampUrl);
            return onRampUrl;

        } catch (error) {
            console.error('❌ Failed to generate on-ramp URL:', error);
            throw new Error(`OnRamp URL generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Generate a basic on-ramp URL without Apple Pay restriction
     * (Coinbase Pay will show all available payment methods including Apple Pay)
     * @param params - Parameters for URL generation
     * @returns Complete Coinbase Pay URL
     */
    static generateOnRampUrl(params: OnRampUrlParams): string {
        return this.generateApplePayOnRampUrl(params);
    }

    /**
     * Validate on-ramp parameters before URL generation
     * @param params - Parameters to validate
     * @returns Validation result
     */
    static validateParams(params: OnRampUrlParams): { isValid: boolean; error?: string } {
        const { amount, productAsin } = params;

        if (!amount || parseFloat(amount) <= 0) {
            return { isValid: false, error: 'Invalid amount: must be greater than 0' };
        }

        if (parseFloat(amount) > 10000) {
            return { isValid: false, error: 'Amount too large: maximum $10,000' };
        }

        if (!productAsin || !productAsin.startsWith('amazon:')) {
            return { isValid: false, error: 'Invalid product ASIN format' };
        }

        if (!this.CDP_PROJECT_ID) {
            return { isValid: false, error: 'CDP Project ID not configured' };
        }

        return { isValid: true };
    }

    /**
     * Get configuration information for debugging
     * @returns Current service configuration
     */
    static getConfig() {
        return {
            projectId: this.CDP_PROJECT_ID,
            walletAddress: this.CDP_WALLET_ADDRESS,
            baseRedirectUrl: this.BASE_REDIRECT_URL,
            network: 'base',
            targetCurrency: 'USDC'
        };
    }

    /**
     * Generate return URL for a given set of parameters
     * @param params - Parameters for return URL
     * @returns Complete return URL
     */
    static generateReturnUrl(params: OnRampUrlParams & { partnerId: string }): string {
        const { amount, productAsin, sessionId, partnerId } = params;

        return `${this.BASE_REDIRECT_URL}/amazon-purchase-return?` +
            new URLSearchParams({
                asin: productAsin,
                amount: amount,
                partnerId: partnerId,
                sessionId: sessionId || Date.now().toString(),
                timestamp: Date.now().toString()
            }).toString();
    }
}

// Export types for use in other components
export type { OnRampUrlParams, OnRampConfig };
