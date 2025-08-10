import { useEffect, useState } from "react";

import { PaymentProcessorContract } from "@/constants/contract";
import { useAuth } from "@/contexts/AuthContext";
import { logError } from "@/lib/errorLogger";
import { cn } from "@/lib/utils";
import { dispatch, useSelector } from "@/store";
import { setBuyCreditModal } from "@/store/slices/modal";
import { useOpenUrl } from "@coinbase/onchainkit/minikit";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";
import { useAccount, useSwitchChain } from "wagmi";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

import { getPublicClient, getWalletClient } from "../../provider/viem";

const API_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3005";

type CreditPackage = {
  credits: number;
  price: number;
  isSelected?: boolean;
  isPopular?: boolean;
};

const BuyCreditDrawer = () => {
  const { openConnectModal } = useConnectModal();
  const { isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();

  const { isOpen: isBuyCreditModalOpen, data: modalData } = useSelector(
    (state) => state.modal.buyCreditModal,
  );
  const { token, isMiniApp } = useAuth();
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);

  const [purchasing, setPurchasing] = useState(false);
  const [purchasingWithCrypto, setPurchasingWithCrypto] = useState(false);

  const [paymentBtnText, setPaymentBtnText] = useState("");
  const openUrl = useOpenUrl();

  // Fetch credit packages when drawer opens
  useEffect(() => {
    if (isBuyCreditModalOpen) {
      fetchCreditPackages();
    }
  }, [isBuyCreditModalOpen]);

  const fetchCreditPackages = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/payments/packages`);

      if (response.ok) {
        const data = await response.json();
        // Use standard packages from the API
        const packages = data.standardPackages.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (pkg: any, index: number) => ({
            ...pkg,
            isSelected: index === 1, // Select the popular one by default
          }),
        );
        setCreditPackages(packages);
      } else {
        // Fallback to default packages if API fails
        setCreditPackages([
          { credits: 100, price: 10.0, isSelected: false },
          { credits: 500, price: 45.0, isSelected: true, isPopular: true },
          { credits: 1000, price: 80.0, isSelected: false },
          { credits: 2000, price: 150.0, isSelected: false },
        ]);
        toast.error("Failed to load credit packages");
      }
    } catch (error) {
      logError("Error fetching credit packages", error, {
        section: "buy_points",
      });
      // Fallback packages
      setCreditPackages([
        { credits: 100, price: 10.0, isSelected: false },
        { credits: 500, price: 45.0, isSelected: true, isPopular: true },
        { credits: 1000, price: 80.0, isSelected: false },
        { credits: 2000, price: 150.0, isSelected: false },
      ]);
      toast.error("Failed to load credit packages");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (index: number) => {
    setCreditPackages(
      creditPackages.map((pkg, i) => ({
        ...pkg,
        isSelected: i === index,
      })),
    );
  };

  const selectedPackage =
    creditPackages.find((pkg) => pkg.isSelected) || creditPackages[0];

  const handlePurchase = async () => {
    if (!selectedPackage || purchasing || purchasingWithCrypto) return;

    try {
      setPurchasing(true);

      if (!token) {
        toast.error("Please login to purchase credits");
        return;
      }

      // Create checkout session
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Only include Authorization header for web apps (not Mini Apps)
      if (!isMiniApp) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `${API_URL}/api/payments/create-checkout-session`,
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            credits: selectedPackage.credits,
            priceUsd: selectedPackage.price,
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        // Redirect to Stripe Checkout
        if (isMiniApp) {
          openUrl(data.checkoutUrl);
        } else {
          window.location.href = data.checkoutUrl;
        }
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to create checkout session");
      }
    } catch (error) {
      logError("Error creating checkout session", error, {
        section: "buy_points",
      });
      toast.error("Failed to start purchase process");
    } finally {
      setPurchasing(false);
    }
  };

  const handlePurchaseWithShark = async () => {
    setPaymentBtnText("Initializing payment...");
    setPurchasingWithCrypto(true);

    if (!isConnected && openConnectModal) {
      setPaymentBtnText("Connecting wallet...");
      openConnectModal();
      onOpenChange();
      setPurchasingWithCrypto(false);
      return;
    }

    if (
      !isConnected ||
      !selectedPackage ||
      purchasing ||
      purchasingWithCrypto
    ) {
      setPurchasingWithCrypto(false);
      return;
    }

    try {
      if (!token) {
        toast.error("Please login to purchase credits");
        setPurchasingWithCrypto(false);
        return;
      }

      const client = await getWalletClient();
      const publicClient = getPublicClient();

      if (!client) {
        setPurchasingWithCrypto(false);
        throw new Error("Wallet client not available");
      }

      const expectedChainId = client?.chain.id;

      if (chain?.id !== expectedChainId) {
        setPaymentBtnText("Switching network...");
        try {
          switchChain({ chainId: expectedChainId });
          setPurchasingWithCrypto(false);
          return;
        } catch {
          setPurchasingWithCrypto(false);
          throw new Error("Failed to switch network");
        }
      }

      setPaymentBtnText("Requesting payment quote...");

      // Step 1: Get a signed quotation from backend
      const response = await fetch(
        `${API_URL}/api/crypto-payments/get-quotation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ priceUsd: selectedPackage.price }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to get payment quote");
      }

      const data = await response.json();
      const { user, creditAmount, tokenAmount, expiry, signature } = data;

      const chainId = expectedChainId;
      const { contractAddress, abi, tokenAddress } =
        PaymentProcessorContract[chainId];
      const [account] = await client.getAddresses();

      // Step 2: Approve tokens
      const tokenAbi = [
        {
          inputs: [
            { internalType: "address", name: "spender", type: "address" },
            { internalType: "uint256", name: "amount", type: "uint256" },
          ],
          name: "approve",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        },
      ] as const;

      setPaymentBtnText("Authorizing $SHARK token...");

      const approveTx = await client.writeContract({
        address: tokenAddress as `0x${string}`,
        abi: tokenAbi,
        functionName: "approve",
        args: [contractAddress as `0x${string}`, tokenAmount],
        account,
      });

      // Wait for the approve transaction to be mined before proceeding
      const approveReceipt = await publicClient.waitForTransactionReceipt({
        hash: approveTx,
      });

      if (approveReceipt.status !== "success") {
        setPurchasingWithCrypto(false);
        throw new Error("Authorization transaction failed");
      }

      setPaymentBtnText("Processing payment...");

      const paymentTx = await client.writeContract({
        address: contractAddress as `0x${string}`,
        abi,
        functionName: "pay",
        args: [{ user, creditAmount, tokenAmount, expiry }, signature],
        account,
      });

      const paymentReceipt = await publicClient.waitForTransactionReceipt({
        hash: paymentTx,
      });

      if (paymentReceipt.status !== "success") {
        setPurchasingWithCrypto(false);
        throw new Error("Payment transaction failed");
      }

      window.location.href = `/purchase/success?payment_type=crypto&session_id=${paymentTx}&credits=${creditAmount}`;
    } catch (error) {
      logError("Error in shark payment", error, { section: "buy_points" });
      window.location.href = "/purchase/cancelled";
    } finally {
      setPurchasingWithCrypto(false);
    }
  };

  const onOpenChange = () => {
    dispatch(setBuyCreditModal([false]));
  };

  return (
    <Drawer open={isBuyCreditModalOpen} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-black p-4 text-white focus:outline-none">
        <DrawerHeader className="flex flex-col items-center">
          <DrawerTitle className="font-secondary text-accent text-center text-3xl">
            {modalData?.title || "Buy Credits"}
          </DrawerTitle>

          <DrawerDescription className="text-secondary my-2 text-center text-sm">
            {modalData?.description ||
              "Purchase credits to talk with AI personalities"}
          </DrawerDescription>
        </DrawerHeader>

        {loading ? (
          <div className="p-8 text-center text-gray-400">
            Loading credit packages...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 p-4">
              {creditPackages.map((pkg, index) => (
                <div
                  key={index}
                  onClick={() => handleSelectOption(index)}
                  className={cn(
                    "relative flex cursor-pointer flex-col items-center rounded-xl px-2 py-4",
                    pkg.isSelected
                      ? "bg-bg-foreground border-accent border"
                      : "bg-bg-foreground border-border border",
                  )}
                >
                  {pkg.isPopular && (
                    <div className="bg-accent text-bg-primary absolute -top-2 left-1/2 -translate-x-1/2 transform rounded px-2 py-1 text-xs font-medium">
                      Popular
                    </div>
                  )}
                  <span className="text-accent font-secondary text-2xl">
                    {pkg.credits}
                  </span>
                  <span className="mt-1 text-sm">$ {pkg.price.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <DrawerFooter className="lg:flex lg:flex-row lg:gap-4">
              <button
                onClick={handlePurchase}
                disabled={
                  purchasing || purchasingWithCrypto || !selectedPackage
                }
                className="bg-accent text-bg-primary flex-1 rounded-xl py-3 font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                {purchasing
                  ? "Processing..."
                  : selectedPackage
                    ? `Pay $ ${selectedPackage.price.toFixed(2)} with Card`
                    : "Select a package"}
              </button>

              <button
                onClick={handlePurchaseWithShark}
                disabled={
                  purchasing || purchasingWithCrypto || !selectedPackage
                }
                className="bg-accent text-bg-primary flex-1 rounded-xl py-3 font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                {purchasingWithCrypto
                  ? paymentBtnText
                  : selectedPackage
                    ? `Pay $ ${selectedPackage.price.toFixed(2)} with $SHARK`
                    : "Select a package"}
              </button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default BuyCreditDrawer;
