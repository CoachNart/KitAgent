import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { arbitrum } from '@reown/appkit/networks';
import { QueryClient } from '@tanstack/react-query';

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

export const walletKitConfigured = Boolean(projectId);
export const queryClient = new QueryClient();

export const wagmiAdapter = walletKitConfigured
  ? new WagmiAdapter({ projectId, networks: [arbitrum], ssr: false })
  : null;

export const appKit = walletKitConfigured
  ? createAppKit({
      adapters: [wagmiAdapter],
      networks: [arbitrum],
      projectId,
      metadata: {
        name: 'KitSetups',
        description: 'KitSetups perpetual trading terminal',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://kitsetups.vercel.app',
      },
      features: { analytics: false },
    })
  : null;
