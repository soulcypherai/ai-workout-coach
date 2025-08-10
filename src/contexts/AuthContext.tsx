import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import { logError } from "@/lib/errorLogger";
import { supabase } from "@/lib/supabase";
import { authService } from "@/services/AuthService";
import { RootState, useDispatch, useSelector } from "@/store";
import { setIsAppStarted } from "@/store/slices/app";
import { setPitches } from "@/store/slices/pitches";
// MiniKit imports
import { useAuthenticate, useMiniKit } from "@coinbase/onchainkit/minikit";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { toast } from "sonner";

import { User } from "@/types/slices";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrating: boolean;
  isMiniApp: boolean | null; // null = unknown, true = mini app, false = web
}

type AuthAction =
  | { type: "LOGIN_START" }
  | { type: "LOGIN_SUCCESS"; payload: { user: User; token: string } }
  | { type: "LOGIN_FAIL" }
  | { type: "LOGOUT" }
  | { type: "HYDRATION_COMPLETE" }
  | { type: "SET_PLATFORM"; payload: { isMiniApp: boolean } };

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<boolean>;
  sendMagicLink: (email: string) => Promise<boolean>;
  forgotPassword: (email: string) => Promise<boolean>;
  logout: () => void;
  getToken: () => string | null;
  loginWithMiniKit: (
    minikitResult: any,
    walletAddress: string,
    userInfo: {
      username: string | undefined;
      fid: number | undefined;
      pfp: string | undefined;
    },
  ) => Promise<boolean>;
  handleMiniAppAuthFlow: (skipVerification?: boolean) => Promise<void>;
  supabaseSession: Session | null;
  supabaseUser: SupabaseUser | null;
}

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  isHydrating: true,
  isMiniApp: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOGIN_START":
      return { ...state, isLoading: true };
    case "LOGIN_SUCCESS":
      return {
        ...state,
        isLoading: false,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
      };
    case "LOGIN_FAIL":
      return {
        ...state,
        isLoading: false,
        isAuthenticated: false,
        user: null,
        token: null,
      };
    case "LOGOUT":
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        token: null,
      };
    case "HYDRATION_COMPLETE":
      return { ...state, isHydrating: false };
    case "SET_PLATFORM":
      return { ...state, isMiniApp: action.payload.isMiniApp };
    default:
      return state;
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const reduxDispatch = useDispatch();
  const isAppStarted = useSelector(
    (state: RootState) => state.app.isAppStarted,
  );

  // MiniKit hooks
  const { context } = useMiniKit();
  const { signIn } = useAuthenticate();

  // Refs to prevent duplicate operations
  const isLoginInProgressRef = useRef(false);
  const lastToastTimeRef = useRef({ login: 0, logout: 0 });
  const minikitSignInAttemptedRef = useRef(false);
  const hasHydratedOnce = useRef(false);

  // Platform detection effect
  useEffect(() => {
    if (context !== null && !hasHydratedOnce.current) {
      const isMiniApp = context !== undefined;
      dispatch({ type: "SET_PLATFORM", payload: { isMiniApp } });

      if (!state.isAuthenticated && isMiniApp === false) {
        handleWebAuthFlow();
      }

      hasHydratedOnce.current = true;
    }
  }, [context, state.isAuthenticated]);
  // Web authentication flow
  const handleWebAuthFlow = useCallback(async () => {
    console.log("[AuthContext] Starting Web authentication flow...");

    try {
      // Check for existing Supabase session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        console.log("[AuthContext] Found existing Supabase session");
        const { user } = await authService.verify(session.access_token);
        dispatch({
          type: "LOGIN_SUCCESS",
          payload: { user, token: session.access_token },
        });
        if (user.pitches) reduxDispatch(setPitches(user.pitches));
      } else {
        console.log(
          "[AuthContext] No existing Supabase session, user needs to login",
        );
        // User will need to use auth modal for login
      }
    } catch (error) {
      console.error("[AuthContext] Web auth flow failed:", error);
      dispatch({ type: "LOGOUT" });
    }
  }, [reduxDispatch]);

  // Mini App authentication flow
  const handleMiniAppAuthFlow = useCallback(
    async (skipVerification?: boolean) => {
      if (minikitSignInAttemptedRef.current) {
        return; // Already attempted
      }

      minikitSignInAttemptedRef.current = true;
      console.log("[AuthContext] Starting Mini App authentication flow...");

      try {
        // First, check if user already has a valid MiniKit session
        dispatch({ type: "LOGIN_START" });

        if (!skipVerification) {
          try {
            const { user } = await authService.verify(); // Check cookies
            console.log("[AuthContext] Found existing MiniKit session");
            dispatch({
              type: "LOGIN_SUCCESS",
              payload: { user, token: "cookie" },
            });
            if (user.pitches) reduxDispatch(setPitches(user.pitches));
            minikitSignInAttemptedRef.current = false; // Reset flag before early return
            return; // Early return for existing session
          } catch (sessionError) {
            console.log(
              "[AuthContext] No existing MiniKit session, proceeding with sign-in",
            );
          }
        }
        // No existing session, proceed with MiniKit sign-in
        console.log("[AuthContext] Attempting MiniKit sign-in...");

        const result = await signIn({
          acceptAuthAddress: true,                  
        });
        if (result) {
          // Extract wallet address from the message          
          const walletAddressMatch = result.message.match(/0x[a-fA-F0-9]{40}/);
          const walletAddress = walletAddressMatch
            ? walletAddressMatch[0]
            : null;

          const userInfo = {
            username: context?.user.username,
            fid: context?.user.fid,
            pfp: context?.user.pfpUrl,
          };

          if (walletAddress) {
            const success = await loginWithMiniKit(
              result,
              walletAddress,
              userInfo,
            );
            if (success) {
              // toast.success("MiniKit authentication successful!");
            } else {
              toast.error("Failed to authenticate with MiniKit");
            }
          } else {
            toast.error("Could not extract wallet address from authentication");
          }
        }else{
          toast.error("Failed to authenticate");
          dispatch({ type: "LOGIN_FAIL" });
        }
      } catch (error) {
        console.error("[AuthContext] Mini App auth flow failed:", error);
        toast.error("Error signing in with MiniKit");
      } finally {
        minikitSignInAttemptedRef.current = false;
      }
    },
    [signIn, reduxDispatch],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (isLoginInProgressRef.current) {
        return false;
      }

      isLoginInProgressRef.current = true;
      dispatch({ type: "LOGIN_START" });

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        if (data.session && data.user) {
          // Call our backend to create/update user and get user data
          const { user: apiUser } = await authService.loginWithSupabase(
            data.session.access_token,
          );
          dispatch({
            type: "LOGIN_SUCCESS",
            payload: { user: apiUser, token: data.session.access_token },
          });
          if (apiUser.pitches) reduxDispatch(setPitches(apiUser.pitches));

          // Show toast only once per 3 seconds to prevent duplicates
          const now = Date.now();
          if (now - lastToastTimeRef.current.login > 3000) {
            lastToastTimeRef.current.login = now;
            toast.success("Login Successful!");
          }

          return true;
        }

        return false;
      } catch (error) {
        console.error(error);
        // Skip logging expected auth errors to Sentry (e.g., invalid credentials)
        // logError('Failed to login with Supabase', error, { section: 'auth_context' });
        dispatch({ type: "LOGIN_FAIL" });
        toast.error("Login failed: " + (error as Error).message);
        return false;
      } finally {
        isLoginInProgressRef.current = false;
      }
    },
    [],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (isLoginInProgressRef.current) {
        return false;
      }

      isLoginInProgressRef.current = true;
      dispatch({ type: "LOGIN_START" });

      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        console.log("[AuthContext] SignUp result:", {
          hasSession: !!data.session,
          hasUser: !!data.user,
          userConfirmed: data.user?.email_confirmed_at,
          error: error?.message,
        });

        if (error) {
          throw error;
        }

        if (data.session && data.user) {
          console.log("[AuthContext] User has immediate session - logging in");
          // Call our backend to create user and get user data
          const { user: apiUser } = await authService.loginWithSupabase(
            data.session.access_token,
          );
          dispatch({
            type: "LOGIN_SUCCESS",
            payload: { user: apiUser, token: data.session.access_token },
          });
          if (apiUser.pitches) reduxDispatch(setPitches(apiUser.pitches));
          return true;
        } else {
          console.log(
            "[AuthContext] No immediate session - email confirmation required",
          );
          dispatch({ type: "LOGIN_FAIL" });
          return false;
        }
      } catch (error) {
        logError("Failed to sign up with Supabase", error, {
          section: "auth_context",
        });
        dispatch({ type: "LOGIN_FAIL" });
        toast.error("Sign up failed: " + (error as Error).message);
        return false;
      } finally {
        isLoginInProgressRef.current = false;
      }
    },
    [],
  );

  const sendMagicLink = useCallback(async (email: string): Promise<boolean> => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        throw error;
      }

      toast.success("Magic link sent! Check your email.");
      return true;
    } catch (error) {
      logError("Failed to send magic link", error, { section: "auth_context" });
      toast.error("Failed to send magic link: " + (error as Error).message);
      return false;
    }
  }, []);

  const forgotPassword = useCallback(
    async (email: string): Promise<boolean> => {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/reset-password`,
        });

        if (error) {
          throw error;
        }

        toast.success("Password reset link sent! Check your email.");
        return true;
      } catch (error) {
        logError("Failed to send password reset email", error, {
          section: "auth_context",
        });
        toast.error(
          "Failed to send password reset email: " + (error as Error).message,
        );
        return false;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      if (state.isMiniApp) {
        console.log("[AuthContext] Logging out from Mini App");
        // Clear MiniKit session via backend (clears HTTP-only cookie)
        await authService.logoutFromMiniKit();
      } else {
        console.log("[AuthContext] Logging out from Web");
        // Sign out from Supabase
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.error("Error during logout:", error);
    }

    // Clear local auth state
    dispatch({ type: "LOGOUT" });

    // Show toast only once per 3 seconds to prevent duplicates
    const now = Date.now();
    if (now - lastToastTimeRef.current.logout > 3000) {
      lastToastTimeRef.current.logout = now;
      toast.info("You have been logged out.");
    }
  }, [state.isMiniApp]);

  const loginWithMiniKit = useCallback(
    async (
      minikitResult: any,
      walletAddress: string,
      userInfo: {
        username: string | undefined;
        fid: number | undefined;
        pfp: string | undefined;
      },
    ): Promise<boolean> => {
      if (isLoginInProgressRef.current) {
        return false;
      }

      isLoginInProgressRef.current = true;

      try {
        // Call our backend to create/update user and get user data
        const { user: apiUser } = await authService.loginWithMiniKit(
          minikitResult,
          walletAddress,
          userInfo,
        );

        // Token is now stored in HTTP-only cookie, no need to store locally
        dispatch({
          type: "LOGIN_SUCCESS",
          payload: {
            user: apiUser,
            token: "cookie",
          }, // Use 'cookie' as placehoLogin success with MiniKit token addedlder
        });

        if (apiUser.pitches) reduxDispatch(setPitches(apiUser.pitches));

        // Show toast only once per 3 seconds to prevent duplicates
        const now = Date.now();
        if (now - lastToastTimeRef.current.login > 3000) {
          lastToastTimeRef.current.login = now;
          toast.success("MiniKit authentication successful!");
        }

        return true;
      } catch (error) {
        console.error("MiniKit authentication failed:", error);
        dispatch({ type: "LOGIN_FAIL" });
        toast.error(
          "MiniKit authentication failed: " + (error as Error).message,
        );
        return false;
      } finally {
        isLoginInProgressRef.current = false;
      }
    },
    [reduxDispatch],
  );

  // Get current token synchronously
  const getToken = useCallback((): string | null => {
    // Return current state token first, then check Supabase session
    // For MiniKit, tokens are in HTTP-only cookies and handled by the backend
    return state.token || supabaseSession?.access_token || null;
  }, [state.token, supabaseSession]);

  // Hydration effect - waits for platform detection before starting auth
  useEffect(() => {
    const hydrateAuth = async () => {
      // Wait for platform detection before proceeding
      if (state.isMiniApp === null) {
        console.log("[AuthContext] Waiting for platform detection...");
        return;
      }

      console.log(
        `[AuthContext] Platform detected: ${state.isMiniApp ? "Mini App" : "Web"}, starting auth flow...`,
      );

      // Use appropriate auth flow based on platform
      if (state.isMiniApp && isAppStarted) {
        handleMiniAppAuthFlow();
      } else if (state.isMiniApp === false) {
        reduxDispatch(setIsAppStarted(true));
        handleWebAuthFlow();
      }

      dispatch({ type: "HYDRATION_COMPLETE" });
    };

    hydrateAuth();
  }, [state.isMiniApp, handleWebAuthFlow, handleMiniAppAuthFlow, isAppStarted]);

  // Supabase session management
  useEffect(() => {
    // Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session } }: { data: { session: Session | null } }) => {
        setSupabaseSession(session);
        setSupabaseUser(session?.user || null);

        if (session && !state.isAuthenticated && !state.isHydrating) {
          // Auto-login with existing Supabase session
          authService
            .loginWithSupabase(session.access_token)
            .then(({ user: apiUser }) => {
              dispatch({
                type: "LOGIN_SUCCESS",
                payload: { user: apiUser, token: session.access_token },
              });
              if (apiUser.pitches) reduxDispatch(setPitches(apiUser.pitches));
            })
            .catch((error) => {
              console.error(
                "Failed to auto-login with Supabase session:",
                error,
              );
            });
        }
      });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event: string, session: Session | null) => {
        setSupabaseSession(session);
        setSupabaseUser(session?.user || null);

        if (event === "SIGNED_IN" && session) {
          if (!state.isAuthenticated) {
            try {
              const { user: apiUser } = await authService.loginWithSupabase(
                session.access_token,
              );
              dispatch({
                type: "LOGIN_SUCCESS",
                payload: { user: apiUser, token: session.access_token },
              });
              if (apiUser.pitches) reduxDispatch(setPitches(apiUser.pitches));
            } catch (error) {
              console.error("Failed to sync Supabase login to backend:", error);
            }
          }
        } else if (event === "SIGNED_OUT") {
          if (state.isAuthenticated) {
            dispatch({ type: "LOGOUT" });
          }
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [state.isAuthenticated, state.isHydrating]);

  // Optionally, add a useEffect to sync pitches if state.user changes:
  useEffect(() => {
    if (state.user && state.user.pitches) {
      reduxDispatch(setPitches(state.user.pitches));
    }
  }, [state.user, reduxDispatch]);

  const contextValue: AuthContextValue = useMemo(
    () => ({
      ...state,
      isLoading: state.isLoading || state.isHydrating,
      login,
      signUp,
      sendMagicLink,
      forgotPassword,
      logout,
      getToken,
      loginWithMiniKit,
      handleMiniAppAuthFlow,
      supabaseSession,
      supabaseUser,
    }),
    [
      state,
      login,
      signUp,
      sendMagicLink,
      forgotPassword,
      logout,
      getToken,
      loginWithMiniKit,
      handleMiniAppAuthFlow,
      supabaseSession,
      supabaseUser,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};
