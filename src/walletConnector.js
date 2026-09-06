import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { defineChain } from '@reown/appkit/networks';

const PROJECT_ID = import.meta.env.VITE_REOWN_PROJECT_ID || '94314a4ef9da3dd09a3b858adef7819e';

export const ROBINHOOD_CHAIN = defineChain({
  id: 4663,
  caipNetworkId: 'eip155:4663',
  chainNamespace: 'eip155',
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
    public: { http: ['https://rpc.mainnet.chain.robinhood.com'] }
  },
  blockExplorers: {
    default: { name: 'Robinhood Chain Explorer', url: 'https://robinhoodchain.blockscout.com' }
  }
});

const metadata = {
  name: 'KitAgent',
  description: 'AI command center for the onchain markets',
  url: window.location.origin,
  icons: [`${window.location.origin}/kitagent-logo.svg`]
};

const networks = [ROBINHOOD_CHAIN];
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId: PROJECT_ID,
  ssr: false
});

export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: ROBINHOOD_CHAIN,
  projectId: PROJECT_ID,
  metadata,
  customRpcUrls: {
    'eip155:4663': [{ url: 'https://rpc.mainnet.chain.robinhood.com' }]
  },
  features: {
    analytics: true,
    email: false,
    socials: []
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#00C7FE',
    '--w3m-color-mix': '#00C7FE',
    '--w3m-color-mix-strength': 18
  }
});

if (typeof window !== 'undefined') window.__kitagentAppKit = appKit;

let providerPromise = null;

function waitForConnection(timeoutMs = 120000) {
  if (appKit.getIsConnected() && appKit.getAddress()) return Promise.resolve({ address: appKit.getAddress(), provider: appKit.getWalletProvider() });
  if (providerPromise) return providerPromise;

  providerPromise = new Promise((resolve, reject) => {
    let timer;
    let unsubscribe;
    const finish = (result, error) => {
      if (timer) clearTimeout(timer);
      if (typeof unsubscribe === 'function') unsubscribe();
      providerPromise = null;
      if (error) reject(error); else resolve(result);
    };

    try {
      unsubscribe = appKit.subscribeProvider(state => {
        if (state?.isConnected && state?.address) {
          finish({ address: state.address, provider: state.provider || appKit.getWalletProvider() });
        }
      });
    } catch (e) {
      finish(null, e);
      return;
    }

    timer = setTimeout(() => finish(null, new Error('Wallet connection timed out. Please choose a wallet and try again.')), timeoutMs);
  });

  return providerPromise;
}

export async function connectWallet() {
  try {
    if (!appKit.getIsConnected()) {
      appKit.open({ view: 'Connect' });
    }
    const result = await waitForConnection();
    if (appKit.getChainId() !== 4663) {
      try { await appKit.switchNetwork(ROBINHOOD_CHAIN); } catch (_) {}
    }
    return { address: result.address, provider: appKit.getWalletProvider() || result.provider };
  } catch (e) {
    providerPromise = null;
    throw e;
  }
}

export function getActiveProvider() {
  return appKit.getWalletProvider();
}

export function getConnectedAddress() {
  return appKit.getAddress() || '';
}

export function isWalletConnected() {
  return Boolean(appKit.getIsConnected() && appKit.getAddress());
}

export async function disconnectWallet() {
  await appKit.disconnect();
}
