import { dispatch } from "@/store";
import { setBuyCreditModal } from "@/store/slices/modal";
import { ArrowLeft, CreditCard, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";

const PurchaseCancelled = () => {
  const navigate = useNavigate();

  const handleReturnHome = () => {
    navigate("/");
  };

  const handleTryAgain = () => {
    navigate("/");
    // Open the buy credits modal after a short delay
    setTimeout(() => {
      dispatch(setBuyCreditModal([true]));
    }, 100);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="mx-auto max-w-md p-6 text-center">
        <div className="mb-6 rounded-lg border border-gray-700 bg-gray-900/50 p-8">
          <XCircle className="mx-auto mb-4 h-16 w-16 text-gray-400" />
          <h2 className="mb-2 text-2xl font-semibold text-white">
            Payment Cancelled
          </h2>
          <p className="mb-4 text-gray-300">
            Your payment was cancelled and no charges were made.
          </p>
          <p className="text-sm text-gray-400">
            You can try again anytime to purchase credits and start chatting
            with AI avatars.
          </p>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleTryAgain}
            className="bg-accent hover:bg-accent/90 w-full text-black"
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Try Again
          </Button>

          <Button
            onClick={handleReturnHome}
            variant="outline"
            className="text-accent w-full hover:bg-transparent"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Return to Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PurchaseCancelled;
