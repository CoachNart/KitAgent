// Compatibility shim for any cached/older build references.
// The active wallet implementation lives in walletkit.jsx.
export { connectWallet, disconnectWallet, getActiveProvider, getConnectedAddress, isWalletConnected, resumePendingWalletConnection } from './walletkit.jsx';
