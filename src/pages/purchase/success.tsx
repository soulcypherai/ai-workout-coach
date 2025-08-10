import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { logError } from "@/lib/errorLogger";
import { getPublicClient } from "@/provider/viem";
import { CheckCircle, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";

const API_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3005";

interface PaymentStatus {
  status: string;
  payment_status: string;
  credits: number;
}

const PurchaseSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getToken, isLoading, isMiniApp } = useAuth();
  const [loading, setLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const sessionId = searchParams.get("session_id");
  const paymentType: "card" | "crypto" =
    (searchParams.get("payment_type") as "card" | "crypto") || "card";
  const credits: number = parseInt(searchParams.get("credits") || "0");

  useEffect(() => {
    if (sessionId && !isLoading) {
      if (paymentType === "card") verifyCardPayment();
      else verifyCryptoPayment();
    } else if (!sessionId) {
      setError("No session ID found");
      setLoading(false);
    }
  }, [sessionId, isLoading]);

  const verifyCardPayment = async () => {
    try {
      const accessToken = getToken();

      if (!accessToken && !isMiniApp) {
        setError("Authentication required");
        return;
      }

      const response = await fetch(
        `${API_URL}/api/payments/session-status/${sessionId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          credentials: "include",
        },
      );

      if (response.ok) {
        const data = await response.json();
        setPaymentStatus(data);

        if (data.payment_status !== "paid") {
          setError("Payment was not completed successfully");
        }
      } else {
        setError("Failed to verify payment status");
      }
    } catch (err) {
      logError("Error verifying payment", err, {
        section: "payment",
        sessionId,
      });
      setError("Failed to verify payment");
    } finally {
      setLoading(false);
    }
  };

  const verifyCryptoPayment = async () => {
    try {
      const accessToken = getToken();

      if (!accessToken && !isMiniApp) {
        setError("Authentication required");
        return;
      }

      const publicClient = getPublicClient();

      const paymentReceipt = await publicClient.waitForTransactionReceipt({
        hash: sessionId as `0x${string}`,
      });

      if (paymentReceipt.status == "success") {
        setPaymentStatus({
          status: "successful",
          payment_status: "paid",
          credits,
        });

        return;
      }
    } catch (err) {
      logError("Error verifying payment", err, {
        section: "payment",
        sessionId,
      });
      setError("Failed to verify payment");
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    navigate("/");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-center">
          <Loader2 className="text-accent mx-auto mb-4 h-12 w-12 animate-spin" />
          <h2 className="mb-2 text-xl font-semibold text-white">
            Verifying Payment
          </h2>
          <p className="text-gray-400">
            Please wait while we confirm your purchase...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="mx-auto max-w-md p-6 text-center">
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-900/20 p-6">
            <h2 className="mb-2 text-xl font-semibold text-red-400">
              Payment Error
            </h2>
            <p className="text-gray-300">{error}</p>
          </div>
          <Button onClick={handleContinue} variant="outline">
            Return to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="mx-auto max-w-md p-6 text-center">
        <div className="mb-6 rounded-lg border border-green-500/30 bg-green-900/20 p-8">
          <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-400" />
          <h2 className="mb-2 text-2xl font-semibold text-white">
            Payment Successful!
          </h2>
          <p className="mb-4 text-gray-300">
            Your purchase has been completed successfully.
          </p>

          {paymentStatus && (
            <div className="mb-4 rounded-lg bg-gray-800 p-4">
              <p className="mb-1 text-sm text-gray-400">Credits Added</p>
              <p className="text-accent text-2xl font-bold">
                {paymentStatus.credits} credits
              </p>
            </div>
          )}

          <p className="text-sm text-gray-400">
            Credits have been added to your account and you can now start
            chatting with AI avatars!
          </p>
        </div>

        <Button
          onClick={handleContinue}
          className="bg-accent hover:bg-accent/90 w-full text-black"
        >
          Continue to App
        </Button>
      </div>
    </div>
  );
};

export default PurchaseSuccess;
