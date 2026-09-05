export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const CHAINS = {
  robinhood: { id: 4663, hex: '0x1237', name: 'Robinhood Chain', native: 'ETH', rpc: 'https://rpc.mainnet.chain.robinhood.com', explorer: 'https://robinhoodchain.blockscout.com', testnet: false },
  robinhoodTestnet: { id: 46630, hex: '0xb5c6', name: 'Robinhood Chain Testnet', native: 'ETH', rpc: 'https://rpc.testnet.chain.robinhood.com', explorer: 'https://explorer.testnet.chain.robinhood.com', faucet: 'https://faucet.testnet.chain.robinhood.com', testnet: true },
};
export const TOKENS = {
  4663: {
    ETH: { symbol:'ETH', name:'Ether', decimals:18, address:ZERO_ADDRESS, verified:true },
    WETH: { symbol:'WETH', name:'Wrapped Ether', decimals:18, address:'0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', verified:true },
    USDG: { symbol:'USDG', name:'USDG', decimals:18, address:'0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', verified:true },
  },
  46630: { ETH: { symbol:'ETH', name:'Ether', decimals:18, address:ZERO_ADDRESS, verified:true } },
};
export const getToken = (chainId, value) => {
  const list = TOKENS[chainId] || {};
  if (!value) return null;
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) return Object.values(list).find(t=>t.address.toLowerCase()===value.toLowerCase()) || {address:value, symbol:'TOKEN', decimals:18, verified:false};
  return list[String(value).toUpperCase()] || null;
};
export const chainById = id => Object.values(CHAINS).find(c=>c.id===Number(id));
