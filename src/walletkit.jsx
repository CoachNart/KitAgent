import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { arbitrum } from '@reown/appkit/networks';
import { QueryClient } from '@tanstack/react-query';

// Reown project IDs are public client configuration, not wallet credentials.
// Keep the deployment working even when Vercel env vars are not present.
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '94314a4ef9da3dd09a3b858adef781e9';

export const walletKitConfigured = Boolean(projectId);
export const queryClient = new QueryClient();

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [arbitrum],
  ssr: false,
});

export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks: [arbitrum],
  defaultNetwork: arbitrum,
  projectId,
  metadata: {
    name: 'KitSetups',
    description: 'KitSetups perpetual trading terminal',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://kitsetups.vercel.app',
    icons: [typeof window !== 'undefined' ? `${window.location.origin}/kitagent-logo.svg` : 'https://kitsetups.vercel.app/kitagent-logo.svg'],
  },
  features: {
    analytics: false,
    email: false,
    socials: [],
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#00C7FE',
    '--w3m-color-mix': '#00C7FE',
    '--w3m-color-mix-strength': 18,
  },
});