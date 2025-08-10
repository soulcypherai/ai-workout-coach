import { ReactNode, useEffect } from "react";

import { MiniKitProvider, useMiniKit } from "@coinbase/onchainkit/minikit";
import { baseSepolia } from "wagmi/chains";

interface MiniKitContextProviderProps {
  children: ReactNode;
}

// Inner component to handle frame-ready logic
function MiniKitFrameHandler({ children }: { children: ReactNode }) {
  const { setFrameReady, isFrameReady, context } = useMiniKit();

  useEffect(() => {
    if (!isFrameReady && context) {
      setFrameReady();
    }
  }, [isFrameReady, setFrameReady, context]);

  return <>{children}</>;
}

export function MiniKitContextProvider({
  children,
}: MiniKitContextProviderProps) {
  return (
    <MiniKitProvider
      apiKey={import.meta.env.VITE_CDP_API_KEY as string}
      chain={baseSepolia}
      config={{
        appearance: {
          mode: "auto",
          theme: "mini-app-theme",
          name: "AI-SHARK.FUN",
          logo: "https://bw-extraction-screen-finger.trycloudflare.com/fav.png",
        },
      }}
    >
      <MiniKitFrameHandler>{children}</MiniKitFrameHandler>
    </MiniKitProvider>
  );
}
