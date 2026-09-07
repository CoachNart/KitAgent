import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { getAccount, watchAccount } from '@wagmi/core';
import { defineChain } from '@reown/appkit/networks';

const PROJECT_ID = import.meta.env.VITE_REOWN_PROJECT_ID || '94314a4ef9da3dd09a3b858adef7819e';
const ROBINHOOD_RPC = 'https://rpc.mainnet.chain.robinhood.com';

export const ROBINHOOD_CHAIN = defineChain({
  id: 4663,
  caipNetworkId: 'eip155:4663',
  chainNamespace: 'eip155',
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [ROBINHOOD_RPC] },
    public: { http: [ROBINHOOD_RPC] }
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
const customRpcUrls = { 'eip155:4663': [{ url: ROBINHOOD_RPC }] };

// Keep the same RPC configuration in both AppKit and Wagmi. This is important
// for custom EVM networks so the wallet adapter and modal share one chain config.
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId: PROJECT_ID,
  ssr: false,
  customRpcUrls
});
const wagmiConfig = wagmiAdapter.wagmiConfig;

export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: ROBINHOOD_CHAIN,
  projectId: PROJECT_ID,
  metadata,
  customRpcUrls,
  // Prefer universal links on mobile when the selected wallet supports them.
  // AppKit 1.8.23 includes a fix for persisting this deeplink choice.
  experimental_preferUniversalLinks: true,
  allWallets: 'ONLY_MOBILE',
  enableWallets: true,
  enableReconnect: true,
  enableNetworkSwitch: true,
  enableMobileFullScreen: true,
  // Analytics must never sit on the critical wallet-connect path. This also
  // avoids telemetry failures looking like a wallet/payment publish failure.
  features: { analytics: false, email: false, socials: [] },
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

function waitForConnection(timeoutMs = 35000) {
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
    timer = setTimeout(() => finish(null, new Error('Wallet handoff timed out. The wallet app was not opened, so no transaction or payment was published.')), timeoutMs);
  });
  return providerPromise;
}

export async function connectWallet() {
  try {
    const current = accountState();
    if (!current.isConnected) await appKit.open({ view: 'Connect', namespace: 'eip155' });
    const result = await waitForConnection();

    // Do not immediately issue a second WalletConnect request for a network
    // switch. On mobile this can race the first deep-link handoff and leave the
    // wallet modal spinning. Network switching is requested only when an action
    // actually needs Robinhood Chain.
    return { address: result.address, provider: appKit.getWalletProvider?.() || result.provider || null };
  } catch (error) {
    providerPromise = null;
    try { if (typeof appKit.close === 'function') await appKit.close(); } catch (_) {}
    try { if (typeof appKit.disconnect === 'function') await appKit.disconnect(); } catch (_) {}
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
