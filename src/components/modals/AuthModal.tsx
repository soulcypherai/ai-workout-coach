import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { dispatch, useSelector } from "@/store";
import { setAuthModal, setAuthModalMode } from "@/store/slices/modal";
import { Eye, EyeOff, X, WalletMinimal } from "lucide-react";

import { Button } from "@/components/ui/button";

export const AuthModal = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [emailConfirmationSent, setEmailConfirmationSent] = useState(false);
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { login, signUp, sendMagicLink, forgotPassword, isMiniApp,handleMiniAppAuthFlow } = useAuth();

  const {
    isOpen,
    mode,
    data: modalData,
  } = useSelector((state) => state.modal.authModal);

  // Auto-close modal after showing confirmation message
  // useEffect(() => {
  //   if (emailConfirmationSent || passwordResetSent) {
  //     const timer = setTimeout(() => {
  //       setEmailConfirmationSent(false);
  //       setPasswordResetSent(false);
  //       setEmail("");
  //       setPassword("");
  //       setConfirmPassword("");
  //       dispatch(setAuthModal([false]));
  //     }, 5000); // Close after 5 seconds

  //     return () => clearTimeout(timer);
  //   }
  // }, [emailConfirmationSent, passwordResetSent]);

  // 🧹 Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setMagicLinkSent(false);
      setEmailConfirmationSent(false);
      setPasswordResetSent(false);
      setShowPassword(false);
      setShowConfirmPassword(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let success = false;

      if (mode === "magic-link") {
        success = await sendMagicLink(email);
        if (success) {
          setMagicLinkSent(true);
        }
      } else if (mode === "forgot-password") {
        success = await forgotPassword(email);
        if (success) {
          setPasswordResetSent(true);
        }
      } else if (mode === "login") {
        success = await login(email, password);
      } else if (mode === "signup") {
        // Validate password confirmation
        if (password !== confirmPassword) {
          alert("Passwords do not match");
          setIsLoading(false);
          return;
        }
        if (password.length < 6) {
          alert("Password must be at least 6 characters");
          setIsLoading(false);
          return;
        }
        success = await signUp(email, password);
        console.log(
          "[AuthModal] SignUp finished, showing confirmation message",
        );
        setEmailConfirmationSent(true);
      }

      console.log("[AuthModal] Final success:", success, "mode:", mode);
      if (success && mode === "login") {
        console.log("[AuthModal] Closing modal and clearing form");
        dispatch(setAuthModal([false]));
        setEmail("");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (error) {
      console.error("Auth error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-foreground relative mx-4 w-full max-w-md rounded-lg border-2 shadow-lg">
        {/* Close button */}
        <button
          onClick={() => dispatch(setAuthModal([false]))}
          className="absolute top-4 right-4 text-gray-400 transition-colors hover:text-white"
        >
          <X size={20} />
        </button>

        {isMiniApp ? (
          <div className="p-6">
            <div className="mb-5 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
                <WalletMinimal size={28} className="text-black" />
              </div>
              <h2 className="mb-1.5 text-xl font-bold text-white">
                Authentication Required
              </h2>
              <p className="text-sm leading-relaxed text-gray-300">
                {modalData?.description ||
                  "Connect your wallet to access this features "}
              </p>
            </div>

            <Button className="w-full" onClick={()=>handleMiniAppAuthFlow(true)}>Connect Wallet</Button>

            <p className="mt-4 text-center text-xs text-gray-400">
              By connecting, you agree to our Terms of Service and Privacy
              Policy
            </p>
          </div>
        ) : (
          <div className="p-6">
            <h2 className="mb-6 text-center text-2xl font-bold text-white">
              {mode === "login"
                ? "Welcome Back"
                : mode === "signup"
                  ? emailConfirmationSent
                    ? "Confirm Email"
                    : "Create Account"
                  : mode === "magic-link"
                    ? "Magic Link Login"
                    : "Reset Password"}
            </h2>
            {modalData && mode == "login" && (
              <p className="translate-y-[-15px] text-center text-sm text-blue-300">
                {modalData.description}
              </p>
            )}

            {magicLinkSent ? (
              <div className="py-8 text-center">
                <div className="mb-4 text-4xl text-green-500">✓</div>
                <h3 className="mb-2 text-lg font-semibold text-white">
                  Check your email!
                </h3>
                <p className="mb-4 text-gray-300">
                  We've sent a magic link to{" "}
                  <strong className="text-white">{email}</strong>
                </p>
                <p className="text-sm text-gray-400">
                  Click the link in your email to sign in automatically.
                </p>
                <Button
                  onClick={() => {
                    setMagicLinkSent(false);
                    setEmail("");
                    dispatch(setAuthModalMode("login"));
                  }}
                  variant="secondary"
                  className="mt-4"
                >
                  Back to Login
                </Button>
              </div>
            ) : emailConfirmationSent ? (
              <div className="px-6 pt-2 pb-6 text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-600/10">
                  <svg
                    className="h-8 w-8 text-green-500"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M5 13l4 4L19 7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                <p className="mb-4 text-gray-300">
                  A confirmation link has been sent to{" "}
                  <strong className="text-white">{email}</strong>.
                </p>

                <p className="mb-6 text-sm text-gray-400">
                  Please click the link in your inbox to complete your account
                  registration.
                </p>

                <Button
                  onClick={() => {
                    setEmailConfirmationSent(false);
                    setEmail("");
                    setPassword("");
                    setConfirmPassword("");
                    dispatch(setAuthModal([false]));
                  }}
                  className="bg-accent mx-auto w-full max-w-xs text-black"
                  variant="secondary"
                >
                  Close
                </Button>
              </div>
            ) : passwordResetSent ? (
              <div className="py-8 text-center">
                <div className="mb-4 text-4xl text-green-500">✓</div>
                <h3 className="mb-2 text-lg font-semibold text-white">
                  Reset link sent!
                </h3>
                <p className="mb-4 text-gray-300">
                  A password reset link has been sent to{" "}
                  <strong className="text-white">{email}</strong>.
                </p>
                <p className="text-sm text-gray-400">
                  Click the link in your email to reset your password.
                </p>
                <Button
                  onClick={() => {
                    setPasswordResetSent(false);
                    setEmail("");
                    dispatch(setAuthModalMode("login"));
                  }}
                  variant="secondary"
                  className="mt-4"
                >
                  Back to Login
                </Button>
              </div>
            ) : (
              <>
                {/* Email/Password Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-1 block text-sm font-medium text-gray-200"
                    >
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="border-ring bg-input focus:ring-muted-foreground w-full rounded-md border px-3 py-2 text-white placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                      placeholder="Enter your email"
                    />
                  </div>

                  {mode !== "magic-link" && mode !== "forgot-password" && (
                    <>
                      <div>
                        <label
                          htmlFor="password"
                          className="mb-1 block text-sm font-medium text-gray-200"
                        >
                          Password
                        </label>
                        <div className="relative">
                          <input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                            className="border-ring bg-input focus:ring-muted-foreground w-full rounded-md border px-3 py-2 pr-10 text-white placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                            placeholder="Enter your password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 transition-colors hover:text-white"
                          >
                            {showPassword ? (
                              <EyeOff size={16} />
                            ) : (
                              <Eye size={16} />
                            )}
                          </button>
                        </div>
                      </div>

                      {mode === "signup" && (
                        <div>
                          <label
                            htmlFor="confirmPassword"
                            className="mb-1 block text-sm font-medium text-gray-200"
                          >
                            Confirm Password
                          </label>
                          <div className="relative">
                            <input
                              id="confirmPassword"
                              type={showConfirmPassword ? "text" : "password"}
                              value={confirmPassword}
                              onChange={(e) =>
                                setConfirmPassword(e.target.value)
                              }
                              required
                              minLength={6}
                              className="border-ring bg-input focus:ring-muted-foreground w-full rounded-md border px-3 py-2 pr-10 text-white placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                              placeholder="Confirm your password"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowConfirmPassword(!showConfirmPassword)
                              }
                              className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 transition-colors hover:text-white"
                            >
                              {showConfirmPassword ? (
                                <EyeOff size={16} />
                              ) : (
                                <Eye size={16} />
                              )}
                            </button>
                          </div>
                          {password &&
                            confirmPassword &&
                            password !== confirmPassword && (
                              <p className="mt-1 text-sm text-red-400">
                                Passwords do not match
                              </p>
                            )}
                        </div>
                      )}
                    </>
                  )}

                  <Button type="submit" disabled={isLoading} className="w-full">
                    {isLoading
                      ? "Loading..."
                      : mode === "login"
                        ? "Sign In"
                        : mode === "signup"
                          ? "Sign Up"
                          : mode === "forgot-password"
                            ? "Send Reset Link"
                            : "Send Magic Link"}
                  </Button>
                </form>

                {/* Forgot Password Link - Only show for login mode */}
                {mode === "login" && (
                  <div className="mt-4 text-center">
                    <button
                      onClick={() =>
                        dispatch(setAuthModalMode("forgot-password"))
                      }
                      className="text-sm text-blue-300 transition-colors hover:text-blue-300"
                    >
                      Forgot your password?
                    </button>
                  </div>
                )}

                {/* Mode Switch */}
                <div className="mt-6 space-y-2 text-center">
                  <p className="text-sm text-gray-400">
                    {mode === "login"
                      ? "Don't have an account?"
                      : mode === "signup"
                        ? "Already have an account?"
                        : mode === "forgot-password"
                          ? "Remember your password?"
                          : "Prefer password login?"}
                    <button
                      onClick={() =>
                        dispatch(
                          setAuthModalMode(
                            mode === "login"
                              ? "signup"
                              : mode === "signup"
                                ? "login"
                                : mode === "forgot-password"
                                  ? "login"
                                  : "login",
                          ),
                        )
                      }
                      className="ml-1 font-medium text-blue-300 transition-colors hover:text-blue-300"
                    >
                      {mode === "login"
                        ? "Sign up"
                        : mode === "signup"
                          ? "Sign in"
                          : mode === "forgot-password"
                            ? "Back to login"
                            : "Use password"}
                    </button>
                  </p>

                  {mode !== "magic-link" && mode !== "forgot-password" && (
                    <p className="text-sm text-gray-400">
                      <button
                        onClick={() => dispatch(setAuthModalMode("magic-link"))}
                        className="font-medium text-blue-300 transition-colors hover:text-blue-300"
                      >
                        Or send me a magic link
                      </button>
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
