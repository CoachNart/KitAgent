// Legacy wallet compatibility shim.
// Wallet connection was removed from the active KitSetups app. This module
// intentionally does not initialize MetaMask, WalletConnect, Reown, Wagmi,
// or any injected wallet provider. It remains only so older imports cannot
// crash the application.

export async function connectWallet() {
  throw new Error('Wallet connection is no longer available in KitSetups.');
}

export async function disconnectWallet() {}
export function getActiveProvider() { return null; }
export function getConnectedAddress() { return ''; }
export function isWalletConnected() { return false; }
export async function resumePendingWalletConnection() { return null; }
