// USDC Transfer Service for Base Mainnet
import { parseUnits, formatUnits } from 'viem';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';

// USDC contract on Base Mainnet
export const USDC_CONTRACT_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Target CDP wallet address from PRD
export const CDP_WALLET_ADDRESS = '0xADc3Ff22E54383C727Ed72c9Fa5BEF578d18d734';

// USDC ABI (minimal - just what we need for transfers)
export const USDC_ABI = [
    {
        name: 'transfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'decimals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint8' }],
    },
] as const;

export interface TransferResult {
    success: boolean;
    txHash?: string;
    error?: string;
    orderId?: string;
}

export interface PaymentStatus {
    status: 'idle' | 'preparing' | 'pending' | 'confirmed' | 'failed';
    txHash?: string;
    error?: string;
    confirmations?: number;
}

export const useUSDCTransfer = () => {
    const { address, isConnected } = useAccount();

    const {
        writeContract,
        isPending: isWritePending,
        error: writeError,
        data: txHash
    } = useWriteContract();

    const {
        isLoading: isWaitingForConfirmation,
        isSuccess: isConfirmed,
        error: confirmationError
    } = useWaitForTransactionReceipt({
        hash: txHash,
        confirmations: 2, // Wait for 2 confirmations for security
    });

    // Get user's USDC balance
    const { data: balance, refetch: refetchBalance } = useReadContract({
        address: USDC_CONTRACT_ADDRESS,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: {
            enabled: !!address && isConnected,
        },
    });

    /**
     * Transfer USDC to CDP wallet
     * @param amount - Amount in USDC (e.g., "23.93")
     * @returns Promise with transaction hash
     */
    const transferUSDC = async (amount: string): Promise<string> => {
        if (!isConnected || !address) {
            throw new Error('Wallet not connected');
        }

        if (!amount || parseFloat(amount) <= 0) {
            throw new Error('Invalid amount');
        }

        try {
            // Convert amount to wei (6 decimals for USDC)
            const amountWei = parseUnits(amount, 6);

            console.log('🔄 Initiating USDC transfer:', {
                from: address,
                to: CDP_WALLET_ADDRESS,
                amount: amount,
                amountWei: amountWei.toString(),
            });

            // Execute the transfer
            writeContract({
                address: USDC_CONTRACT_ADDRESS,
                abi: USDC_ABI,
                functionName: 'transfer',
                args: [CDP_WALLET_ADDRESS, amountWei],
            });

            // Return immediately - caller should monitor via hooks
            return 'pending';
        } catch (error) {
            console.error('❌ USDC transfer failed:', error);
            throw error;
        }
    };

    /**
     * Check if user has sufficient USDC balance
     * @param requiredAmount - Required amount in USDC
     * @returns boolean
     */
    const hasSufficientBalance = (requiredAmount: string): boolean => {
        if (!balance) return false;

        try {
            const required = parseUnits(requiredAmount, 6);
            return balance >= required;
        } catch {
            return false;
        }
    };

    /**
     * Get formatted balance string
     * @returns Formatted USDC balance
     */
    const getFormattedBalance = (): string => {
        if (!balance) return '0.00';
        return formatUnits(balance, 6);
    };

    /**
     * Get current payment status
     * @returns PaymentStatus object
     */
    const getPaymentStatus = (): PaymentStatus => {
        if (writeError || confirmationError) {
            return {
                status: 'failed',
                error: writeError?.message || confirmationError?.message,
            };
        }

        if (isConfirmed) {
            return {
                status: 'confirmed',
                txHash: txHash,
                confirmations: 2,
            };
        }

        if (isWaitingForConfirmation && txHash) {
            return {
                status: 'pending',
                txHash: txHash,
            };
        }

        if (isWritePending) {
            return {
                status: 'preparing',
            };
        }

        return {
            status: 'idle',
        };
    };

    return {
        transferUSDC,
        hasSufficientBalance,
        getFormattedBalance,
        getPaymentStatus,
        refetchBalance,
        txHash,
        isWritePending,
        isWaitingForConfirmation,
        isConfirmed,
        error: writeError || confirmationError,
    };
};
