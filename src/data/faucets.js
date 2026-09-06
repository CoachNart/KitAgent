export const faucetSources = {
  Sepolia: [
    { name: 'Alchemy Sepolia Faucet', url: 'https://www.alchemy.com/faucets/ethereum-sepolia' },
    { name: 'Chainstack Sepolia Faucet', url: 'https://faucet.chainstack.com/sepolia-faucet' },
    { name: 'QuickNode Sepolia Faucet', url: 'https://faucet.quicknode.com/ethereum/sepolia' },
  ],
  'Arbitrum Sepolia': [
    { name: 'Alchemy Arbitrum Sepolia Faucet', url: 'https://www.alchemy.com/faucets/arbitrum-sepolia' },
    { name: 'Chainlink Arbitrum Sepolia Faucet', url: 'https://faucets.chain.link/arbitrum-sepolia' },
    { name: 'QuickNode Arbitrum Sepolia Faucet', url: 'https://faucet.quicknode.com/arbitrum/sepolia' },
  ],
  'Optimism Sepolia': [
    { name: 'Alchemy Optimism Faucet', url: 'https://www.alchemy.com/faucets/optimism-sepolia' },
    { name: 'Chainlink Optimism Faucet', url: 'https://faucets.chain.link/optimism-sepolia' },
  ],
};

export function getFaucets(network) {
  return faucetSources[network] || [];
}
