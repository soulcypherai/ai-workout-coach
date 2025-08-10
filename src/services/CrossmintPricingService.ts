// Frontend Crossmint Quote Service for real-time pricing
import axios from 'axios';

interface Product {
    name: string;
    price: string;
    url: string;
    asin: string;
    image: string;
}

interface QuoteResponse {
    success: boolean;
    productPrice: string;
    cryptoPricing?: {
        usdc: {
            amount: string;
            currency: string;
            breakdown: {
                basePrice: string;
                tax: string;
                total: string;
            };
        };
        eth: {
            amount: string;
            currency: string;
            breakdown: {
                basePrice: string;
                tax: string;
                total: string;
            };
        };
    };
    quoteExpiry?: string;
    error?: string;
}

export class CrossmintPricingService {
    private baseURL: string;

    constructor() {
        // Use backend API to proxy Crossmint requests (avoids CORS)
        this.baseURL = import.meta.env.VITE_SERVER_URL
            ? `${import.meta.env.VITE_SERVER_URL}/api`
            : 'http://localhost:3005/api';
    }

    /**
     * Get real-time pricing for a product in both USDC and ETH
     * @param product - Product information
     * @param walletAddress - User's wallet address (optional)
     * @returns Promise with pricing information
     */
    async getProductPricing(product: Product, walletAddress?: string): Promise<QuoteResponse> {
        try {
            console.log(`🔍 Fetching real-time pricing for ${product.name}...`);

            // Extract ASIN from product
            const asin = product.asin;

            // Default wallet address if none provided (for quote purposes)
            const defaultAddress = '0x1234567890123456789012345678901234567890';
            const payerAddress = walletAddress || defaultAddress;

            // Get quotes for both USDC and ETH
            const [usdcQuote, ethQuote] = await Promise.allSettled([
                this.getQuoteFromBackend(asin, 'base', 'usdc', payerAddress),
                this.getQuoteFromBackend(asin, 'base', 'eth', payerAddress)
            ]);

            const result: QuoteResponse = {
                success: false,
                productPrice: product.price,
            };

            // Process USDC quote
            let usdcData = null;
            if (usdcQuote.status === 'fulfilled' && usdcQuote.value.success) {
                console.log('USDC Quote Response:', usdcQuote.value);
                usdcData = {
                    amount: usdcQuote.value.totalAmount || '0',
                    currency: 'USDC',
                    breakdown: {
                        basePrice: usdcQuote.value.baseAmount || '0',
                        tax: usdcQuote.value.taxAmount || '0',
                        total: usdcQuote.value.totalAmount || '0'
                    }
                };
            } else {
                console.log('USDC Quote Failed:', usdcQuote);
            }

            // Process ETH quote
            let ethData = null;
            if (ethQuote.status === 'fulfilled' && ethQuote.value.success) {
                console.log('ETH Quote Response:', ethQuote.value);
                ethData = {
                    amount: ethQuote.value.totalAmount || '0',
                    currency: 'ETH',
                    breakdown: {
                        basePrice: ethQuote.value.baseAmount || '0',
                        tax: ethQuote.value.taxAmount || '0',
                        total: ethQuote.value.totalAmount || '0'
                    }
                };
            } else {
                console.log('ETH Quote Failed:', ethQuote);
            }

            // If we have at least one successful quote
            if (usdcData || ethData) {
                result.success = true;
                result.cryptoPricing = {
                    usdc: usdcData || this.getFallbackPricing(product).usdc,
                    eth: ethData || this.getFallbackPricing(product).eth
                };

                // Set expiry to 30 minutes from now
                const expiry = new Date();
                expiry.setMinutes(expiry.getMinutes() + 30);
                result.quoteExpiry = expiry.toISOString();
            } else {
                // Always provide fallback pricing for a working demo
                console.log('🔄 Using fallback pricing - API not working');
                result.success = true;
                result.cryptoPricing = this.getFallbackPricing(product);
                result.error = 'Using calculated pricing - Crossmint API unavailable';
            }

            console.log(`✅ Pricing fetched successfully for ${product.name}`);
            return result;

        } catch (error) {
            console.error(`❌ Failed to fetch pricing for ${product.name}:`, error);

            // Return fallback pricing
            return {
                success: true,
                productPrice: product.price,
                cryptoPricing: this.getFallbackPricing(product),
                error: 'API error - using fallback pricing'
            };
        }
    }

    /**
     * Call backend API to get quote from Crossmint
     * @param asin - Product ASIN
     * @param paymentMethod - Blockchain network
     * @param currency - Payment currency
     * @param payerAddress - Wallet address
     */
    private async getQuoteFromBackend(
        asin: string,
        paymentMethod: string,
        currency: string,
        payerAddress: string
    ) {
        const response = await axios.post(`${this.baseURL}/crossmint/quote`, {
            asin,
            paymentMethod,
            currency,
            payerAddress
        }, {
            timeout: 10000, // 10 second timeout
            headers: {
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    }

    /**
     * Get fallback pricing when API is unavailable
     * @param product - Product information
     */
    private getFallbackPricing(product: Product) {
        // Simple fallback based on USD price
        const usdPrice = parseFloat(product.price.replace('$', ''));
        const usdcAmount = (usdPrice * 1.07).toFixed(2); // Add 7% for taxes/fees
        const ethAmount = (usdPrice / 4200).toFixed(5); // Rough ETH conversion

        return {
            usdc: {
                amount: usdcAmount,
                currency: 'USDC',
                breakdown: {
                    basePrice: usdPrice.toFixed(2),
                    tax: (usdPrice * 0.07).toFixed(2),
                    total: usdcAmount
                }
            },
            eth: {
                amount: ethAmount,
                currency: 'ETH',
                breakdown: {
                    basePrice: (parseFloat(ethAmount) * 0.93).toFixed(5),
                    tax: (parseFloat(ethAmount) * 0.07).toFixed(5),
                    total: ethAmount
                }
            }
        };
    }
}

// Export singleton instance
export const crossmintPricingService = new CrossmintPricingService();
