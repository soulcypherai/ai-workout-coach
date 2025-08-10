/**
 * OnchainKit Provider Setup for CDP functionality
 */

import { OnchainKitProvider } from '@coinbase/onchainkit';
import { ReactNode } from 'react';
import { base } from 'viem/chains';

interface AppOnchainKitProviderProps {
  children: ReactNode;
}

export const AppOnchainKitProvider = ({ children }: AppOnchainKitProviderProps) => {
  const apiKey = import.meta.env.VITE_CDP_API_KEY;
  
  return (
    <OnchainKitProvider
      apiKey={apiKey}
      chain={base}
      config={{
        appearance: {
          name: 'AI Shark',
          logo: '/watermark-logo.png',
        },
      }}
    >
      {children}
    </OnchainKitProvider>
  );
};
