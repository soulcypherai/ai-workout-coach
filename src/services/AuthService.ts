import { supabase } from "@/lib/supabase";
import axios from "axios";

import { User } from "@/types/slices";

const API_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3005";

export class AuthService {
  /**
   * Logs the user into our backend using a Supabase access token.
   * @param supabaseAccessToken The access token from Supabase auth.
   * @param walletAddress Optional wallet address.
   * @returns The user data and the same Supabase token (now used directly).
   */
  async loginWithSupabase(
    supabaseAccessToken: string,
    walletAddress?: string,
  ): Promise<{ token: string; user: User }> {
    const response = await axios.post(
      `${API_URL}/api/auth/login`,
      { walletAddress }, // Optional wallet address in body
      {
        headers: {
          Authorization: `Bearer ${supabaseAccessToken}`,
        },
        withCredentials: true, // Include cookies in requests
      },
    );
    // Token returned is now the Supabase token itself
    return response.data;
  }

  /**
   * Logs the user into our backend using MiniKit wallet authentication.
   * @param minikitResult The result object from MiniKit signIn.
   * @param walletAddress The user's wallet address.
   * @returns The user data (token is stored in HTTP-only cookie).
   */
  async loginWithMiniKit(
    minikitResult: any,
    walletAddress: string,
    userInfo: {
      username: string | undefined;
      fid: number | undefined;
      pfp: string | undefined;
    },
  ): Promise<{ user: User }> {

    const response = await axios.post(
      `${API_URL}/api/auth/minikit-login`,
      {
        authMethod: minikitResult.authMethod,
        message: minikitResult.message,
        signature: minikitResult.signature,
        walletAddress: walletAddress,
        userInfo: userInfo,
      },
      {
        withCredentials: true, // Include cookies in requests
      },
    );
    return response.data;
  }

  /**
   * Logs out the user from MiniKit authentication.
   * @returns Success status.
   */
  async logoutFromMiniKit(): Promise<{ success: boolean }> {
    const response = await axios.post(
      `${API_URL}/api/auth/minikit-logout`,
      {},
      {
        withCredentials: true, // Include cookies in requests
      },
    );
    return response.data;
  }

  /**
   * Legacy Privy login method (deprecated)
   * @param privyToken The access token from the Privy SDK.
   * @param idToken The ID token from the Privy SDK.
   * @returns The user data and our application-specific session token.
   */
  async loginWithPrivy(
    privyToken: string,
    idToken: string,
  ): Promise<{ token: string; user: User }> {
    const response = await axios.post(
      `${API_URL}/api/auth/privy-login`,
      {
        privyToken,
        idToken,
      },
      {
        withCredentials: true, // Include cookies in requests
      },
    );
    return response.data;
  }

  /**
   * Verifies a token and returns user data.
   * @param token The token to verify (can be Supabase token or MiniKit JWT from cookie).
   * @returns The user data.
   */
  async verify(token?: string): Promise<{ user: User }> {
    console.log("verifying token");
    const config: any = {
      withCredentials: true, // Include cookies in requests
    };

    // If token is provided, add it to headers (for Supabase tokens)
    if (token) {
      config.headers = {
        Authorization: `Bearer ${token}`,
      };
    }

    const response = await axios.get(`${API_URL}/api/auth/verify`, config);
    return response.data;
  }

  /**
   * Get the current Supabase access token from session
   * @returns The Supabase access token or null if not authenticated
   */
  async getToken(): Promise<string | null> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || null;
      console.log("[AuthService] Getting token from Supabase session:", {
        hasToken: !!token,
      });
      return token;
    } catch (error) {
      console.error("[AuthService] Error getting Supabase session:", error);
      return null;
    }
  }

  /**
   * Check if user is authenticated by verifying Supabase session
   * @returns true if user has valid session
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    return !!token;
  }

  /**
   * No longer storing tokens locally - they come from Supabase session
   */
  async storeToken(): Promise<void> {
    console.warn(
      "[AuthService] storeToken is deprecated - tokens are managed by Supabase session",
    );
  }

  /**
   * No longer storing tokens locally - they come from Supabase session
   */
  async getStoredToken(): Promise<string | null> {
    console.warn(
      "[AuthService] getStoredToken is deprecated - tokens are managed by Supabase session",
    );
    return null;
  }

  /**
   * No longer storing tokens locally - they come from Supabase session
   */
  async clearStoredToken(): Promise<void> {
    console.warn(
      "[AuthService] clearStoredToken is deprecated - tokens are managed by Supabase session",
    );
  }
}

export const authService = new AuthService();
