import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { logError } from "@/lib/errorLogger";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3005";

interface CreditValidationResult {
  sufficient: boolean;
  currentBalance: number;
  required: number;
  deficit: number;
  avatarName: string;
  avatarCost: number;
  perMinuteCost: number;
  estimatedTotal: number;
  estimatedMinutes: number;
}

interface CreditValidationState {
  isValidating: boolean;
  isValid: boolean | null;
  error: string | null;
  result: CreditValidationResult | null;
}

export const useCreditsValidation = (
  avatarId: string,
  userId: string | null,
) => {
  const [state, setState] = useState<CreditValidationState>({
    isValidating: false,
    isValid: null,
    error: null,
    result: null,
  });

  const navigate = useNavigate();
  const { token, isMiniApp } = useAuth();

  useEffect(() => {
    if (!avatarId || !userId || !token) {
      console.log("[Credits] Skipping validation - missing data:", {
        avatarId,
        userId,
        hasToken: !!token,
      });
      return;
    }

    const validateCredits = async () => {
      setState((prev) => ({ ...prev, isValidating: true, error: null }));

      try {
        // Prepare headers based on platform
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        // Only add Authorization header for web platform
        if (!isMiniApp && token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const fetchOptions: RequestInit = {
          method: "POST",
          headers,
          body: JSON.stringify({
            avatarId,
            estimatedMinutes: 1, // Only require 1 minute to start
          }),
        };

        // Add credentials for Mini App
        if (isMiniApp) {
          fetchOptions.credentials = "include";
        }

        const response = await fetch(
          `${API_URL}/api/credits/validate`,
          fetchOptions,
        );

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(
            `Validation failed: ${response.status} ${response.statusText} - ${errorData}`,
          );
        }

        const result: CreditValidationResult = await response.json();

        setState({
          isValidating: false,
          isValid: result.sufficient,
          error: null,
          result,
        });

        // If insufficient credits, redirect to home with error
        if (!result.sufficient) {
          navigate(
            `/?insufficient-credits=true&required=${result.required}&balance=${result.currentBalance}&avatar=${result.avatarName}`,
          );
        }
      } catch (error) {
        logError("[Credits] Error validating credits", error, {
          section: "credits_validation",
        });
        setState({
          isValidating: false,
          isValid: false,
          error: error instanceof Error ? error.message : "Validation failed",
          result: null,
        });

        // On error, redirect to home with error message
        navigate("/?credit-error=true");
      }
    };

    validateCredits();
  }, [avatarId, userId, token, navigate]);

  return state;
};
