// Transaction Verification Service for USDC Transfers
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { USDC_CONTRACT_ADDRESS, CDP_WALLET_ADDRESS } from './USDCTransferService';

// Public client for Base mainnet
const publicClient = createPublicClient({
    chain: base,
    transport: http(),
});

export interface TransactionVerification {
    isValid: boolean;
    amount?: string;
    from?: string;
    to?: string;
    blockNumber?: bigint;
    timestamp?: number;
    confirmations?: number;
    error?: string;
}

export interface PaymentValidation {
    isPaymentValid: boolean;
    expectedAmount: string;
    actualAmount?: string;
    isCorrectRecipient: boolean;
    isCorrectToken: boolean;
    error?: string;
}

export class TransactionVerificationService {
    /**
     * Verify a USDC transaction on Base mainnet
     * @param txHash - Transaction hash to verify
     * @returns Transaction verification details
     */
    static async verifyTransaction(txHash: string): Promise<TransactionVerification> {
        try {
            console.log('🔍 Verifying transaction:', txHash);

            // Get transaction receipt
            const receipt = await publicClient.getTransactionReceipt({
                hash: txHash as `0x${string}`,
            });

            if (!receipt) {
                return {
                    isValid: false,
                    error: 'Transaction not found',
                };
            }

            // Check if transaction was successful
            if (receipt.status !== 'success') {
                return {
                    isValid: false,
                    error: 'Transaction failed on blockchain',
                };
            }

            // Get transaction details (for additional validation if needed)
            // const transaction = await publicClient.getTransaction({
            //   hash: txHash as `0x${string}`,
            // });

            // Get current block number for confirmations
            const currentBlock = await publicClient.getBlockNumber();
            const confirmations = Number(currentBlock - receipt.blockNumber);

            // Parse transfer event from logs
            let transferAmount = '0';
            let transferTo = '';
            let transferFrom = '';

            // Find Transfer event in logs
            for (const log of receipt.logs) {
                if (
                    log.address.toLowerCase() === USDC_CONTRACT_ADDRESS.toLowerCase() &&
                    log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' // Transfer event signature
                ) {
                    // Decode transfer event
                    transferFrom = `0x${log.topics[1]?.slice(26)}` || '';
                    transferTo = `0x${log.topics[2]?.slice(26)}` || '';

                    if (log.data) {
                        const amount = BigInt(log.data);
                        transferAmount = (Number(amount) / 1e6).toString(); // Convert from wei to USDC
                    }
                    break;
                }
            }

            // Get block timestamp
            const block = await publicClient.getBlock({
                blockNumber: receipt.blockNumber,
            });

            return {
                isValid: true,
                amount: transferAmount,
                from: transferFrom,
                to: transferTo,
                blockNumber: receipt.blockNumber,
                timestamp: Number(block.timestamp),
                confirmations,
            };

        } catch (error) {
            console.error('❌ Transaction verification failed:', error);
            return {
                isValid: false,
                error: error instanceof Error ? error.message : 'Verification failed',
            };
        }
    }

    /**
     * Validate that a payment meets expected criteria
     * @param txHash - Transaction hash
     * @param expectedAmount - Expected USDC amount
     * @param expectedFrom - Expected sender address
     * @returns Payment validation result
     */
    static async validatePayment(
        txHash: string,
        expectedAmount: string,
        expectedFrom?: string
    ): Promise<PaymentValidation> {
        try {
            const verification = await this.verifyTransaction(txHash);

            if (!verification.isValid) {
                return {
                    isPaymentValid: false,
                    expectedAmount,
                    isCorrectRecipient: false,
                    isCorrectToken: false,
                    error: verification.error,
                };
            }

            const isCorrectRecipient = verification.to?.toLowerCase() === CDP_WALLET_ADDRESS.toLowerCase();
            const isCorrectToken = true; // Already verified by checking USDC contract logs

            // Allow for small differences due to precision (within 0.01 USDC)
            const expectedAmountNum = parseFloat(expectedAmount);
            const actualAmountNum = parseFloat(verification.amount || '0');
            const amountDifference = Math.abs(expectedAmountNum - actualAmountNum);
            const isCorrectAmount = amountDifference < 0.01;

            // Validate sender if provided
            const isCorrectSender = expectedFrom
                ? verification.from?.toLowerCase() === expectedFrom.toLowerCase()
                : true;

            const isPaymentValid = isCorrectRecipient && isCorrectToken && isCorrectAmount && isCorrectSender;

            return {
                isPaymentValid,
                expectedAmount,
                actualAmount: verification.amount,
                isCorrectRecipient,
                isCorrectToken,
                error: !isPaymentValid ? 'Payment validation failed' : undefined,
            };

        } catch (error) {
            console.error('❌ Payment validation failed:', error);
            return {
                isPaymentValid: false,
                expectedAmount,
                isCorrectRecipient: false,
                isCorrectToken: false,
                error: error instanceof Error ? error.message : 'Validation failed',
            };
        }
    }

    /**
     * Wait for transaction confirmation with timeout
     * @param txHash - Transaction hash
     * @param requiredConfirmations - Number of confirmations to wait for
     * @param timeoutMs - Timeout in milliseconds
     * @returns Promise that resolves when confirmed or rejects on timeout
     */
    static async waitForConfirmation(
        txHash: string,
        requiredConfirmations: number = 2,
        timeoutMs: number = 300000 // 5 minutes
    ): Promise<TransactionVerification> {
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const checkConfirmation = async () => {
                try {
                    const verification = await this.verifyTransaction(txHash);

                    if (!verification.isValid) {
                        reject(new Error(verification.error || 'Transaction invalid'));
                        return;
                    }

                    if ((verification.confirmations || 0) >= requiredConfirmations) {
                        console.log(`✅ Transaction confirmed with ${verification.confirmations} confirmations`);
                        resolve(verification);
                        return;
                    }

                    // Check timeout
                    if (Date.now() - startTime > timeoutMs) {
                        reject(new Error('Confirmation timeout'));
                        return;
                    }

                    // Check again in 5 seconds
                    setTimeout(checkConfirmation, 5000);

                } catch (error) {
                    reject(error);
                }
            };

            checkConfirmation();
        });
    }

    /**
     * Get transaction URL for Base block explorer
     * @param txHash - Transaction hash
     * @returns Block explorer URL
     */
    static getExplorerUrl(txHash: string): string {
        return `https://basescan.org/tx/${txHash}`;
    }

    /**
     * Check if transaction exists and is pending
     * @param txHash - Transaction hash
     * @returns Boolean indicating if transaction is pending
     */
    static async isTransactionPending(txHash: string): Promise<boolean> {
        try {
            const receipt = await publicClient.getTransactionReceipt({
                hash: txHash as `0x${string}`,
            });
            return receipt === null; // null means pending
        } catch {
            return false;
        }
    }
}
