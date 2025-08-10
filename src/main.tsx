import { StrictMode } from "react";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { Provider as ReduxProvider } from "react-redux";
import { RouterProvider } from "react-router-dom";
import { PersistGate } from "redux-persist/integration/react";
import { Toaster } from "sonner";
import { http } from "viem";
import { base } from "viem/chains";
import { WagmiProvider } from "wagmi";

import OnboardScreen from "./components/MiniAppOnboardScreen";
import BuyCreditDrawer from "./components/drawers/buyCredit";
import { AuthModal } from "./components/modals/AuthModal";
import { PurchaseModal } from "./components/modals/PurchaseModal";
import CDPDebugPanel from "./components/debug/CDPDebugPanel";
import { AuthProvider } from "./contexts/AuthContext";
import { AvatarChatProvider } from "./contexts/AvatarChatContext";
import "./index.css";
import { initPostHog } from "./lib/posthog";
import { SentryErrorBoundary, initSentry } from "./lib/sentry";
import { MiniKitContextProvider } from "./provider/minikit";
import { AppOnchainKitProvider } from "./provider/OnchainKitProvider";
import router from "./router";
import { persistor, store } from "./store";

// Initialize monitoring
initSentry();
initPostHog();

export const SupportedChian = base;

export const wagmiConfig = getDefaultConfig({
  appName: "AIShark.fun",
  projectId: "dbc24917e43423d43b430761e8b569ce",
  chains: [SupportedChian],
  transports: {
    [SupportedChian.id]: http(),
  },
});

const theme = darkTheme({
  accentColor: "transparent",
  accentColorForeground: "#F2C431",
  borderRadius: "medium",
  fontStack: "rounded",
  overlayBlur: "small",
});

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ReduxProvider store={store}>
      <SentryErrorBoundary
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        fallback={({ error: _error, resetError }) => (
          <div className="flex min-h-screen items-center justify-center bg-gray-100">
            <div className="rounded-lg bg-white p-8 shadow-lg">
              <h2 className="mb-4 text-xl font-bold text-red-600">
                Something went wrong
              </h2>
              <p className="mb-4 text-gray-600">
                An unexpected error occurred. Our team has been notified.
              </p>
              <button
                onClick={resetError}
                className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      >
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <AppOnchainKitProvider>
              <RainbowKitProvider theme={theme} modalSize="compact">
                <MiniKitContextProvider>
                  <AuthProvider>
                    <AvatarChatProvider>
                      <PersistGate loading={null} persistor={persistor}>
                        <OnboardScreen />
                        <RouterProvider router={router} />
                        <BuyCreditDrawer />
                        <AuthModal />
                        <PurchaseModal />
                        <Toaster />
                        {/* CDP Debug Panel - Development Only */}
                        {import.meta.env.DEV && <CDPDebugPanel />}
                      </PersistGate>
                    </AvatarChatProvider>
                  </AuthProvider>
                </MiniKitContextProvider>
              </RainbowKitProvider>
            </AppOnchainKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </SentryErrorBoundary>
    </ReduxProvider>
  </StrictMode>,
);
