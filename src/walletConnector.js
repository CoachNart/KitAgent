import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { getAccount, watchAccount } from '@wagmi/core';
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
const wagmiAdapter = new WagmiAdapter({ networks, projectId: PROJECT_ID, ssr: false });
const wagmiConfig = wagmiAdapter.wagmiConfig;

export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: ROBINHOOD_CHAIN,
  projectId: PROJECT_ID,
  metadata,
  customRpcUrls: { 'eip155:4663': [{ url: 'https://rpc.mainnet.chain.robinhood.com' }] },
  features: { analytics: true, email: false, socials: [] },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#00C7FE',
    '--w3m-color-mix': '#00C7FE',
    '--w3m-color-mix-strength': 18
  }
});

if (typeof window !== 'undefined') window.__kitagentAppKit = appKit;

function accountState() {
  const account = getAccount(wagmiConfig);
  return { isConnected: Boolean(account.isConnected && account.address), address: account.address || '' };
}

let providerPromise = null;

function waitForConnection(timeoutMs = 120000) {
  const current = accountState();
  if (current.isConnected) {
    return Promise.resolve({ address: current.address, provider: appKit.getWalletProvider?.() || null });
  }
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
      unsubscribe = watchAccount(wagmiConfig, {
        onChange(account) {
          if (account.isConnected && account.address) {
            finish({ address: account.address, provider: appKit.getWalletProvider?.() || null });
          }
        }
      });
    } catch (error) {
      finish(null, error);
      return;
    }
    timer = setTimeout(() => finish(null, new Error('Wallet connection timed out. Please choose a wallet and try again.')), timeoutMs);
  });
  return providerPromise;
}

export async function connectWallet() {
  try {
    const current = accountState();
    if (!current.isConnected) await appKit.open({ view: 'Connect' });
    const result = await waitForConnection();
    try {
      if (typeof appKit.switchNetwork === 'function') await appKit.switchNetwork(ROBINHOOD_CHAIN);
    } catch (_) {}
    return { address: result.address, provider: appKit.getWalletProvider?.() || result.provider || null };
  } catch (error) {
    providerPromise = null;
    throw error;
  }
}

export async function resumePendingWalletConnection() {
  const current = accountState();
  if (!current.isConnected) return null;
  return { address: current.address, provider: appKit.getWalletProvider?.() || null };
}

export function getActiveProvider() {
  return appKit.getWalletProvider?.() || null;
}

export function getConnectedAddress() {
  return accountState().address;
}

export function isWalletConnected() {
  return accountState().isConnected;
}

export async function disconnectWallet() {
  if (typeof appKit.disconnect === 'function') await appKit.disconnect();
}
