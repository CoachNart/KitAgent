import { createAdapter } from '../engine/adapterRegistry.js';

const FAUCET = 'https://faucet.testnet.chain.robinhood.com';
const NFT_MARKETPLACES = [
  { name: 'OpenSea', url: 'https://opensea.io', note: 'Robinhood Chain NFTs are supported.' },
  { name: 'HOODIES Marketplace', url: 'https://www.robinhoodnfts.com/marketplace/', note: 'Chain-native marketplace with live listing and trading.' },
  { name: 'Quiver', url: 'https://www.quivermarket.fun/', note: 'Robinhood Chain NFT marketplace.' },
];

export const discoveryAdapter = createAdapter({
  id: 'discovery',
  name: 'Robinhood Chain discovery services',
  capabilities: ['faucet-discovery', 'airdrop-discovery', 'nft-marketplace-discovery', 'bridge-discovery', 'defi-discovery'],
  chains: [4663, 46630],
  discover: async ({ kind } = {}) => {
    if (kind === 'faucet') return [{ name: 'Robinhood Chain Testnet Faucet', url: FAUCET, chainId: 46630, action: 'Open faucet and request test ETH' }];
    if (kind === 'nft-marketplace') return NFT_MARKETPLACES;
    if (kind === 'bridge') return [{ name: 'Robinhood Chain bridge routes', url: 'https://docs.robinhood.com/chain/bridging/', note: 'Official bridge documentation and supported routes.' }];
    if (kind === 'defi') return [{ name: 'Uniswap', url: 'https://app.uniswap.org/', capability: 'swap' }, { name: 'Morpho', url: 'https://app.morpho.org/', capability: 'lending/borrowing' }, { name: 'Lighter', url: 'https://lighter.xyz/', capability: 'perpetuals' }];
    if (kind === 'airdrop') return [{ name: 'On-chain eligibility scan', note: 'Inspect wallet activity and supported campaign sources before presenting any claim.' }];
    return [];
  },
});

export const DISCOVERY_LINKS = { faucet: FAUCET, nftMarketplaces: NFT_MARKETPLACES };
