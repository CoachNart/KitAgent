export * from './robinhoodChain.js';
export * from './robinhoodStockTokens.js';
export * from './morpho.js';
export * from './lighter.js';

export const ecosystemIntegrations={
  robinhoodChain:{chainId:4663,rpc:'https://rpc.mainnet.chain.robinhood.com',explorer:'https://robinhoodchain.blockscout.com'},
  uniswap:{chainId:4663,api:'/api/uniswap',docs:'https://developers.uniswap.org/'},
  morpho:{chainId:4663,api:'https://api.morpho.org',docs:'https://docs.morpho.org/developers/api/get-started/'},
  lighter:{chainId:4663,api:'https://api.rh.lighter.xyz',ui:'https://robinhoodchain.lighter.xyz'},
  bridges:{docs:'https://docs.robinhood.com/chain/bridging/',routes:['Arbitrum canonical bridge','LayerZero OFT / Stargate','Chainlink CCIP / Transporter','Relay','Across','LiFi / 0x']},
  walletData:{partner:'Zerion',chainId:4663},
  oracle:{partner:'Chainlink',chainId:4663},
  tokenTracking:{partner:'CoinGecko',chainId:4663},
  analytics:{partner:'Allium',chainId:4663},
};
